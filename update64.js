(() => {
  'use strict';

  const PREFERENCES_KEY = 'rideTracker.contextPreferences.v1';
  const PENDING_KEY = 'rideTracker.pendingRideContext.v1';
  const META_KEY = 'rideTracker.savedRides.v2';
  const OSM_ATTRIBUTION = 'Kartendaten © OpenStreetMap-Mitwirkende';
  const WEATHER_ATTRIBUTION = 'Wetterdaten: Open-Meteo.com · CC BY 4.0';
  const state = {
    location: null, parks: [], attractions: [], selectedPark: null, selectedAttraction: null,
    country: null, weather: { start: null, end: null }, thumbnail: null,
    recordingStartedAt: null, mapZoom: 11, busy: false, observerScheduled: false,
  };
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const readJson = (storage, key, fallback) => { try { return JSON.parse(storage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const writeJson = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); } catch (_) {} return value; };
  const log = (level, message, data) => window.RideTrackerSupportCenter?.log?.(level, 'ride-context', message, data);
  const preferences = () => ({ weatherEnabled:false, parkRadiusM:25000, externalLookupConsent:false, ...readJson(localStorage, PREFERENCES_KEY, {}) });
  const savePreferences = patch => writeJson(localStorage, PREFERENCES_KEY, { ...preferences(), ...patch });
  const database = () => window.RideTrackerDatabase;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function cleanPlace(place) {
    if (!place) return null;
    return {
      provider: String(place.provider || 'manual'), id: String(place.id || ''), name: String(place.name || '').slice(0, 160),
      latitude: finite(place.latitude) ? Number(place.latitude) : null,
      longitude: finite(place.longitude) ? Number(place.longitude) : null,
      distanceM: finite(place.distanceM) ? Number(place.distanceM) : null,
      wikidata: place.wikidata ? String(place.wikidata) : null,
    };
  }

  function pendingSnapshot() {
    return {
      savedAt: new Date().toISOString(), park: cleanPlace(state.selectedPark), attraction: cleanPlace(state.selectedAttraction),
      weather: state.weather, thumbnail: state.thumbnail, country: state.country,
    };
  }
  function savePending() { writeJson(sessionStorage, PENDING_KEY, pendingSnapshot()); }
  function restorePending() {
    const pending = readJson(sessionStorage, PENDING_KEY, null);
    if (!pending?.savedAt || Date.now() - new Date(pending.savedAt).getTime() > 12 * 60 * 60 * 1000) return;
    state.selectedPark = pending.park || null; state.selectedAttraction = pending.attraction || null;
    state.weather = pending.weather || {start:null,end:null}; state.thumbnail = pending.thumbnail || null; state.country = pending.country || null;
  }

  async function fetchJson(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { credentials:'omit', ...options, signal:controller.signal, headers:{Accept:'application/json', ...(options.headers || {})} });
      if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  function currentGpsPoint() {
    const point = window.RideTrackerGpsCapture?.last?.();
    if (!finite(point?.latitude) || !finite(point?.longitude)) return null;
    return { latitude:Number(point.latitude), longitude:Number(point.longitude), horizontalAccuracyM:finite(point.horizontalAccuracyM)?Number(point.horizontalAccuracyM):null, capturedAt:new Date().toISOString() };
  }
  function requestLocation() {
    const existing = currentGpsPoint(); if (existing) return Promise.resolve(existing);
    if (!navigator.geolocation) return Promise.reject(new Error('Standort ist auf diesem Gerät nicht verfügbar.'));
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(position => resolve({
      latitude:Number(position.coords.latitude), longitude:Number(position.coords.longitude), horizontalAccuracyM:Number(position.coords.accuracy)||null, capturedAt:new Date(position.timestamp || Date.now()).toISOString(),
    }), error => reject(new Error(error?.message || 'Standort konnte nicht ermittelt werden.')), {enableHighAccuracy:true, maximumAge:15000, timeout:14000}));
  }

  function weatherCodeText(code) {
    code = Number(code);
    if (code === 0) return 'Klar'; if ([1,2].includes(code)) return 'Leicht bewölkt'; if (code === 3) return 'Bedeckt';
    if ([45,48].includes(code)) return 'Nebel'; if (code >= 51 && code <= 67) return 'Regen/Niesel';
    if (code >= 71 && code <= 77) return 'Schnee'; if (code >= 80 && code <= 82) return 'Regenschauer';
    if (code >= 85 && code <= 86) return 'Schneeschauer'; if (code >= 95) return 'Gewitter'; return 'Unbekannt';
  }
  async function captureWeather(kind = 'start') {
    if (!preferences().weatherEnabled) return null;
    state.location ||= await requestLocation();
    const latitude = Number(state.location.latitude.toFixed(3));
    const longitude = Number(state.location.longitude.toFixed(3));
    const fields = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=${fields}&wind_speed_unit=kmh&timezone=auto&forecast_days=1`;
    const data = await fetchJson(url, {}, 12000); const current = data.current || {}; const units = data.current_units || {};
    const snapshot = {
      kind, observedAt:current.time || new Date().toISOString(), fetchedAt:new Date().toISOString(), modelGrid:{latitude:data.latitude,longitude:data.longitude,elevationM:data.elevation,timezone:data.timezone},
      condition:{code:Number(current.weather_code),label:weatherCodeText(current.weather_code)},
      temperatureC:Number(current.temperature_2m), apparentTemperatureC:Number(current.apparent_temperature), relativeHumidityPercent:Number(current.relative_humidity_2m),
      precipitationMm:Number(current.precipitation), rainMm:Number(current.rain), cloudCoverPercent:Number(current.cloud_cover), surfacePressureHpa:Number(current.surface_pressure),
      wind:{speedKmh:Number(current.wind_speed_10m),directionDeg:Number(current.wind_direction_10m),gustKmh:Number(current.wind_gusts_10m)},
      units, source:{provider:'Open-Meteo',url:'https://open-meteo.com/',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'},
    };
    state.weather[kind] = snapshot; savePending(); renderContextStatus(); renderDraftEnhancement();
    window.dispatchEvent(new CustomEvent('ridetracker:weather-captured', {detail:{kind,observedAt:snapshot.observedAt}}));
    return snapshot;
  }

  function project(latitude, longitude, zoom) {
    const size = 256 * 2 ** zoom; const sin = Math.sin(Number(latitude) * Math.PI / 180);
    return { x:(Number(longitude) + 180) / 360 * size, y:(0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size, size };
  }
  function renderMap() {
    const host = document.querySelector('#rtRideContext64 [data-map]'); if (!host || !state.location) return;
    const width = Math.max(300, host.clientWidth || 360), height = 270, zoom = state.mapZoom;
    const center = project(state.location.latitude, state.location.longitude, zoom); const n = 2 ** zoom;
    host.innerHTML = '<div class="rt64-tiles"></div><div class="rt64-markers"></div><div class="rt64-map-controls"><button type="button" data-zoom="in" aria-label="Karte vergrößern">+</button><button type="button" data-zoom="out" aria-label="Karte verkleinern">−</button></div><a class="rt64-osm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
    const tiles = host.querySelector('.rt64-tiles'), markers = host.querySelector('.rt64-markers');
    const left = center.x - width / 2, top = center.y - height / 2;
    const minX = Math.floor(left / 256), maxX = Math.floor((left + width) / 256), minY = Math.max(0, Math.floor(top / 256)), maxY = Math.min(n - 1, Math.floor((top + height) / 256));
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
      const img = document.createElement('img'); const wrappedX = ((x % n) + n) % n;
      img.src = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`; img.alt = ''; img.loading = 'lazy';
      img.style.left = `${Math.round(x * 256 - left)}px`; img.style.top = `${Math.round(y * 256 - top)}px`; tiles.appendChild(img);
    }
    const addMarker = (item, className, label, click) => {
      if (!finite(item?.latitude) || !finite(item?.longitude)) return;
      const point = project(item.latitude, item.longitude, zoom), button = document.createElement('button');
      button.type = 'button'; button.className = `rt64-marker ${className}`; button.style.left = `${point.x - left}px`; button.style.top = `${point.y - top}px`; button.title = item.name || label; button.setAttribute('aria-label', item.name || label); button.textContent = label;
      if (click) button.onclick = click; markers.appendChild(button);
    };
    addMarker(state.location, 'current', '●');
    state.parks.slice(0, 40).forEach((park, index) => addMarker(park, state.selectedPark?.id === park.id ? 'park selected' : 'park', String(index + 1), () => void selectPark(park)));
    state.attractions.slice(0, 50).forEach(attraction => addMarker(attraction, state.selectedAttraction?.id === attraction.id ? 'attraction selected' : 'attraction', '◆', () => selectAttraction(attraction)));
    host.querySelector('[data-zoom="in"]').onclick = () => { state.mapZoom = Math.min(17, state.mapZoom + 1); renderMap(); };
    host.querySelector('[data-zoom="out"]').onclick = () => { state.mapZoom = Math.max(6, state.mapZoom - 1); renderMap(); };
  }

  function renderParkList() {
    const panel = document.getElementById('rtRideContext64'); if (!panel) return;
    const parks = panel.querySelector('[data-parks]'), attractions = panel.querySelector('[data-attractions]');
    parks.innerHTML = state.parks.length ? state.parks.slice(0, 20).map((park, index) => `<button type="button" data-park-index="${index}" data-selected="${state.selectedPark?.id === park.id}"><b>${index + 1}. ${esc(park.name)}</b><small>${finite(park.distanceM)?`${(park.distanceM/1000).toFixed(1)} km entfernt`:'Entfernung unbekannt'}</small></button>`).join('') : '<span>Nach der Standortfreigabe werden Parks im gewählten Umkreis angezeigt.</span>';
    parks.querySelectorAll('[data-park-index]').forEach(button => button.onclick = () => void selectPark(state.parks[Number(button.dataset.parkIndex)]));
    attractions.innerHTML = '<option value="">Attraktion auswählen …</option>' + state.attractions.map((item, index) => `<option value="${index}" ${state.selectedAttraction?.id === item.id?'selected':''}>${esc(item.name)}</option>`).join('');
    attractions.disabled = !state.attractions.length; attractions.onchange = () => selectAttraction(attractions.value === '' ? null : (state.attractions[Number(attractions.value)] || null));
    renderMap(); syncDraftFields();
  }

  function selectAttraction(attraction) { state.selectedAttraction = cleanPlace(attraction); savePending(); renderParkList(); }
  async function selectPark(park) {
    state.selectedPark = cleanPlace(park); state.selectedAttraction = null; state.attractions = []; renderParkList();
    const status = document.querySelector('#rtRideContext64 [data-status]'); if (status) status.textContent = `Attraktionen in ${park.name} werden geladen …`;
    try {
      const items = await window.RideTrackerReferenceEngine?.attractionsForPark?.(park, state.country?.code);
      state.attractions = Array.isArray(items) ? items.map(item => ({...item, ...cleanPlace(item)})) : [];
      const nearest = state.location ? [...state.attractions].filter(item => finite(item.latitude)).sort((a,b) => window.RideTrackerGpsMath.distanceMeters(state.location,a)-window.RideTrackerGpsMath.distanceMeters(state.location,b))[0] : null;
      if (nearest && window.RideTrackerGpsMath.distanceMeters(state.location, nearest) <= 600) state.selectedAttraction = cleanPlace(nearest);
      if (status) status.textContent = `${state.attractions.length} Attraktionen gefunden. Bitte die richtige Bahn auswählen.`;
    } catch (error) { if (status) status.textContent = `Attraktionen konnten nicht geladen werden: ${error.message}`; log('warn','Attraction lookup failed',{message:error.message}); }
    savePending(); renderParkList();
  }

  async function loadNearbyParks({explicit = false} = {}) {
    if (state.busy) return state.parks; state.busy = true;
    const panel = ensureContextPanel(), status = panel?.querySelector('[data-status]'), prefs = preferences();
    if (explicit) savePreferences({externalLookupConsent:true});
    if (!explicit && !prefs.externalLookupConsent) { state.busy=false; return []; }
    if (status) status.textContent = 'Standort und Parks werden ermittelt …';
    try {
      state.location = await requestLocation(); const radiusM = Number(panel?.querySelector('[data-radius]')?.value || preferences().parkRadiusM || 25000);
      savePreferences({parkRadiusM:radiusM}); state.mapZoom = radiusM <= 5000 ? 13 : radiusM <= 15000 ? 11 : radiusM <= 30000 ? 10 : 9;
      const engine = window.RideTrackerReferenceEngine; if (!engine?.nearbyParks) throw new Error('Parkdaten-Modul ist nicht verfügbar.');
      const found = await engine.nearbyParks(state.location, radiusM);
      state.parks = (found || []).map(park => ({...park,distanceM:window.RideTrackerGpsMath.distanceMeters(state.location,park)})).filter(park => park.distanceM <= radiusM).sort((a,b)=>a.distanceM-b.distanceM);
      try { state.country = await engine.reverseCountry?.(state.location); } catch (_) {}
      if (!state.selectedPark && state.parks.length) await selectPark(state.parks[0]);
      if (status) status.textContent = state.parks.length ? `${state.parks.length} Parks im Umkreis gefunden. Der nächste Park ist vorausgewählt.` : 'Im gewählten Umkreis wurde kein Park gefunden. Park und Bahn können später manuell eingetragen werden.';
      savePending(); renderParkList();
      window.dispatchEvent(new CustomEvent('ridetracker:nearby-parks-loaded',{detail:{count:state.parks.length,radiusM}}));
      return state.parks;
    } finally { state.busy = false; }
  }

  function ensureContextPanel() {
    const preflight = document.getElementById('rtCommunityPreflight'); if (!preflight) return null;
    let panel = document.getElementById('rtRideContext64'); if (panel) return panel;
    const prefs = preferences(); panel = document.createElement('section'); panel.id = 'rtRideContext64';
    panel.innerHTML = `<div class="rt64-context-head"><div><h3>Park, Attraktion & Wetter</h3><p>Die Fahrt bleibt lokal. Externe Standortabrufe erfolgen nur mit deiner Auswahl.</p></div><button type="button" data-load>Parks im Umkreis suchen</button></div><div class="rt64-options"><label>Umkreis<select data-radius><option value="5000">5 km</option><option value="15000">15 km</option><option value="25000">25 km</option><option value="50000">50 km</option></select></label><label class="rt64-check"><input type="checkbox" data-weather ${prefs.weatherEnabled?'checked':''}> Wetter bei Start und Ende abrufen</label></div><div class="rt64-privacy">Beim Laden werden gerundete Koordinaten an OpenStreetMap/Overpass und – falls aktiviert – Open-Meteo übertragen. Die Aufnahme funktioniert auch ohne diese Dienste.</div><div class="rt64-status" data-status>Noch keine externen Standortdaten geladen.</div><div class="rt64-map" data-map></div><div class="rt64-parks" data-parks></div><label class="rt64-attraction">Attraktion<select data-attractions disabled><option>Attraktion auswählen …</option></select></label><div class="rt64-source"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${OSM_ATTRIBUTION}</a> · <a href="https://open-meteo.com/" target="_blank" rel="noopener">${WEATHER_ATTRIBUTION}</a></div>`;
    preflight.querySelector('[data-status]')?.after(panel); panel.querySelector('[data-radius]').value = String(prefs.parkRadiusM);
    panel.querySelector('[data-load]').onclick = () => void loadNearbyParks({explicit:true}).catch(error => { panel.querySelector('[data-status]').textContent = `Parks konnten nicht geladen werden: ${error.message}`; });
    panel.querySelector('[data-weather]').onchange = event => savePreferences({weatherEnabled:event.target.checked}); renderParkList(); return panel;
  }

  function renderContextStatus() {
    const panel = ensureContextPanel(); if (!panel) return;
    const weather = state.weather.start; if (weather) panel.querySelector('[data-status]').textContent = `${state.selectedPark?.name || 'Park noch offen'} · ${weather.condition.label}, ${weather.temperatureC.toFixed(1)} °C, Wind ${weather.wind.speedKmh.toFixed(0)} km/h.`;
  }
  function syncDraftFields() {
    const modal = document.getElementById('rtRideDraft61'); if (!modal) return;
    const park = modal.querySelector('[data-park]'), ride = modal.querySelector('[data-ride]');
    if (park && state.selectedPark?.name && !park.value.trim()) park.value = state.selectedPark.name;
    if (ride && state.selectedAttraction?.name && !ride.value.trim()) ride.value = state.selectedAttraction.name;
  }

  async function imageToThumbnail(blob) {
    if (!blob?.type?.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
    if (blob.size > 12 * 1024 * 1024) throw new Error('Das Bild darf maximal 12 MB groß sein.');
    const url = URL.createObjectURL(blob); const image = new Image(); image.decoding = 'async';
    try {
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Bild konnte nicht gelesen werden.'));image.src=url;});
      const width=960,height=540,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
      const scale=Math.max(width/image.naturalWidth,height/image.naturalHeight),drawWidth=image.naturalWidth*scale,drawHeight=image.naturalHeight*scale;
      ctx.drawImage(image,(width-drawWidth)/2,(height-drawHeight)/2,drawWidth,drawHeight); return canvas.toDataURL('image/jpeg',0.82);
    } finally { URL.revokeObjectURL(url); }
  }
  const plain = value => String(value || '').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
  function allowedCommonsLicense(value) {
    const license = plain(value); return /^(CC0|Public domain|Public Domain|CC BY(?:\s|\-|$))/i.test(license) && !/BY-(?:SA|NC|ND)/i.test(license);
  }
  async function searchCommons(query) {
    const params = new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'12',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'800'});
    const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`); const pages = Object.values(data?.query?.pages || {});
    return pages.map(page=>{const info=page.imageinfo?.[0]||{},meta=info.extmetadata||{},license=plain(meta.LicenseShortName?.value),creator=plain(meta.Artist?.value||meta.Credit?.value||'Unbekannt');return{title:String(page.title||'').replace(/^File:/,''),thumbUrl:info.thumburl,url:info.url,sourceUrl:info.descriptionurl,license,licenseUrl:meta.LicenseUrl?.value||'',creator,credit:plain(meta.Credit?.value),description:plain(meta.ImageDescription?.value)};}).filter(item=>allowedCommonsLicense(item.license)&&/^https:\/\/upload\.wikimedia\.org\//.test(item.thumbUrl||'')).slice(0,6);
  }
  async function chooseCommonsImage(item) {
    const response = await fetch(item.thumbUrl,{credentials:'omit'}); if(!response.ok)throw new Error(`Wikimedia: HTTP ${response.status}`);
    const blob = await response.blob(), dataUrl = await imageToThumbnail(blob);
    state.thumbnail={kind:'stock',dataUrl,title:item.title,creator:item.creator,attribution:`${item.title} · ${item.creator} · ${item.license}`,sourceUrl:item.sourceUrl,license:item.license,licenseUrl:item.licenseUrl,provider:'Wikimedia Commons',selectedAt:new Date().toISOString(),rightsConfirmed:true};savePending();renderDraftEnhancement();
  }

  function thumbnailPreviewHtml() {
    const image=state.thumbnail;if(!image)return '<div class="rt64-image-empty">Noch kein Fahrtbild ausgewählt.</div>';
    return `<img src="${image.dataUrl}" alt="Ausgewähltes Fahrtbild"><small>${esc(image.attribution||'Eigenes Foto')}</small>`;
  }
  function weatherSummary() {
    const value=state.weather.start;if(!value)return 'Wetter wird nur gespeichert, wenn der Abruf vor dem Start aktiviert wurde.';
    return `${value.condition.label} · ${value.temperatureC.toFixed(1)} °C · gefühlt ${value.apparentTemperatureC.toFixed(1)} °C · Wind ${value.wind.speedKmh.toFixed(0)} km/h, Böen ${value.wind.gustKmh.toFixed(0)} km/h · ${WEATHER_ATTRIBUTION}`;
  }

  function renderDraftEnhancement() {
    const modal=document.getElementById('rtRideDraft61'), host=modal?.querySelector('#rtRideMedia64');if(!host)return;syncDraftFields();
    host.querySelector('[data-weather-summary]').textContent=weatherSummary();host.querySelector('[data-image-preview]').innerHTML=thumbnailPreviewHtml();
    const rights=host.querySelector('[data-image-rights]');if(rights){rights.checked=Boolean(state.thumbnail?.rightsConfirmed);rights.disabled=state.thumbnail?.kind==='stock';}
  }
  function enhanceDraft() {
    const modal=document.getElementById('rtRideDraft61');if(!modal)return null;syncDraftFields();
    const parkInput=modal.querySelector('[data-park]'),rideInput=modal.querySelector('[data-ride]');
    if(!parkInput.dataset.rt64){parkInput.dataset.rt64='1';parkInput.addEventListener('input',()=>{state.selectedPark={provider:'manual',id:'',name:parkInput.value};savePending();});}
    if(!rideInput.dataset.rt64){rideInput.dataset.rt64='1';rideInput.addEventListener('input',()=>{state.selectedAttraction={provider:'manual',id:'',name:rideInput.value};savePending();});}
    let host=modal.querySelector('#rtRideMedia64');if(host)return host;
    host=document.createElement('section');host.id='rtRideMedia64';host.className='rt64-draft-media';host.innerHTML=`<h3>Wetter & Fahrtbild</h3><p data-weather-summary></p><div class="rt64-image-preview" data-image-preview></div><div class="rt64-image-actions"><label>Eigenes Bild<input type="file" data-image-file accept="image/*"></label><button type="button" data-stock>Freies Stockbild suchen</button><button type="button" data-image-remove>Bild entfernen</button></div><label class="rt64-rights"><input type="checkbox" data-image-rights> Ich habe die erforderlichen Rechte für eine Veröffentlichung dieses eigenen Bildes.</label><div class="rt64-stock-results" data-stock-results></div><div class="rt64-source">Automatische Bilder werden ausschließlich aus Wikimedia Commons übernommen und auf Public Domain, CC0 oder CC BY eingeschränkt. Quelle, Urheber und Lizenz bleiben gespeichert.</div>`;
    modal.querySelector('.rt61-status')?.before(host);
    host.querySelector('[data-image-file]').onchange=async event=>{try{const file=event.target.files?.[0];if(!file)return;const dataUrl=await imageToThumbnail(file);state.thumbnail={kind:'user',dataUrl,title:file.name,creator:'Nutzer-Upload',attribution:'Eigenes Nutzerbild',sourceUrl:null,license:'user-provided',licenseUrl:null,provider:'user',selectedAt:new Date().toISOString(),rightsConfirmed:false};savePending();renderDraftEnhancement();}catch(error){host.querySelector('[data-stock-results]').textContent=error.message;}};
    host.querySelector('[data-image-rights]').onchange=event=>{if(state.thumbnail?.kind==='user'){state.thumbnail.rightsConfirmed=event.target.checked;savePending();}};
    host.querySelector('[data-image-remove]').onclick=()=>{state.thumbnail=null;savePending();renderDraftEnhancement();};
    host.querySelector('[data-stock]').onclick=async()=>{const output=host.querySelector('[data-stock-results]'),query=`${rideInput.value} ${parkInput.value} roller coaster`.trim();output.textContent='Wikimedia Commons wird durchsucht …';try{const items=await searchCommons(query);output.innerHTML=items.length?items.map((item,index)=>`<article><img src="${esc(item.thumbUrl)}" alt="${esc(item.title)}" loading="lazy"><div><b>${esc(item.title)}</b><small>${esc(item.creator)} · ${esc(item.license)}</small><button type="button" data-stock-index="${index}">Dieses Bild verwenden</button></div></article>`).join(''):'Kein ausreichend frei lizenziertes Bild gefunden. Bitte ein eigenes Bild verwenden.';output.querySelectorAll('[data-stock-index]').forEach(button=>button.onclick=async()=>{button.disabled=true;button.textContent='Bild wird lokal gespeichert …';try{await chooseCommonsImage(items[Number(button.dataset.stockIndex)]);}catch(error){output.textContent=`Bild konnte nicht übernommen werden: ${error.message}`;}});}catch(error){output.textContent=`Bildsuche fehlgeschlagen: ${error.message}`;}};
    renderDraftEnhancement();return host;
  }

  async function validateDraft({visibility}={}) {
    if (state.thumbnail?.kind === 'user' && ['friends','public'].includes(String(visibility)) && !state.thumbnail.rightsConfirmed) throw new Error('Bitte bestätige vor einer Veröffentlichung, dass du die erforderlichen Bildrechte besitzt.');
    return true;
  }
  async function persistToRide(rideId, patch={}) {
    const db=database();if(!db||!rideId)return null;const pkg=await db.get(db.stores.ridePackages,rideId);if(!pkg)return null;
    pkg.document=pkg.document||{};pkg.document.context={...(pkg.document.context||{}),parkName:patch.parkName||state.selectedPark?.name||pkg.parkName||null,rideName:patch.rideName||state.selectedAttraction?.name||pkg.rideName||null,parkProvider:state.selectedPark?.provider||null,parkExternalId:state.selectedPark?.id||null,rideProvider:state.selectedAttraction?.provider||null,rideExternalId:state.selectedAttraction?.id||null,countryCode:state.country?.code||pkg.document.context?.countryCode||null};
    pkg.document.environment={...(pkg.document.environment||{}),weather:{...state.weather},source:state.weather.start?{provider:'Open-Meteo',license:'CC BY 4.0',url:'https://open-meteo.com/'}:null,capturedAt:new Date().toISOString()};
    if(state.thumbnail){pkg.photoDataUrl=state.thumbnail.dataUrl;pkg.thumbnail={...state.thumbnail};pkg.document.thumbnail={...state.thumbnail};}
    pkg.parkName=pkg.document.context.parkName;pkg.rideName=pkg.document.context.rideName;pkg.weatherSummary=state.weather.start?weatherSummary():null;await db.put(db.stores.ridePackages,rideId,pkg);
    const metadata=readJson(localStorage,META_KEY,[]);const meta=Array.isArray(metadata)?metadata.find(item=>String(item.id)===String(rideId)):null;if(meta){meta.hasThumbnail=Boolean(state.thumbnail);meta.thumbnailSource=state.thumbnail?.provider||null;meta.hasWeather=Boolean(state.weather.start);writeJson(localStorage,META_KEY,metadata);}
    window.dispatchEvent(new CustomEvent('ridetracker:ride-context-saved',{detail:{rideId,parkName:pkg.parkName,rideName:pkg.rideName,hasWeather:Boolean(state.weather.start),hasThumbnail:Boolean(state.thumbnail)}}));
    return pkg;
  }

  async function prepareForRecording() {
    state.recordingStartedAt=new Date().toISOString();
    try{state.location=await requestLocation();}catch(error){log('warn','Location unavailable before recording',{message:error.message});}
    if(preferences().externalLookupConsent&&!state.parks.length&&state.location)try{await loadNearbyParks();}catch(error){log('warn','Automatic park lookup failed',{message:error.message});}
    if(preferences().weatherEnabled&&state.location)try{await captureWeather('start');}catch(error){log('warn','Start weather failed',{message:error.message});}
    savePending();return{location:Boolean(state.location),park:state.selectedPark?.name||null,attraction:state.selectedAttraction?.name||null,weather:Boolean(state.weather.start)};
  }

  function ensureFaq() {
    let view=document.getElementById('rtSensorFaq64');if(view)return view;view=document.createElement('section');view.id='rtSensorFaq64';view.hidden=true;
    view.innerHTML=`<div class="rt64-faq-shell"><header><div><span>RideTracker Wissen</span><h2>FAQ: Messwerte verstehen</h2><p>Wie G-Kräfte, Geschwindigkeit, Richtung und Qualität berechnet und bewertet werden.</p></div><button type="button" data-close>Schließen</button></header><article><h3>Wie werden G-Kräfte berechnet?</h3><p>Die Kalibrierung bestimmt drei zueinander senkrechte Fahrzeugachsen: normal (oben/unten), lateral (links/rechts) und longitudinal (vorwärts/rückwärts). Der Beschleunigungsvektor inklusive Erdanziehung wird per Skalarprodukt auf diese Achsen projiziert und jeweils durch <b>9,80665 m/s²</b> geteilt.</p><div class="rt64-formula">G<sub>normal</sub> = a · e<sub>oben</sub> / 9,80665<br>G<sub>lateral</sub> = a · e<sub>seitlich</sub> / 9,80665<br>G<sub>longitudinal</sub> = a · e<sub>vorne</sub> / 9,80665<br>G<sub>horizontal</sub> = √(G<sub>lateral</sub>² + G<sub>longitudinal</sub>²)<br>G<sub>gesamt</sub> = √(G<sub>normal</sub>² + G<sub>lateral</sub>² + G<sub>longitudinal</sub>²)</div><p>Im Stillstand sind ungefähr +1 G auf der Normalachse normal. „Horizontal gesamt“ bleibt auch dann aussagekräftig, wenn eine falsche Vorwärtskante Quer- und Längskraft vertauscht. Kalibriere auf einem geraden, ruhigen Abschnitt mit endgültig befestigtem Telefon; eine Kalibrierung in einer Kurve kann einen Teil der dauerhaften Seitenkraft fälschlich als neue Vertikale einrechnen. RideTracker prüft deshalb eine gespeicherte Kalibrierung gegen die aktuelle Handylage. Die Anzeige ist eine Freizeitmessung und kein sicherheitsrelevantes Prüfsystem.</p></article><article><h3>Funktionieren G-Kräfte ohne GPS?</h3><p>Ja. G-Kräfte stammen aus dem Bewegungssensor. Ohne GPS fehlen aber eine belastbare Geschwindigkeit, der geografische Verlauf und damit das räumliche Streckenmodell. Eine doppelte Integration der Beschleunigung wird bewusst nicht als Ersatz verwendet, da kleine Sensorfehler sehr schnell zu großen Positionsfehlern anwachsen.</p></article><article><h3>Wie wird Geschwindigkeit bewertet?</h3><p>RideTracker kombiniert – soweit vorhanden – die native GPS-Geschwindigkeit mit aus mehreren Positionsfenstern abgeleiteten Werten. Ungenaue Fixes, physikalisch unmögliche Sprünge und einzelne Ausreißer werden verworfen. Im Stillstand wird erst nach mehreren räumlich und richtungsmäßig konsistenten Fixes wieder eine Bewegung freigegeben. Wiederholte oder veraltete Browser-Zeitstempel werden durch die monotone Empfangszeit ersetzt. In abgeschirmten Fahrzeugen wie einem ICE kann die Position trotzdem unverändert bleiben; konstante absolute Geschwindigkeit lässt sich dann nicht seriös aus dem Beschleunigungssensor ableiten. Ohne verlässlichen Wert erscheint deshalb „–“ statt einer erfundenen 0.</p></article><article><h3>Was bedeutet Messqualität?</h3><p>Die Konfidenz berücksichtigt GPS-Genauigkeit, Länge des Messfensters, Sensorverfügbarkeit, Kalibrierungsrauschen und die Übereinstimmung unabhängiger Quellen. Schlechte Qualität wird gespeichert und sichtbar gemacht, nicht stillschweigend als präzise Messung ausgegeben.</p></article><article><h3>Wie funktioniert der Kompass?</h3><p>Auf iOS wird bevorzugt <code>webkitCompassHeading</code> verwendet, danach die absolute Geräteorientierung. Während einer Bewegung kann der GPS-Kurs als Fallback dienen. Magnetische Störungen durch Halterungen oder Stahlkonstruktionen bleiben möglich.</p></article><article><h3>Welche Standortdaten werden extern übertragen?</h3><p>Parkkarte und Wetter sind optional. Beim aktiven Laden werden gerundete Koordinaten an OpenStreetMap/Overpass beziehungsweise Open-Meteo gesendet. Fahrten, Videos und Sensor-Rohdaten bleiben lokal, bis eine spätere Community-Synchronisierung ausdrücklich aktiviert wird.</p></article></div>`;
    view.querySelector('[data-close]').onclick=()=>view.hidden=true;document.body.appendChild(view);return view;
  }
  function openFaq(){const view=ensureFaq();view.hidden=false;view.scrollTo({top:0,behavior:'auto'});}
  function addFaqEntry(){if(document.querySelector('[data-rt64-faq]'))return;const support=document.querySelector('[data-community-route="support"]');if(!support?.parentElement)return;const button=document.createElement('button');button.type='button';button.className=support.className||'rt61-card';button.dataset.rt64Faq='';button.innerHTML='<i>?</i><span><strong>FAQ & Messmethode</strong><small>G-Kräfte, GPS, Kompass und Messqualität verstehen</small></span>';support.parentElement.appendChild(button);button.onclick=openFaq;}

  const style=document.createElement('style');style.id='rtRideContext64Style';style.textContent=`
    #rtRideContext64{grid-column:1/-1;margin-top:10px;padding:13px;border:1px solid #31536b;border-radius:16px;background:#071522;color:#f5fbff}.rt64-context-head{display:flex;justify-content:space-between;gap:10px;align-items:start}.rt64-context-head h3{margin:0}.rt64-context-head p{margin:4px 0;color:#96aac1;font-size:12px}.rt64-options{display:grid;grid-template-columns:160px minmax(0,1fr);gap:9px;margin-top:10px}.rt64-options label{display:grid;gap:4px;color:#a8bdd0;font-size:11px}.rt64-check{display:flex!important;align-items:center;gap:7px}.rt64-privacy,.rt64-status,.rt64-source{margin-top:8px;color:#91a7bc;font-size:11px;line-height:1.45}.rt64-map{position:relative;height:270px;margin-top:10px;overflow:hidden;border:1px solid #29435f;border-radius:14px;background:#0c1b2c}.rt64-tiles,.rt64-markers{position:absolute;inset:0}.rt64-tiles img{position:absolute;width:256px;height:256px}.rt64-marker{position:absolute;z-index:2;transform:translate(-50%,-100%);min-width:25px;height:25px;padding:0 5px;border:2px solid #fff;border-radius:999px;background:#175d89;color:#fff;font-size:10px;font-weight:900;box-shadow:0 2px 8px #000}.rt64-marker.current{background:#e63956}.rt64-marker.attraction{background:#0f9d87}.rt64-marker.selected{outline:3px solid #ffd166}.rt64-map-controls{position:absolute;z-index:3;top:8px;right:8px;display:grid;gap:4px}.rt64-map-controls button{width:34px;height:34px;padding:0}.rt64-osm-credit{position:absolute;z-index:3;right:5px;bottom:4px;padding:2px 4px;border-radius:4px;background:#fff;color:#17415d;font-size:9px}.rt64-parks{display:flex;gap:7px;overflow:auto;margin-top:9px;padding-bottom:3px}.rt64-parks>button{min-width:170px;text-align:left;padding:9px;background:#0d2235}.rt64-parks>button[data-selected=true]{border-color:#5fd0ff}.rt64-parks b,.rt64-parks small{display:block}.rt64-parks small{color:#96aac1;margin-top:3px}.rt64-parks>span{color:#96aac1;font-size:12px}.rt64-attraction{display:grid;gap:4px;margin-top:9px;color:#a8bdd0;font-size:11px}.rt64-draft-media{grid-column:1/-1;border:1px solid #31536b;border-radius:14px;padding:12px;background:#071522}.rt64-draft-media h3{margin:0 0 5px}.rt64-draft-media>p{color:#96aac1;font-size:12px;line-height:1.45}.rt64-image-preview{display:grid;gap:5px}.rt64-image-preview img{width:100%;max-height:260px;object-fit:cover;border-radius:12px}.rt64-image-preview small{color:#96aac1}.rt64-image-empty{padding:24px;border:1px dashed #35536f;border-radius:12px;color:#96aac1;text-align:center}.rt64-image-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.rt64-image-actions label{display:inline-flex!important}.rt64-image-actions input[type=file]{display:none}.rt64-rights{display:flex!important;grid-template-columns:auto 1fr!important;align-items:start;margin-top:8px;line-height:1.4}.rt64-stock-results{display:grid;gap:8px;margin-top:9px}.rt64-stock-results article{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px;padding:8px;border:1px solid #29435f;border-radius:12px}.rt64-stock-results img{width:110px;height:74px;object-fit:cover;border-radius:8px}.rt64-stock-results small{display:block;color:#96aac1;margin:3px 0}.rt64-faq-shell{width:min(900px,100%);margin:auto;display:grid;gap:12px}.rt64-faq-shell header,.rt64-faq-shell article{border:1px solid #29435f;border-radius:18px;background:#0c1b2d;padding:15px}.rt64-faq-shell header{display:flex;justify-content:space-between;gap:12px}.rt64-faq-shell h2,.rt64-faq-shell h3{margin:0}.rt64-faq-shell p{color:#b5c7d8;line-height:1.55}.rt64-formula{padding:12px;border-radius:12px;background:#06111d;color:#65f0b7;font-family:ui-monospace,monospace;line-height:1.8}#rtSensorFaq64{position:fixed;inset:calc(max(env(safe-area-inset-top),12px) + 58px) 0 0;z-index:2492000;overflow:auto;padding:16px 12px calc(92px + env(safe-area-inset-bottom));background:#07111f;color:#f5fbff}#rtSensorFaq64[hidden]{display:none!important}@media(max-width:600px){.rt64-context-head{display:grid}.rt64-options{grid-template-columns:1fr}.rt64-stock-results article{grid-template-columns:82px minmax(0,1fr)}.rt64-stock-results img{width:82px;height:70px}}
  `;document.head.appendChild(style);

  function scheduleEnhancement(){if(state.observerScheduled)return;state.observerScheduled=true;requestAnimationFrame(()=>{state.observerScheduled=false;ensureContextPanel();enhanceDraft();addFaqEntry();});}
  function install(){restorePending();ensureContextPanel();enhanceDraft();ensureFaq();addFaqEntry();
    window.addEventListener('ridetracker:recording-started',()=>{state.recordingStartedAt=new Date().toISOString();savePending();});
    window.addEventListener('ridetracker:recording-stopped',()=>{if(preferences().weatherEnabled)void captureWeather('end').catch(error=>log('warn','End weather failed',{message:error.message}));setTimeout(()=>{syncDraftFields();enhanceDraft();},800);});
    window.addEventListener('ridetracker:new-ride-session',()=>{state.weather={start:null,end:null};state.thumbnail=null;state.recordingStartedAt=null;sessionStorage.removeItem(PENDING_KEY);renderContextStatus();});
    const observer=new MutationObserver(scheduleEnhancement);observer.observe(document.body,{childList:true,subtree:true});
    window.RideTrackerRideContext={prepareForRecording,persistToRide,validateDraft,loadNearbyParks,captureWeather,selection:()=>pendingSnapshot(),openFaq};
    log('info','Park map, weather, licensed thumbnails and FAQ installed',{privacyDefault:'local'});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
