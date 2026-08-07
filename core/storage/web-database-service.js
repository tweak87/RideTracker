(() => {
  'use strict';

  const DB_NAME = 'RideTrackerMedia';
  const MIN_SCHEMA_VERSION = 6;
  const STORES = Object.freeze({
    videos: 'videos',
    ridePackages: 'ridePackages',
    settings: 'settings',
    cache: 'cache',
  });

  const nativeOpen = indexedDB.open.bind(indexedDB);
  let openPromise = null;
  let activeVersion = 0;

  function missingStores(db) {
    return Object.values(STORES).filter(store => !db.objectStoreNames.contains(store));
  }

  function upgrade(db) {
    for (const store of Object.values(STORES)) {
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    }
  }

  function rawOpen(version, repair = false) {
    return new Promise((resolve, reject) => {
      const request = version == null ? nativeOpen(DB_NAME) : nativeOpen(DB_NAME, version);
      if (repair) request.onupgradeneeded = () => upgrade(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      request.onblocked = () => console.warn('[RideTracker DB] Upgrade blocked by another tab.');
      request.onsuccess = () => resolve(request.result);
    });
  }

  function attachLifecycle(db) {
    activeVersion = db.version;
    db.onversionchange = () => {
      db.close();
      openPromise = null;
    };
    return db;
  }

  async function inspectAndRepair() {
    let db = await rawOpen(null, false);
    let missing = missingStores(db);
    const needsVersionUpgrade = db.version < MIN_SCHEMA_VERSION;

    if (!missing.length && !needsVersionUpgrade) return attachLifecycle(db);

    const previousVersion = db.version;
    db.close();
    const repairVersion = Math.max(MIN_SCHEMA_VERSION, previousVersion + 1);
    db = await rawOpen(repairVersion, true);
    missing = missingStores(db);
    if (missing.length) {
      const present = [...db.objectStoreNames];
      db.close();
      throw new Error(`RideTracker IndexedDB repair failed at v${repairVersion}: missing ${missing.join(', ')}; present ${present.join(', ')}`);
    }

    window.dispatchEvent(new CustomEvent('ridetracker:database-repaired', {
      detail: { fromVersion: previousVersion, toVersion: db.version, stores: [...db.objectStoreNames] }
    }));
    return attachLifecycle(db);
  }

  function open() {
    if (!openPromise) {
      openPromise = inspectAndRepair().catch(error => {
        openPromise = null;
        throw error;
      });
    }
    return openPromise;
  }

  async function withStore(store, mode, operation, retry = true) {
    if (!Object.values(STORES).includes(store)) throw new Error(`Unknown RideTracker store: ${store}`);
    const db = await open();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(store, mode);
      } catch (error) {
        if (retry) {
          try { db.close(); } catch (_) {}
          openPromise = null;
          void withStore(store, mode, operation, false).then(resolve, reject);
          return;
        }
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
    minimumSchemaVersion: MIN_SCHEMA_VERSION,
    get version() { return activeVersion || MIN_SCHEMA_VERSION; },
    stores: STORES,
    open,
    put: (store, key, value) => withStore(store, 'readwrite', s => s.put(value, key)),
    get: (store, key) => withStore(store, 'readonly', s => s.get(key)),
    delete: (store, key) => withStore(store, 'readwrite', s => s.delete(key)),
    getAll: store => withStore(store, 'readonly', s => s.getAll()),
    async selfTest() {
      const db = await open();
      const missing = missingStores(db);
      if (missing.length) throw new Error(`Missing IndexedDB stores after repair: ${missing.join(', ')}`);
      const key = `selftest-${Date.now()}`;
      await api.put(STORES.cache, key, { ok: true, timestamp: Date.now() });
      const value = await api.get(STORES.cache, key);
      await api.delete(STORES.cache, key);
      if (!value?.ok) throw new Error('IndexedDB read/write self-test failed');
      return { ok: true, name: DB_NAME, version: db.version, stores: [...db.objectStoreNames] };
    },
  };

  window.RideTrackerDatabase = api;
  api.ready = api.selfTest()
    .then(result => {
      window.dispatchEvent(new CustomEvent('ridetracker:database-ready', { detail: result }));
      return result;
    })
    .catch(error => {
      window.dispatchEvent(new CustomEvent('ridetracker:database-error', { detail: { message: String(error?.message || error) } }));
      throw error;
    });
})();
