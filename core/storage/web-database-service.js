(() => {
  'use strict';

  const DB_NAME = 'RideTrackerMedia';
  // Version 5 intentionally forces one more repair pass for Safari clients that
  // may already have reached v4 while a legacy module still owned the upgrade event.
  const DB_VERSION = 5;
  const STORES = Object.freeze({
    videos: 'videos',
    ridePackages: 'ridePackages',
    settings: 'settings',
    cache: 'cache',
  });

  const nativeOpen = indexedDB.open.bind(indexedDB);
  let openPromise = null;

  // Compatibility bridge for older RideTracker modules that still request an old
  // RideTrackerMedia version. They transparently request the current schema.
  indexedDB.open = function(name, version) {
    if (name === DB_NAME && (!version || Number(version) < DB_VERSION)) return nativeOpen(name, DB_VERSION);
    return version === undefined ? nativeOpen(name) : nativeOpen(name, version);
  };

  function upgrade(db) {
    for (const store of Object.values(STORES)) {
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    }
  }

  function open() {
    if (openPromise) return openPromise;
    openPromise = new Promise((resolve, reject) => {
      const request = nativeOpen(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => upgrade(request.result);
      request.onerror = () => {
        openPromise = null;
        reject(request.error || new Error('IndexedDB open failed'));
      };
      request.onblocked = () => console.warn('[RideTracker DB] Upgrade blocked by another tab.');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          openPromise = null;
        };
        const actualStores = [...db.objectStoreNames];
        const missing = Object.values(STORES).filter(store => !db.objectStoreNames.contains(store));
        if (missing.length) {
          db.close();
          openPromise = null;
          reject(new Error(`RideTracker IndexedDB schema incomplete after v${DB_VERSION} repair: missing ${missing.join(', ')}; present ${actualStores.join(', ')}`));
          return;
        }
        resolve(db);
      };
    });
    return openPromise;
  }

  async function withStore(store, mode, operation) {
    if (!Object.values(STORES).includes(store)) throw new Error(`Unknown RideTracker store: ${store}`);
    const db = await open();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(store, mode);
      } catch (error) {
        openPromise = null;
        reject(new Error(`RideTracker transaction failed for store ${store}; available stores: ${[...db.objectStoreNames].join(', ')}; ${error?.message || error}`));
        return;
      }
      const objectStore = tx.objectStore(store);
      let request;
      try {
        request = operation(objectStore);
      } catch (error) {
        reject(error);
        return;
      }
      if (request) {
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
        request.onsuccess = () => resolve(request.result);
      } else {
        tx.oncomplete = () => resolve(undefined);
      }
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  const api = {
    name: DB_NAME,
    version: DB_VERSION,
    stores: STORES,
    open,
    put: (store, key, value) => withStore(store, 'readwrite', s => s.put(value, key)),
    get: (store, key) => withStore(store, 'readonly', s => s.get(key)),
    delete: (store, key) => withStore(store, 'readwrite', s => s.delete(key)),
    getAll: store => withStore(store, 'readonly', s => s.getAll()),
    async selfTest() {
      const db = await open();
      const stores = Object.values(STORES);
      const missing = stores.filter(store => !db.objectStoreNames.contains(store));
      if (missing.length) throw new Error(`Missing IndexedDB stores: ${missing.join(', ')}`);
      const key = `selftest-${Date.now()}`;
      await api.put(STORES.cache, key, { ok: true, timestamp: Date.now() });
      const value = await api.get(STORES.cache, key);
      await api.delete(STORES.cache, key);
      if (!value?.ok) throw new Error('IndexedDB read/write self-test failed');
      return { ok: true, name: DB_NAME, version: DB_VERSION, stores };
    },
  };

  window.RideTrackerDatabase = api;
  api.selfTest()
    .then(result => window.dispatchEvent(new CustomEvent('ridetracker:database-ready', { detail: result })))
    .catch(error => window.dispatchEvent(new CustomEvent('ridetracker:database-error', { detail: { message: String(error?.message || error) } })));
})();
