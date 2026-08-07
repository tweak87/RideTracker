(() => {
  'use strict';

  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const db = () => window.RideTrackerDatabase;
  const engine = () => window.RideTrackerReferenceEngine;
  const finite = v => Number.isFinite(Number(v));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  const countryNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['de'], {type:'region'}) : null;
  const countryName = code => { try { return countryNames?.of(code) || code; } catch { return code; } };

  async function fetchOverpass(query, timeoutMs = 18000) {
    let lastError = null;
    for (const endpoint of ENDPOINTS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          headers: { Accept:'application/json' }
        });
        if (!response.ok) throw new Error(`${new URL(endpoint).hostname}: HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        console.warn('[RideTracker park directory]', endpoint, error);
      } finally { clearTimeout(timer); }
    }
    throw lastError || new Error('Keine OpenStreetMap-Abfrage erreichbar.');
  }

  function normalizeElement(element) {
    const tags = element.tags || {};
    const latitude = Number(element.center?.lat ?? element.lat);
    const longitude = Number(element.center?.lon ?? element.lon);
    return {
      provider:'osm',
      id:`${element.type}/${element.id}`,
      name:tags.name || tags['name:de'] || 'Unbenannter Park',
      latitude,
      longitude,
      tags,
      wikidata:tags.wikidata || null,
      raw:element
    };
  }

  async function readCache(code) {
    const database = db();
    if (!database) return null;
    try { return (await database.get(database.stores.cache, `reference:country-parks:${code}`))?.value || null; }
    catch { return null; }
  }
  async function saveCache(code, parks) {
    const database = db();
    if (!database) return;
    try { await database.put(database.stores.cache, `reference:country-parks:${code}`, {savedAt:Date.now(), value:parks}); } catch (_) {}
  }

  async function lightweightParks(code, {force=false} = {}) {
    code = String(code || '').toUpperCase();
    if (!force) {
      const cached = await readCache(code);
      if (cached?.length) return cached;
      const offline = await engine()?.countryPack?.(code);
      if (offline?.parks?.length) return offline.parks;
    }
    const query = `[out:json][timeout:18];area["ISO3166-1"="${code}"][boundary="administrative"]->.country;(nwr(area.country)["tourism"="theme_park"];nwr(area.country)["leisure"="amusement_park"];);out center tags;`;
    const data = await fetchOverpass(query, 22000);
    const seen = new Set();
    const parks = (data.elements || []).map(normalizeElement).filter(p => {
      if (!p.name || !finite(p.latitude) || !finite(p.longitude)) return false;
      const key = norm(p.name);
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a,b) => a.name.localeCompare(b.name, 'de'));
    await saveCache(code, parks);
    return parks;
  }

  async function attractionsForPark(park, code) {
    try {
      const items = await engine()?.attractionsForPark?.(park, code);
      if (items?.length) return items;
    } catch (error) { console.warn('[RideTracker attractions provider]', error); }
    if (!finite(park?.latitude) || !finite(park?.longitude)) return [];
    const query = `[out:json][timeout:15];(nwr(around:4000,${park.latitude},${park.longitude})["roller_coaster"];nwr(around:4000,${park.latitude},${park.longitude})["attraction"="roller_coaster"];nwr(around:4000,${park.latitude},${park.longitude})["tourism"="attraction"];);out center tags;`;
    const data = await fetchOverpass(query, 18000);
    const seen = new Set();
    return (data.elements || []).map(element => {
      const item = normalizeElement(element);
      item.name = element.tags?.name || element.tags?.['name:de'] || 'Unbenannte Attraktion';
      return item;
    }).filter(item => {
      const key = norm(item.name); if (!key || seen.has(key)) return false; seen.add(key); return true;
    }).sort((a,b) => a.name.localeCompare(b.name, 'de'));
  }

  async function buildOfflinePack(code, status) {
    const parks = await lightweightParks(code, {force:true});
    const attractions = [];
    for (let i = 0; i < parks.length; i++) {
      const park = parks[i];
      status.textContent = `Offline-Paket: ${i+1}/${parks.length} Parks · ${park.name}`;
      try {
        const items = await attractionsForPark(park, code);
        for (const item of items) attractions.push({...item, parkName:park.name, parkId:park.id});
      } catch (error) { console.warn('[RideTracker offline park]', park.name, error); }
    }
    const pack = {version:2,countryCode:code,countryName:countryName(code),downloadedAt:new Date().toISOString(),parks,attractions};
    const database = db();
    if (database) {
      try { await database.put(database.stores.cache, `reference:country-pack:${code}`, {savedAt:Date.now(),value:pack}); } catch (_) {}
    }
    return pack;
  }

  function patchPanel(panel) {
    if (!panel || panel.dataset.rt57Patched) return;
    panel.dataset.rt57Patched = '1';
    const country = panel.querySelector('[data-country]');
    const park = panel.querySelector('[data-park]');
    const attraction = panel.querySelector('[data-attraction]');
    const status = panel.querySelector('[data-status]');
    const download = panel.querySelector('[data-download]');
    if (!country || !park || !attraction || !status) return;
    let parks = [];

    const loadParks = async () => {
      const code = country.value;
      park.disabled = true; attraction.disabled = true;
      park.innerHTML = '<option value="">Parks werden geladen …</option>';
      attraction.innerHTML = '<option value="">Attraktion auswählen …</option>';
      if (!code) return;
      status.textContent = `Parks für ${countryName(code)} werden geladen …`;
      try {
        parks = await lightweightParks(code);
        park._rt57Parks = parks;
        park.innerHTML = '<option value="">Park auswählen …</option>' + parks.map((p,i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
        park.disabled = !parks.length;
        status.textContent = parks.length ? `${parks.length} Parks für ${countryName(code)} verfügbar.` : `Keine Parks für ${countryName(code)} gefunden.`;
      } catch (error) {
        park.innerHTML = '<option value="">Parkliste nicht verfügbar</option>';
        status.textContent = `Parkliste konnte nicht geladen werden: ${error?.message || error}. Bitte erneut versuchen.`;
      }
    };

    country.onchange = () => void loadParks();
    park.onchange = async () => {
      const selected = parks[Number(park.value)];
      attraction.disabled = true;
      attraction.innerHTML = '<option value="">Attraktionen werden geladen …</option>';
      if (!selected) return;
      status.textContent = `${selected.name}: Attraktionen werden geladen …`;
      try {
        const items = await attractionsForPark(selected, country.value);
        attraction._items = items;
        attraction.innerHTML = '<option value="">Attraktion auswählen …</option>' + items.map((a,i) => `<option value="${i}">${esc(a.name)}</option>`).join('');
        attraction.disabled = !items.length;
        status.textContent = items.length ? `${items.length} Attraktionen in ${selected.name} verfügbar.` : `Für ${selected.name} wurden keine Attraktionen gefunden.`;
      } catch (error) {
        attraction.innerHTML = '<option value="">Attraktionen nicht verfügbar</option>';
        status.textContent = `Attraktionen konnten nicht geladen werden: ${error?.message || error}`;
      }
    };

    if (download) download.onclick = async () => {
      if (!country.value) return alert('Bitte zuerst ein Land auswählen.');
      download.disabled = true;
      status.textContent = 'Offline-Paket wird vorbereitet …';
      try {
        const pack = await buildOfflinePack(country.value, status);
        status.textContent = `Offline-Paket ${pack.countryName}: ${pack.parks.length} Parks und ${pack.attractions.length} Attraktionen gespeichert.`;
        await loadParks();
      } catch (error) {
        status.textContent = `Offline-Paket konnte nicht vollständig geladen werden: ${error?.message || error}. Die normale Online-Parkauswahl bleibt verfügbar.`;
      } finally { download.disabled = false; }
    };

    if (country.value) void loadParks();
  }

  const observer = new MutationObserver(() => patchPanel(document.querySelector('#rtReference54')));
  observer.observe(document.body, {childList:true,subtree:true});
  patchPanel(document.querySelector('#rtReference54'));

  window.RideTrackerCountryParkDirectory = {parksForCountry:lightweightParks, attractionsForPark, buildOfflinePack};
})();
