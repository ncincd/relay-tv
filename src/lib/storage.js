// Triple-Layer Persistent Storage Engine for Relay TV:
// Layer 1: window.localStorage (instant synchronous in-memory cache)
// Layer 2: IndexedDB (Transactional persistent disk database - browser SQLite equivalent)
// Layer 3: Samsung Tizen Native Filesystem (wgt-private/ physical files on TV flash memory)

const STORAGE_KEYS = {
  FAVS: 'relay.favs',
  RECENT: 'relay.recent',
  CUSTOM: 'relay.customChannels',
  URL: 'relay.url',
  CACHED_PLAYLIST: 'relay.cachedPlaylist',
  SAVED_PLAYLISTS: 'relay.savedPlaylists',
  LAST_CHANNEL: 'relay.lastChannelUrl',
  EPG: 'relay.epg',
};

// URL cleaner to avoid whitespace/trailing slash matching issues
export const cleanUrl = (u) => (u ? String(u).trim().replace(/\/+$/, '') : '');

// ----------------------------------------------------
// Layer 1: Safe Synchronous LocalStorage with Quota Recovery
// ----------------------------------------------------
export const safeStorage = {
  getItem(key, fallback = null) {
    if (typeof window === 'undefined') return fallback;
    try {
      const val = window.localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch (e) {
      console.warn(`[Storage] Read error for "${key}":`, e);
      return fallback;
    }
  },

  setItem(key, value) {
    if (typeof window === 'undefined') return false;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    try {
      window.localStorage.setItem(key, str);
      return true;
    } catch (e) {
      console.warn(`[Storage] Write error for "${key}":`, e);
      // If quota reached, clear non-essential cached playlist to prioritize favorites and recents
      try {
        window.localStorage.removeItem(STORAGE_KEYS.CACHED_PLAYLIST);
        window.localStorage.setItem(key, str);
        return true;
      } catch (err2) {
        console.error('[Storage] LocalStorage full. Delegating to IndexedDB & TV Filesystem.');
      }
      return false;
    }
  },

  getJSON(key, fallback = []) {
    const raw = safeStorage.getItem(key, null);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },

  removeItem(key) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {}
  },
};

// ----------------------------------------------------
// Layer 2: IndexedDB Database (Browser/TV Disk SQLite Engine)
// ----------------------------------------------------
const DB_NAME = 'RelayTV_Database';
const DB_VERSION = 1;
const STORE_NAME = 'storage_records';

function openIDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(key, fallback = null) {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : fallback);
      req.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  }
}

export async function idbSet(key, value) {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// Layer 3: Samsung Tizen Native TV Filesystem (wgt-private/ flash memory)
// ----------------------------------------------------
export function saveToTizenFilesystem(fileName, data) {
  if (typeof window === 'undefined' || !window.tizen?.filesystem) return;
  try {
    window.tizen.filesystem.resolve('wgt-private', (dir) => {
      try {
        let file;
        try {
          file = dir.resolve(fileName);
        } catch {
          file = dir.createFile(fileName);
        }
        file.openStream(
          'w',
          (stream) => {
            stream.write(typeof data === 'string' ? data : JSON.stringify(data));
            stream.close();
            console.log(`[Tizen TV Flash Storage] Saved ${fileName}`);
          },
          () => {},
          'UTF-8'
        );
      } catch {}
    });
  } catch {}
}

export function loadFromTizenFilesystem(fileName, callback) {
  if (typeof window === 'undefined' || !window.tizen?.filesystem) return;
  try {
    window.tizen.filesystem.resolve('wgt-private', (dir) => {
      try {
        const file = dir.resolve(fileName);
        file.openStream(
          'r',
          (stream) => {
            const content = stream.read(file.fileSize);
            stream.close();
            if (content) {
              try {
                const parsed = JSON.parse(content);
                callback(parsed);
              } catch {}
            }
          },
          () => {},
          'UTF-8'
        );
      } catch {}
    });
  } catch {}
}

// ----------------------------------------------------
// Channel Normalizer
// ----------------------------------------------------
export function normalizeChannel(c, index = 0, prefix = 'chan') {
  if (!c) return null;
  if (typeof c === 'string') {
    return {
      id: `${prefix}-${index}-${encodeURIComponent(c).slice(0, 20)}`,
      name: 'Channel ' + (index + 1),
      url: c.trim(),
      logo: '',
      group: 'Favorites',
      tvgId: '',
      isCustom: false,
    };
  }

  const url = (c.url || '').trim();
  const id = c.id !== undefined && c.id !== null ? String(c.id) : `${prefix}-${index}-${Date.now()}`;
  return {
    id,
    name: c.name || 'Live Channel',
    url,
    logo: c.logo || '',
    group: c.group || 'Live',
    tvgId: c.tvgId || '',
    isCustom: Boolean(c.isCustom),
  };
}

// ----------------------------------------------------
// High-Level Multi-Tier Persistence APIs
// ----------------------------------------------------

/**
 * Loads favorites list from memory (synchronous from localStorage with background IDB sync)
 */
export function loadFavorites() {
  const raw = safeStorage.getJSON(STORAGE_KEYS.FAVS, []);
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => normalizeChannel(item, idx, 'fav')).filter(Boolean);
}

