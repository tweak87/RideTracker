(() => {
  'use strict';

  const gps = { active:false, startMono:0, watchId:null, points:[], last:null };
  const db = () => window.RideTrackerDatabase;
  const finite = value => Number.isFinite(Number(value));
  const elapsedSeconds = () => gps.active ? Math.max(0, (performance.now() - gps.startMono) / 1000) : 0;
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  async function cached(key, loader, ttl = CACHE_TTL_MS) {
    const database = db();
    const cacheKey = `reference:${key}`;
    if (database) {
      try {
        const hit = await database.get(database.stores.cache, cacheKey);
        if (hit && Date.now() - Number(hit.savedAt || 0) < ttl) return hit.value;
      } catch (_) {}
    }
    const value = await loader();
    if (database) {
      try { await database.put(database.stores.cache, cacheKey, { savedAt:Date.now(), value }); } catch (_) {}
    }
    return value;
  }

  async function fetchJson(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal:controller.signal, headers:{ Accept:'application/json', ...(options.headers || {}) } });
      if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  function startGpsCapture() {
    if (gps.active) return;
    gps.active = true; gps.startMono = performance.now(); gps.points = []; gps.last = null;
    if (!navigator.geolocation) return;
    try {
      gps.watchId = navigator.geolocation.watchPosition(position => {
        const c = position.coords || {};
        if (!finite(c.latitude) || !finite(c.longitude)) return;
        const point = { timestamp:elapsedSeconds(), latitude:Number(c.latitude), longitude:Number(c.longitude), altitude:finite(c.altitude)?Number(c.altitude):null, horizontalAccuracyM:finite(c.accuracy)?Number(c.accuracy):null, altitudeAccuracyM:finite(c.altitudeAccuracy)?Number(c.altitudeAccuracy):null, speedMS:finite(c.speed)?Math.max(0,Number(c.speed)):null, speedKmh:finite(c.speed)?Math.max(0,Number(c.speed))*3.6:null, headingDeg:finite(c.heading)?Number(c.heading):null, gpsTimestampMs:Number(position.timestamp)||Date.now(), source:'internal-gps' };
        gps.points.push(point); gps.last = point;
        window.dispatchEvent(new CustomEvent('ridetracker:recording-gps', { detail:point }));
      }, error => window.dispatchEvent(new CustomEvent('ridetracker:recording-gps-error', { detail:{ code:error?.code, message:error?.message } })), { enableHighAccuracy:true, maximumAge:500, timeout:12000 });
    } catch (error) { console.warn('[RideTracker GPS]', error); }
  }
  function stopGpsCapture() { gps.active = false; if (gps.watchId != null && navigator.geolocation) { try { navigator.geolocation.clearWatch(gps.watchId); } catch (_) {} } gps.watchId = null; }
  function nearestGps(timestamp) { const values=gps.points;if(!values.length)return null;let lo=0,hi=values.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(values[mid].timestamp<timestamp)lo=mid+1;else hi=mid;}if(lo>0&&Math.abs(values[lo-1].timestamp-timestamp)<=Math.abs(values[lo].timestamp-timestamp))lo-=1;return values[lo]; }
  function mergeGpsIntoSamples(samples) { if(!Array.isArray(samples)||!samples.length||!gps.points.length)return samples||[];return samples.map((sample,index)=>{const timestamp=finite(sample.timestamp)?Number(sample.timestamp):finite(sample.t)?Number(sample.t):index/50;const point=nearestGps(timestamp);if(!point)return sample;return{...sample,latitude:point.latitude,longitude:point.longitude,altitude:point.altitude,horizontalAccuracyM:point.horizontalAccuracyM,altitudeAccuracyM:point.altitudeAccuracyM,speedMS:finite(sample.speedMS)?sample.speedMS:point.speedMS,speedKmh:finite(sample.speedKmh)?sample.speedKmh:point.speedKmh,headingDeg:point.headingDeg,gpsSource:point.source};}); }
  async function persistGps(rideId) { if(!rideId||!gps.points.length)return;const database=db();if(!database)return;const ridePackage=await database.get(database.stores.ridePackages,rideId);if(!ridePackage)return;ridePackage.document=ridePackage.document||{};ridePackage.document.samples=mergeGpsIntoSamples(Array.isArray(ridePackage.document.samples)?ridePackage.document.samples:[]);ridePackage.document.gps={...(ridePackage.document.gps||{}),points:gps.points.slice(),source:'internal-gps',capturedAt:new Date().toISOString()};ridePackage.gpsPointCount=gps.points.length;await database.put(database.stores.ridePackages,rideId,ridePackage);window.dispatchEvent(new CustomEvent('ridetracker:gps-persisted',{detail:{rideId,count:gps.points.length}})); }

  const osmProvider = {
    id:'osm', name:'OpenStreetMap', priority:20,
    async nearbyParks(point, radiusM = 8000) {
      const query = `[out:json][timeout:12];(nwr(around:${radiusM},${point.latitude},${point.longitude})["tourism"="theme_park"];nwr(around:${radiusM},${point.latitude},${point.longitude})["leisure"="amusement_park"];);out center tags;`;
      const data = await fetchJson(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      return (data.elements || []).map(element => ({ provider:'osm', id:`${element.type}/${element.id}`, name:element.tags?.name || 'Unbenannter Park', latitude:Number(element.center?.lat ?? element.lat), longitude:Number(element.center?.lon ?? element.lon), tags:element.tags || {}, raw:element })).filter(x => finite(x.latitude) && finite(x.longitude));
    },
    async parkAttractions(park, radiusM = 3500) {
      const query = `[out:json][timeout:12];(nwr(around:${radiusM},${park.latitude},${park.longitude})["roller_coaster"];nwr(around:${radiusM},${park.latitude},${park.longitude})["attraction"="roller_coaster"];nwr(around:${radiusM},${park.latitude},${park.longitude})["tourism"="attraction"];);out center tags;`;
      const data = await fetchJson(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      return (data.elements || []).map(element => ({ provider:'osm', id:`${element.type}/${element.id}`, name:element.tags?.name || 'Unbenannte Attraktion', latitude:Number(element.center?.lat ?? element.lat), longitude:Number(element.center?.lon ?? element.lon), tags:element.tags || {}, wikidata:element.tags?.wikidata || null, raw:element })).filter(x => x.name);
    }
  };

  const themeParksWikiProvider = {
    id:'themeparks-wiki', name:'ThemeParks.wiki', priority:30,
    async destinations() {
      const data = await cached('themeparkswiki:destinations', () => fetchJson('https://api.themeparks.wiki/v1/destinations'), 24*60*60*1000);
      return Array.isArray(data?.destinations) ? data.destinations : [];
    },
    async allParks() {
      const destinations = await this.destinations();
      return destinations.flatMap(destination => (destination.parks || []).map(park => ({ provider:'themeparks-wiki', id:park.id, name:park.name, destinationId:destination.id, destinationName:destination.name })));
    },
    async parkAttractions(parkId) {
      if (!parkId) return [];
      const data = await cached(`themeparkswiki:children:${parkId}`, () => fetchJson(`https://api.themeparks.wiki/v1/entity/${encodeURIComponent(parkId)}/children`), 6*60*60*1000);
      const children = Array.isArray(data?.children) ? data.children : Array.isArray(data) ? data : [];
      return children.filter(child => String(child.entityType || child.type || '').toUpperCase() === 'ATTRACTION').map(child => ({ provider:'themeparks-wiki', id:child.id, name:child.name, latitude:Number(child.location?.latitude), longitude:Number(child.location?.longitude), entityType:child.entityType, raw:child }));
    }
  };

  const wikidataProvider = {
    id:'wikidata', name:'Wikidata', priority:25,
    async entity(qid) {
      if (!/^Q\d+$/.test(String(qid || ''))) return null;
      const data = await cached(`wikidata:${qid}`, () => fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`), 30*24*60*60*1000);
      return data?.entities?.[qid] || null;
    },
    async technicalReference(qid) {
      const entity = await this.entity(qid); if (!entity) return null;
      const amount = property => { const raw=entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value; return raw && raw.amount != null ? Number(raw.amount) : null; };
      const label = entity.labels?.de?.value || entity.labels?.en?.value || qid;
      return { provider:'wikidata', id:qid, name:label, lengthM:amount('P2043'), heightM:amount('P2048'), maxSpeed:amount('P2052'), inception:entity.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time || null, raw:entity };
    }
  };

  const providers = new Map([[osmProvider.id,osmProvider],[themeParksWikiProvider.id,themeParksWikiProvider],[wikidataProvider.id,wikidataProvider]]);
  const referenceEngine = {
    providers,
    providerList:() => [...providers.values()].map(({id,name,priority}) => ({id,name,priority})),
    getProvider:id => providers.get(id),
    nearbyParks:point => osmProvider.nearbyParks(point),
    themeParkDirectory:() => themeParksWikiProvider.allParks(),
    attractionsForCommunityPark:parkId => themeParksWikiProvider.parkAttractions(parkId),
    wikidataReference:qid => wikidataProvider.technicalReference(qid),
    cached
  };

  window.addEventListener('ridetracker:recording-started', startGpsCapture);
  window.addEventListener('ridetracker:recording-stopped', stopGpsCapture);
  window.addEventListener('ridetracker:ride-saved', event => void persistGps(event.detail?.rideId));
  window.addEventListener('ridetracker:new-ride-session', () => { gps.points=[];gps.last=null; });
  window.RideTrackerGpsCapture={start:startGpsCapture,stop:stopGpsCapture,points:()=>gps.points.slice(),last:()=>gps.last,persistGps};
  window.RideTrackerReferenceEngine=referenceEngine;
})();
