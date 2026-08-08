(() => {
  'use strict';

  const STORAGE_KEY = 'rideTracker.community.v1';
  const SCHEMA_VERSION = '1.0.0';
  const VISIBILITIES = Object.freeze(['draft', 'private', 'friends', 'public']);
  const clean = value => String(value ?? '').trim();
  const iso = value => {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  };
  const clone = value => JSON.parse(JSON.stringify(value));

  function normalizeVisibility(value, fallback = 'private') {
    const normalized = clean(value).toLowerCase();
    return VISIBILITIES.includes(normalized) ? normalized : fallback;
  }

  function normalizeProfile(profile = {}, idFactory = () => 'local-guest') {
    return {
      id: clean(profile.id) || idFactory(),
      pseudonym: clean(profile.pseudonym) || 'RideTracker Gast',
      bio: clean(profile.bio),
      avatar: clean(profile.avatar) || '🎢',
      defaultVisibility: normalizeVisibility(profile.defaultVisibility),
      shareExactTrack: profile.shareExactTrack === true,
      endpointPrivacyMeters: Math.max(0, Math.min(5000, Number(profile.endpointPrivacyMeters) || 250)),
      updatedAt: iso(profile.updatedAt),
    };
  }

  function normalizeRide(ride = {}, profile = {}) {
    const id = clean(ride.id || ride.rideId);
    if (!id) throw new Error('Community ride requires an id');
    const visibility = normalizeVisibility(ride.visibility, normalizeVisibility(profile.defaultVisibility));
    return {
      id,
      communityId: clean(ride.communityId) || `local:${id}`,
      title: clean(ride.title) || 'Unbenannte Fahrt',
      parkName: clean(ride.parkName || ride.park),
      rideName: clean(ride.rideName || ride.track),
      description: clean(ride.description || ride.comment),
      visibility,
      publicationState: visibility === 'public' ? 'ready-for-backend' : visibility === 'draft' ? 'draft' : 'local',
      shareExactTrack: ride.shareExactTrack === true,
      endpointPrivacyMeters: Math.max(0, Math.min(5000, Number(ride.endpointPrivacyMeters) || Number(profile.endpointPrivacyMeters) || 250)),
      qualityScore: Number.isFinite(Number(ride.qualityScore)) ? Math.max(0, Math.min(1, Number(ride.qualityScore))) : null,
      createdAt: iso(ride.createdAt),
      updatedAt: iso(ride.updatedAt),
    };
  }

  function normalizeState(value = {}, idFactory) {
    const profile = normalizeProfile(value.profile, idFactory);
    const rides = {};
    const source = value.rides && typeof value.rides === 'object' ? value.rides : {};
    for (const [key, ride] of Object.entries(source)) {
      try {
        const normalized = normalizeRide({ id:key, ...ride }, profile);
        rides[normalized.id] = normalized;
      } catch (_) {}
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      profile,
      rides,
      moderation: {
        hiddenRideIds: Array.isArray(value.moderation?.hiddenRideIds) ? [...new Set(value.moderation.hiddenRideIds.map(clean).filter(Boolean))] : [],
      },
      updatedAt: iso(value.updatedAt),
    };
  }

  function createStore(storage = globalThis.localStorage, options = {}) {
    const idFactory = options.idFactory || (() => globalThis.crypto?.randomUUID?.() || `local-${Date.now().toString(36)}`);
    function load() {
      let parsed = {};
      try { parsed = JSON.parse(storage?.getItem?.(STORAGE_KEY) || '{}'); } catch (_) {}
      return normalizeState(parsed, idFactory);
    }
    function save(state) {
      const normalized = normalizeState({ ...state, updatedAt:new Date().toISOString() }, idFactory);
      storage?.setItem?.(STORAGE_KEY, JSON.stringify(normalized));
      return clone(normalized);
    }
    function updateProfile(patch) {
      const state = load();
      state.profile = normalizeProfile({ ...state.profile, ...patch, updatedAt:new Date().toISOString() }, idFactory);
      return save(state).profile;
    }
    function upsertRide(ride) {
      const state = load();
      const previous = state.rides[clean(ride?.id || ride?.rideId)] || {};
      const normalized = normalizeRide({ ...previous, ...ride, updatedAt:new Date().toISOString() }, state.profile);
      state.rides[normalized.id] = normalized;
      save(state);
      return clone(normalized);
    }
    function setVisibility(rideId, visibility) {
      const state = load();
      const current = state.rides[clean(rideId)];
      if (!current) throw new Error(`Unknown community ride: ${rideId}`);
      return upsertRide({ ...current, visibility:normalizeVisibility(visibility), updatedAt:new Date().toISOString() });
    }
    function removeRide(rideId) {
      const state = load();
      const existed = Boolean(state.rides[clean(rideId)]);
      delete state.rides[clean(rideId)];
      save(state);
      return existed;
    }
    function summary() {
      const state = load();
      const rides = Object.values(state.rides);
      const count = visibility => rides.filter(ride => ride.visibility === visibility).length;
      return {
        total: rides.length,
        draft: count('draft'),
        private: count('private'),
        friends: count('friends'),
        public: count('public'),
        readyForBackend: rides.filter(ride => ride.publicationState === 'ready-for-backend').length,
      };
    }
    function publicProjection(rideId) {
      const state = load();
      const ride = state.rides[clean(rideId)];
      if (!ride || ride.visibility !== 'public') return null;
      return {
        schemaVersion: SCHEMA_VERSION,
        communityId: ride.communityId,
        title: ride.title,
        parkName: ride.parkName,
        rideName: ride.rideName,
        description: ride.description,
        qualityScore: ride.qualityScore,
        trackPrivacy: ride.shareExactTrack ? 'exact-opt-in' : `endpoints-redacted-${ride.endpointPrivacyMeters}m`,
        createdAt: ride.createdAt,
        author: { id:state.profile.id, pseudonym:state.profile.pseudonym, avatar:state.profile.avatar },
      };
    }
    return { load, save, updateProfile, upsertRide, setVisibility, removeRide, summary, publicProjection };
  }

  globalThis.RideTrackerCommunityModel = Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    VISIBILITIES,
    normalizeVisibility,
    normalizeProfile,
    normalizeRide,
    normalizeState,
    createStore,
  });
})();
