(function communityBackendFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RideTrackerCommunityBackend = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCommunityBackendModule() {
  'use strict';

  const CONFIG_KEY = 'rideTracker.communityBackend.v1';
  const SESSION_KEY = 'rideTracker.communitySession.v1';
  const DEFAULT_TIMEOUT_MS = 12000;
  const PRIVACY_NOTICE_VERSION = '2026-08-08-v1';

  class CommunityBackendError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = 'CommunityBackendError';
      this.status = details.status || 0;
      this.code = details.code || 'COMMUNITY_BACKEND_ERROR';
      this.details = details.details || null;
    }
  }

  function memoryStorage() {
    const data = new Map();
    return {
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: (key) => data.delete(key)
    };
  }

  function safeJson(value, fallback = null) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function readJson(storage, key, fallback = null) {
    const raw = storage?.getItem?.(key);
    return raw ? safeJson(raw, fallback) : fallback;
  }

  function writeJson(storage, key, value) {
    storage?.setItem?.(key, JSON.stringify(value));
    return value;
  }

  function normalizeUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function decodeJwtPayload(token) {
    try {
      const encoded = String(token || '').split('.')[1];
      if (!encoded) return null;
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = typeof atob === 'function'
        ? atob(normalized)
        : Buffer.from(normalized, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (_) { return null; }
  }

  function isForbiddenKey(key) {
    const value = String(key || '').trim();
    const payload = decodeJwtPayload(value);
    return /service[_-]?role/i.test(value) || payload?.role === 'service_role';
  }

  function validateConfig(input) {
    const url = normalizeUrl(input?.url);
    const publishableKey = String(input?.publishableKey || input?.anonKey || '').trim();
    const privacyNoticeUrl = String(input?.privacyNoticeUrl || '').trim();
    if (!url && !publishableKey) return { enabled: false, url: '', publishableKey: '', privacyNoticeUrl: '' };
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url)) {
      throw new CommunityBackendError('Die Backend-URL muss eine gültige HTTPS-Adresse sein.', { code: 'INVALID_BACKEND_URL' });
    }
    if (publishableKey.length < 20) {
      throw new CommunityBackendError('Der Publishable-/Anon-Key ist unvollständig.', { code: 'INVALID_PUBLISHABLE_KEY' });
    }
    if (isForbiddenKey(publishableKey)) {
      throw new CommunityBackendError('Service-Role-Schlüssel dürfen niemals im Browser gespeichert werden.', { code: 'SERVICE_ROLE_REJECTED' });
    }
    if (privacyNoticeUrl && !/^https:\/\//i.test(privacyNoticeUrl)) {
      throw new CommunityBackendError('Der Datenschutzhinweis muss über eine HTTPS-Adresse erreichbar sein.', { code: 'INVALID_PRIVACY_NOTICE_URL' });
    }
    return { enabled: true, url, publishableKey, privacyNoticeUrl };
  }

  function cleanText(value, maxLength = 160) {
    return String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, maxLength);
  }

  function cleanSlug(value, fallback = 'unbekannt') {
    const text = cleanText(value, 100).toLocaleLowerCase('de-DE')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return text || fallback;
  }

  function finite(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function sanitizeTrackModel(model) {
    if (!model || !Array.isArray(model.points)) return null;
    const allowedMetrics = ['speedKmh', 'normalG', 'lateralG', 'longitudinalG', 'totalG', 'elevationM', 'confidence'];
    const points = model.points.slice(0, 500).map((point, index) => {
      const safe = {
        i: index,
        x: finite(point.x, 0),
        y: finite(point.y, 0),
        z: finite(point.z, 0)
      };
      allowedMetrics.forEach((metric) => {
        const value = finite(point[metric]);
        if (value !== null) safe[metric] = value;
      });
      return safe;
    });
    return {
      version: 1,
      points,
      distanceM: finite(model.distanceM, 0),
      durationMs: finite(model.durationMs, 0),
      sourceCount: Math.max(1, finite(model.sourceCount, 1)),
      ranges: model.ranges && typeof model.ranges === 'object' ? model.ranges : {}
    };
  }

  function createClient(options = {}) {
    const fallbackStorage = memoryStorage();
    const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : fallbackStorage);
    const fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    let config = validateConfig(options.config || readJson(storage, CONFIG_KEY, {}));
    let session = readJson(storage, SESSION_KEY, null);

    function getStatus() {
      const expiresAt = Number(session?.expires_at || 0) * 1000;
      return {
        configured: Boolean(config.enabled),
        authenticated: Boolean(session?.access_token && (!expiresAt || expiresAt > Date.now())),
        user: session?.user || null,
        expiresAt: expiresAt || null,
        url: config.url || ''
      };
    }

    function configure(nextConfig) {
      config = validateConfig(nextConfig);
      if (config.enabled) writeJson(storage, CONFIG_KEY, config);
      else storage?.removeItem?.(CONFIG_KEY);
      return getStatus();
    }

    function requireFetch() {
      if (!config.enabled) throw new CommunityBackendError('Das Community-Backend ist noch nicht konfiguriert.', { code: 'BACKEND_DISABLED' });
      if (!fetchImpl) throw new CommunityBackendError('In dieser Umgebung ist kein Netzwerkzugriff verfügbar.', { code: 'FETCH_UNAVAILABLE' });
    }

    function persistSession(nextSession) {
      session = nextSession || null;
      if (session) writeJson(storage, SESSION_KEY, session);
      else storage?.removeItem?.(SESSION_KEY);
      return session;
    }

    async function rawRequest(path, requestOptions = {}) {
      requireFetch();
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      const accessToken = requestOptions.auth === false ? null : session?.access_token;
      const headers = {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken || config.publishableKey}`,
        Accept: 'application/json',
        ...(requestOptions.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(requestOptions.headers || {})
      };
      try {
        const response = await fetchImpl(`${config.url}${path}`, {
          method: requestOptions.method || 'GET',
          headers,
          body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
          signal: controller?.signal
        });
        const text = await response.text();
        const payload = text ? safeJson(text, text) : null;
        if (!response.ok) {
          throw new CommunityBackendError(
            payload?.msg || payload?.message || payload?.error_description || `Backend-Anfrage fehlgeschlagen (${response.status}).`,
            { status: response.status, code: payload?.code || payload?.error || 'HTTP_ERROR', details: payload }
          );
        }
        return payload;
      } catch (error) {
        if (error instanceof CommunityBackendError) throw error;
        if (error?.name === 'AbortError') {
          throw new CommunityBackendError('Das Community-Backend hat nicht rechtzeitig geantwortet.', { code: 'REQUEST_TIMEOUT' });
        }
        throw new CommunityBackendError(`Community-Backend nicht erreichbar: ${error?.message || error}`, { code: 'NETWORK_ERROR' });
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }

    async function refreshSession() {
      if (!session?.refresh_token) return null;
      const payload = await rawRequest('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', auth: false, body: { refresh_token: session.refresh_token }
      });
      return persistSession(payload);
    }

    async function ensureSession() {
      const expiresAt = Number(session?.expires_at || 0) * 1000;
      if (session?.access_token && (!expiresAt || expiresAt - Date.now() > 60000)) return session;
      if (session?.refresh_token) return refreshSession();
      throw new CommunityBackendError('Bitte zuerst anmelden.', { code: 'AUTH_REQUIRED', status: 401 });
    }

    async function authenticatedRequest(path, requestOptions = {}) {
      await ensureSession();
      try {
        return await rawRequest(path, requestOptions);
      } catch (error) {
        if (error.status !== 401 || !session?.refresh_token) throw error;
        await refreshSession();
        return rawRequest(path, requestOptions);
      }
    }

    async function signUp({ email, password, displayName = '' }) {
      const payload = await rawRequest('/auth/v1/signup', {
        method: 'POST', auth: false,
        body: { email: cleanText(email, 240), password: String(password || ''), data: { display_name: cleanText(displayName, 60) } }
      });
      if (payload?.access_token) persistSession(payload);
      return payload;
    }

    async function signIn({ email, password }) {
      const payload = await rawRequest('/auth/v1/token?grant_type=password', {
        method: 'POST', auth: false,
        body: { email: cleanText(email, 240), password: String(password || '') }
      });
      return persistSession(payload);
    }

    async function signOut() {
      let remoteError = null;
      try {
        if (session?.access_token) await rawRequest('/auth/v1/logout', { method: 'POST' });
      } catch (error) {
        remoteError = { code: error.code, message: error.message };
      } finally { persistSession(null); }
      return { ...getStatus(), remoteError };
    }

    async function rpc(name, args = {}, requestOptions = {}) {
      return authenticatedRequest(`/rest/v1/rpc/${encodeURIComponent(name)}`, {
        method: 'POST', body: args, ...requestOptions
      });
    }

    async function health() {
      if (!config.enabled) return { ok: false, configured: false, message: 'Lokaler Modus aktiv' };
      const startedAt = Date.now();
      try {
        await rawRequest('/rest/v1/', { method: 'GET', auth: false });
        return { ok: true, configured: true, latencyMs: Date.now() - startedAt };
      } catch (error) {
        return { ok: false, configured: true, latencyMs: Date.now() - startedAt, message: error.message, code: error.code };
      }
    }

    async function upsertProfile(profile = {}) {
      return rpc('upsert_my_profile', {
        p_display_name: cleanText(profile.displayName || profile.name, 60),
        p_bio: cleanText(profile.bio, 500),
        p_avatar_url: cleanText(profile.avatarUrl, 500),
        p_visibility: ['private', 'friends', 'public'].includes(profile.visibility) ? profile.visibility : 'friends'
      });
    }

    async function syncRide({ ride, profile = {}, trackModel }) {
      const document = ride?.document || ride || {};
      const metadata = ride?.metadata || document?.metadata || {};
      const safeModel = sanitizeTrackModel(trackModel);
      if (!safeModel?.points?.length) {
        throw new CommunityBackendError('Für diese Fahrt konnte kein 3D-Streckenmodell erzeugt werden.', { code: 'MODEL_REQUIRED' });
      }
      const parkName = cleanText(metadata.parkName || metadata.park || document.parkName || 'Unbekannter Park', 120);
      const attractionName = cleanText(metadata.trackName || metadata.attractionName || metadata.rideName || document.trackName || 'Unbekannte Bahn', 120);
      const rideId = cleanText(ride?.id || document.id || metadata.id || `ride-${Date.now()}`, 120);
      const payload = {
        ride_external_id: rideId,
        park: { external_key: cleanSlug(parkName), name: parkName },
        attraction: { external_key: `${cleanSlug(parkName)}:${cleanSlug(attractionName)}`, name: attractionName },
        recording: {
          started_at: metadata.startedAt || document.startedAt || null,
          duration_ms: finite(safeModel.durationMs, finite(metadata.durationMs, 0)),
          distance_m: finite(safeModel.distanceM, finite(metadata.distanceM, 0)),
          visibility: ['private', 'friends', 'public'].includes(metadata.visibility) ? metadata.visibility : (profile.visibility || 'friends'),
          model: safeModel
        },
        post: {
          title: cleanText(metadata.title || `${attractionName} · ${parkName}`, 160),
          body: cleanText(metadata.note || metadata.description, 1000)
        }
      };
      const serialized = JSON.stringify(payload);
      if (/"(?:latitude|longitude|lat|lon)"\s*:/i.test(serialized)) {
        throw new CommunityBackendError('Rohe GPS-Koordinaten werden aus Datenschutzgründen nicht synchronisiert.', { code: 'RAW_GPS_REJECTED' });
      }
      return rpc('sync_community_ride', { p_payload: payload });
    }

    const listFeed = (limit = 30, offset = 0) => rpc('community_feed', { p_limit: Math.min(100, Math.max(1, limit)), p_offset: Math.max(0, offset) });
    const listFriends = () => rpc('list_my_friends');
    const searchProfiles = (query) => rpc('search_profiles', { p_query: cleanText(query, 80) });
    const sendFriendRequest = (profileId) => rpc('send_friend_request', { p_addressee: profileId });
    const respondFriendRequest = (friendshipId, accepted) => rpc('respond_friend_request', { p_friendship_id: friendshipId, p_accept: Boolean(accepted) });
    const reportContent = ({ targetType, targetId, reason, details }) => rpc('report_content', {
      p_target_type: cleanText(targetType, 30), p_target_id: targetId,
      p_reason: cleanText(reason, 80), p_details: cleanText(details, 1000)
    });
    const listModerationQueue = () => rpc('moderation_queue');
    const moderateReport = ({ reportId, decision, note = '' }) => rpc('moderate_report', {
      p_report_id: reportId, p_decision: cleanText(decision, 30), p_note: cleanText(note, 1000)
    });
    const getMyRole = () => rpc('my_community_role');
    const privacyStatus = () => rpc('privacy_notice_status');
    const acceptPrivacyNotice = () => rpc('accept_privacy_notice', { p_notice_version: PRIVACY_NOTICE_VERSION, p_source: 'web' });
    const revokePrivacyNotice = () => rpc('revoke_privacy_notice');
    const exportMyData = () => rpc('export_my_community_data');
    const eraseMyCommunityData = () => rpc('erase_my_community_data');

    return {
      configure, getStatus, health, signUp, signIn, signOut, refreshSession,
      upsertProfile, syncRide, listFeed, listFriends, searchProfiles,
      sendFriendRequest, respondFriendRequest, reportContent,
      listModerationQueue, moderateReport, getMyRole,
      privacyStatus, acceptPrivacyNotice, revokePrivacyNotice,
      exportMyData, eraseMyCommunityData,
      _debug: { getConfig: () => ({ ...config }), getSession: () => session, sanitizeTrackModel }
    };
  }

  const defaultClient = createClient();
  return { createClient, CommunityBackendError, validateConfig, sanitizeTrackModel, PRIVACY_NOTICE_VERSION, client: defaultClient };
});