/**
 * Saves favorites list across all three storage layers simultaneously
 */
export function saveFavorites(list) {
  // 1. LocalStorage (instant synchronous)
  safeStorage.setItem(STORAGE_KEYS.FAVS, list);

  // 2. IndexedDB (persistent disk database)
  idbSet(STORAGE_KEYS.FAVS, list).catch(() => {});

  // 3. Samsung TV Native Filesystem (flash memory disk)
  saveToTizenFilesystem('favorites.json', list);

  return true;
}

/**
 * Loads recent channels list
 */
export function loadRecent() {
  const raw = safeStorage.getJSON(STORAGE_KEYS.RECENT, []);
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => normalizeChannel(item, idx, 'rec')).filter(Boolean);
}

/**
 * Saves recent channels list across all storage tiers
 */
export function saveRecent(list) {
  const trimmed = list.slice(0, 25);
  safeStorage.setItem(STORAGE_KEYS.RECENT, trimmed);
  idbSet(STORAGE_KEYS.RECENT, trimmed).catch(() => {});
  saveToTizenFilesystem('recent.json', trimmed);
  return true;
}

/**
 * Loads custom channels list
 */
export function loadCustomChannels() {
  const raw = safeStorage.getJSON(STORAGE_KEYS.CUSTOM, []);
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => normalizeChannel(item, idx, 'custom')).filter(Boolean);
}

/**
 * Saves custom channels list across all tiers
 */
export function saveCustomChannels(list) {
  safeStorage.setItem(STORAGE_KEYS.CUSTOM, list);
  idbSet(STORAGE_KEYS.CUSTOM, list).catch(() => {});
  saveToTizenFilesystem('custom_channels.json', list);
  return true;
}

/**
 * Multi-tier background recovery: if localStorage was wiped or empty,
 * recovers from IndexedDB or Tizen Filesystem
 */
export async function syncStorageFromDatabase(onRecovered) {
  try {
    const idbFavs = await idbGet(STORAGE_KEYS.FAVS, null);
    if (Array.isArray(idbFavs) && idbFavs.length > 0) {
      const local = loadFavorites();
      if (!local.length) {
        console.log('[Storage Engine] Recovered favorites from IndexedDB disk database!');
        saveFavorites(idbFavs);
        onRecovered?.('favs', idbFavs);
      }
    }

    const idbRecent = await idbGet(STORAGE_KEYS.RECENT, null);
    if (Array.isArray(idbRecent) && idbRecent.length > 0) {
      const local = loadRecent();
      if (!local.length) {
        saveRecent(idbRecent);
        onRecovered?.('recent', idbRecent);
      }
    }

    const idbCustom = await idbGet(STORAGE_KEYS.CUSTOM, null);
    if (Array.isArray(idbCustom) && idbCustom.length > 0) {
      const local = loadCustomChannels();
      if (!local.length) {
        saveCustomChannels(idbCustom);
        onRecovered?.('custom', idbCustom);
      }
    }

    // Check Samsung Tizen TV flash storage as well
    loadFromTizenFilesystem('favorites.json', (tizenFavs) => {
      if (Array.isArray(tizenFavs) && tizenFavs.length > 0) {
        const local = loadFavorites();
        if (!local.length) {
          console.log('[Tizen TV] Recovered favorites from TV flash memory!');
          saveFavorites(tizenFavs);
          onRecovered?.('favs', tizenFavs);
        }
      }
    });
  } catch (err) {
    console.warn('[Storage Engine] Sync check:', err);
  }
}
