import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getEpgUrl, isStream, parseM3U } from './lib/m3u';
import { fetchEpg } from './lib/epg';
import { registerTizenKeys, exitTizenApp, TV_KEYS } from './lib/tizen-keys';
import { getPlaylistApiUrl } from './lib/config';
import {
  safeStorage,
  loadFavorites,
  saveFavorites,
  loadRecent,
  saveRecent,
  loadCustomChannels,
  saveCustomChannels,
  syncStorageFromDatabase,
  cleanUrl,
} from './lib/storage';
import Player from './components/Player';
import TVDrawer from './components/TVDrawer';
import AddChannelModal from './components/AddChannelModal';

export const DEFAULT_PLAYLIST_NAME = 'US CHANNELS';
export const DEFAULT_PLAYLIST_URL = 'https://iptv-org.github.io/iptv/countries/us.m3u';

export default function App() {
  // Navigation & Drawer states
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [pasteModal, setPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState('');

  // Channels state - initialized synchronously from persistent storage
  const [customChannels, setCustomChannels] = useState(() => loadCustomChannels());
  const [importedChannels, setImportedChannels] = useState(() => {
    const cachedM3U = safeStorage.getItem('relay.cachedPlaylist');
    const savedUrl = safeStorage.getItem('relay.url', DEFAULT_PLAYLIST_URL);
    if (cachedM3U) {
      try {
        return isStream(cachedM3U)
          ? [{ id: 's-0', name: 'Live Stream', logo: '', group: 'Live', url: savedUrl }]
          : parseM3U(cachedM3U);
      } catch {}
    }
    return [];
  });
  const [activeId, setActiveId] = useState(null);

  // Favorites & Recents
  const [favChannels, setFavChannels] = useState(() => loadFavorites());
  const [recentChannels, setRecentChannels] = useState(() => loadRecent());

  // URL & EPG state
  const [inputUrl, setInputUrl] = useState(() => safeStorage.getItem('relay.url', DEFAULT_PLAYLIST_URL));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [useProxy, setUseProxy] = useState(false);
  const [epg, setEpg] = useState({});
  const [epgUrl, setEpgUrl] = useState(() => safeStorage.getItem('relay.epg', ''));
  const [savedPlaylists, setSavedPlaylists] = useState(() => {
    const rawSaved = safeStorage.getJSON('relay.savedPlaylists', []);
    if (!rawSaved.includes(DEFAULT_PLAYLIST_URL)) {
      rawSaved.unshift(DEFAULT_PLAYLIST_URL);
    }
    return rawSaved;
  });

  // Register physical TV hardware keys on launch
  useEffect(() => {
    registerTizenKeys();
  }, []);

  // Merge custom user-added channels and imported channels
  const allChannels = useMemo(() => {
    return [...customChannels, ...importedChannels];
  }, [customChannels, importedChannels]);

  // Array of favorited stream URLs
  const favUrlList = useMemo(() => {
    return favChannels.map((f) => f.url);
  }, [favChannels]);

  // Multi-tier recovery from IndexedDB (SQLite) and initial playlist fetch
  useEffect(() => {
    const savedUrl = safeStorage.getItem('relay.url', DEFAULT_PLAYLIST_URL);
    const hasCached = Boolean(safeStorage.getItem('relay.cachedPlaylist'));
    loadPlaylist(savedUrl, !hasCached);

    syncStorageFromDatabase((type, items) => {
      if (type === 'favs') setFavChannels(items);
      if (type === 'recent') setRecentChannels(items);
      if (type === 'custom') setCustomChannels(items);
    });
  }, []);

  // Set initial playing channel on boot
  useEffect(() => {
    if (activeId !== null) return;
    const pool = [...customChannels, ...favChannels, ...recentChannels, ...importedChannels];
    if (!pool.length) return;

    const lastUrl = safeStorage.getItem('relay.lastChannelUrl');
    let matched = lastUrl ? pool.find((c) => c.url === lastUrl) : null;
    if (!matched) {
      matched = pool.find((c) => c.name.toLowerCase().includes('3abn english')) || pool[0];
    }
    setActiveId(matched ? matched.id : pool[0].id);
  }, [customChannels, favChannels, recentChannels, importedChannels, activeId]);

  // Add custom channel
  const handleAddCustomChannel = (channelData) => {
    const newChan = {
      ...channelData,
      id: 'custom-' + Date.now(),
      isCustom: true,
    };
    const updated = [newChan, ...customChannels];
    setCustomChannels(updated);
    saveCustomChannels(updated);
    setActiveId(newChan.id);
    setMsg(`Added channel "${newChan.name}"!`);
    setTimeout(() => setMsg(''), 4000);
  };

  // Delete custom channel
  const handleDeleteCustomChannel = (id) => {
    const updated = customChannels.filter((c) => String(c.id) !== String(id));
    setCustomChannels(updated);
    saveCustomChannels(updated);
    if (String(activeId) === String(id)) {
      const remaining = [...updated, ...importedChannels];
      setActiveId(remaining[0]?.id || null);
    }
  };

  // Ingest playlist
  const ingest = (text, url) => {
    if (isStream(text) && !url) {
      throw new Error('That is a single stream. Use "Add Channel" to give it a name.');
    }
    const list = isStream(text)
      ? [{ id: 'p-0', name: 'Live stream', logo: '', group: 'Live', url }]
      : parseM3U(text);

    if (!list.length) throw new Error('No channels found in that playlist.');

    const guideUrl = getEpgUrl(text);
    if (guideUrl) {
      setEpgUrl(guideUrl);
      safeStorage.setItem('relay.epg', guideUrl);
    }

    setImportedChannels(list);

    const lastUrl = safeStorage.getItem('relay.lastChannelUrl');
    let matched = lastUrl ? list.find((c) => c.url === lastUrl) : null;
    if (!matched) {
      matched = list.find((c) => c.name.toLowerCase().includes('3abn english')) || list[0];
    }
    setActiveId(matched ? matched.id : list[0]?.id);
  };

  // Load playlist from URL
  const loadPlaylist = async (url, showBusy = true) => {
    if (showBusy) setBusy(true);
    setMsg('');
    try {
      let text = '';
      try {
        const res = await fetch(getPlaylistApiUrl(url));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
      } catch {
        const res2 = await fetch(url);
        if (!res2.ok) throw new Error(`Could not load playlist`);
        text = await res2.text();
      }

      ingest(text, url);
      try {
        safeStorage.setItem('relay.url', url);
        safeStorage.setItem('relay.cachedPlaylist', text);
        setSavedPlaylists((prev) => {
          const next = [url, ...prev.filter((x) => x !== url)].slice(0, 8);
          safeStorage.setItem('relay.savedPlaylists', next);
          return next;
        });
      } catch {}
    } catch (e) {
      if (showBusy) setMsg(e.message || 'Failed to load playlist');
    }
    if (showBusy) setBusy(false);
  };

  // Toggle favorite channel
  const toggleFav = (channelOrUrl) => {
    const rawUrl = typeof channelOrUrl === 'string' ? channelOrUrl : channelOrUrl?.url;
    if (!rawUrl) return;
    const targetUrl = rawUrl.trim();
    const cleanTarget = cleanUrl(targetUrl);

    setFavChannels((prevFavs) => {
      const isAlreadyFav = prevFavs.some((f) => cleanUrl(f.url) === cleanTarget);
      let updated;
      if (isAlreadyFav) {
        updated = prevFavs.filter((f) => cleanUrl(f.url) !== cleanTarget);
      } else {
        const chanObj =
          typeof channelOrUrl === 'object' && channelOrUrl?.name
            ? channelOrUrl
            : allChannels.find((c) => cleanUrl(c.url) === cleanTarget) ||
              recentChannels.find((c) => cleanUrl(c.url) === cleanTarget) ||
              { name: 'Live Channel', url: targetUrl, group: 'Favorites' };

        const newFav = {
          id: chanObj.id !== undefined && chanObj.id !== null ? String(chanObj.id) : `fav-${Date.now()}`,
          name: chanObj.name || 'Live Channel',
          url: targetUrl,
          logo: chanObj.logo || '',
          group: chanObj.group || 'Favorites',
          tvgId: chanObj.tvgId || '',
        };
        updated = [newFav, ...prevFavs];
      }
      saveFavorites(updated);
      return updated;
    });
  };

  // Master channel resolver
  const active = useMemo(() => {
    if (activeId === null || activeId === undefined) {
      return allChannels[0] || favChannels[0] || recentChannels[0] || null;
    }
    const idStr = String(activeId);
    return (
      allChannels.find((c) => String(c.id) === idStr) ||
      favChannels.find((c) => String(c.id) === idStr) ||
      recentChannels.find((c) => String(c.id) === idStr) ||
      allChannels.find((c) => c.url === activeId) ||
      favChannels.find((c) => c.url === activeId) ||
      recentChannels.find((c) => c.url === activeId) ||
      null
    );
  }, [allChannels, favChannels, recentChannels, activeId]);

  // Remember last playing channel URL
  useEffect(() => {
    if (!active?.url) return;
    safeStorage.setItem('relay.lastChannelUrl', active.url);
  }, [active?.url]);

  // Save to Recents
  useEffect(() => {
    if (!active?.url) return;
    const t = setTimeout(() => {
      setRecentChannels((prevRecent) => {
        const newEntry = {
          id: active.id !== undefined && active.id !== null ? String(active.id) : `rec-${Date.now()}`,
          name: active.name || 'Live Channel',
          url: active.url,
          logo: active.logo || '',
          group: active.group || 'Recent',
          tvgId: active.tvgId || '',
        };
        const filtered = prevRecent.filter((x) => x.url !== active.url);
        const next = [newEntry, ...filtered].slice(0, 25);
        saveRecent(next);
        return next;
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [active?.url, active?.name]);

  // EPG program schedule fetching
  useEffect(() => {
    const ids = [...new Set(allChannels.map((c) => c.tvgId).filter(Boolean))];
    if (!epgUrl || !ids.length) {
      setEpg({});
      return;
    }
    let dead = false;
    fetchEpg(epgUrl, ids)
      .then((data) => {
        if (!dead) setEpg(data);
      })
      .catch(() => {
        if (!dead) setEpg({});
      });

    return () => {
      dead = true;
    };
  }, [epgUrl, allChannels]);

  // Channel step for TV Remote ChannelUp / ChannelDown buttons
  const step = useCallback(
    (delta) => {
      if (!allChannels.length) return;
      const i = allChannels.findIndex((c) => String(c.id) === String(activeId));
      const nextIdx = (i + delta + allChannels.length) % allChannels.length;
      setActiveId(allChannels[nextIdx].id);
    },
    [allChannels, activeId]
  );

  // Global Hardware TV Remote Key Handling
  useEffect(() => {
    const onKey = (e) => {
      const isInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);

      // Back / Return Button
      if (e.keyCode === TV_KEYS.RETURN || e.key === 'Escape') {
        e.preventDefault();
        if (addModalOpen) {
          setAddModalOpen(false);
          return;
        }
        if (urlModalOpen) {
          setUrlModalOpen(false);
          return;
        }
        if (pasteModal) {
          setPasteModal(false);
          return;
        }
        if (drawerOpen) {
          setDrawerOpen(false);
          return;
        }
        // If in full screen with everything closed, exit app
        exitTizenApp();
        return;
      }

      // If drawer is closed, pressing RIGHT or ENTER or GUIDE or INFO or YELLOW opens the drawer!
      if (!drawerOpen && !addModalOpen && !urlModalOpen && !pasteModal && !isInput) {
        if (
          e.key === 'ArrowRight' ||
          e.keyCode === TV_KEYS.RIGHT ||
          e.key === 'Enter' ||
          e.keyCode === TV_KEYS.ENTER ||
          e.keyCode === 13 ||
          e.keyCode === TV_KEYS.GUIDE ||
          e.keyCode === TV_KEYS.INFO ||
          e.keyCode === TV_KEYS.YELLOW ||
          e.keyCode === TV_KEYS.SEARCH
        ) {
          e.preventDefault();
          setDrawerOpen(true);
          return;
        }
      }

      // Channel Up / Channel Down hardware rocker keys on remote
      if (e.keyCode === TV_KEYS.CHANNEL_DOWN || e.key === 'ChannelDown') {
        e.preventDefault();
        step(1);
        return;
      }
      if (e.keyCode === TV_KEYS.CHANNEL_UP || e.key === 'ChannelUp') {
        e.preventDefault();
        step(-1);
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, drawerOpen, addModalOpen, urlModalOpen, pasteModal]);

  const handleLoadUsChannels = () => {
    setInputUrl(DEFAULT_PLAYLIST_URL);
    loadPlaylist(DEFAULT_PLAYLIST_URL, true);
    setMsg('Loaded US CHANNELS playlist!');
    setTimeout(() => setMsg(''), 4000);
  };

  return (
    <div className="tv-app-root">
      {/* 1. Fullscreen Video Stage (100% of TV Viewport) */}
      {active ? (
        <Player
          channel={active}
          index={allChannels.indexOf(active) >= 0 ? allChannels.indexOf(active) : 0}
          programs={epg[active.tvgId] || []}
          useProxy={useProxy}
          setUseProxy={setUseProxy}
          onOpenDrawer={() => setDrawerOpen(true)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          favs={favUrlList}
          onFav={toggleFav}
        />
      ) : (
        <div className="tv-welcome-fullscreen">
          <div className="tv-welcome-box">
            <h1>Relay TV</h1>
            <p>Welcome to Relay TV for Samsung Smart TV.</p>
            <div className="welcome-buttons">
              <button className="primary tv-big-btn" onClick={handleLoadUsChannels}>
                🇺🇸 Load US Live Channels
              </button>
              <button className="tv-big-btn" onClick={() => setAddModalOpen(true)}>
                + Add Custom Stream
              </button>
              <button className="tv-big-btn" onClick={() => setUrlModalOpen(true)}>
                🔗 Load Playlist URL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Slide-In TV Guide Drawer (Overlay from the RIGHT) */}
      <TVDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        channels={allChannels}
        activeId={activeId}
        onPick={(id) => {
          setActiveId(id);
          setDrawerOpen(false);
        }}
        favs={favUrlList}
        onFav={toggleFav}
        onDeleteChannel={handleDeleteCustomChannel}
        epg={epg}
        onOpenAddModal={() => {
          setDrawerOpen(false);
          setAddModalOpen(true);
        }}
        onOpenUrlModal={() => {
          setDrawerOpen(false);
          setUrlModalOpen(true);
        }}
        onLoadUsChannels={handleLoadUsChannels}
        useProxy={useProxy}
        setUseProxy={setUseProxy}
      />

      {/* 3. Notification Toast */}
      {msg && <div className="tv-toast-banner">{msg}</div>}

      {/* 4. Add Custom Channel Modal */}
      <AddChannelModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAddChannel={handleAddCustomChannel}
        onAddPlaylist={(url) => loadPlaylist(url)}
      />

      {/* 5. Load Playlist URL Modal */}
      {urlModalOpen && (
        <div className="modal-overlay" onClick={() => setUrlModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Load Playlist URL</h2>
              <button className="modal-close-btn" onClick={() => setUrlModalOpen(false)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (inputUrl.trim()) {
                  loadPlaylist(inputUrl.trim());
                  setUrlModalOpen(false);
                }
              }}
            >
              <div className="modal-body">
                <label>M3U or M3U8 Playlist URL</label>
                <input
                  type="text"
                  list="modal-saved-playlists"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://example.com/playlist.m3u"
                  autoFocus
                />
                <datalist id="modal-saved-playlists">
                  <option value={DEFAULT_PLAYLIST_URL}>US CHANNELS (Default)</option>
                  {savedPlaylists
                    .filter((u) => u !== DEFAULT_PLAYLIST_URL)
                    .map((u, i) => (
                      <option key={i} value={u} />
                    ))}
                </datalist>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setUrlModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={busy || !inputUrl.trim()}>
                  {busy ? 'Loading…' : 'Load Playlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Paste Playlist Modal */}
      {pasteModal && (
        <div className="modal-overlay" onClick={() => setPasteModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Paste M3U Playlist Content</h2>
              <button className="modal-close-btn" onClick={() => setPasteModal(false)}>
                ✕
              </button>
            </div>
            <textarea
              rows={8}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste raw #EXTM3U text here..."
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setPasteModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!pastedText.trim()}
                onClick={() => {
                  try {
                    ingest(pastedText, '');
                    setMsg('Loaded pasted playlist!');
                    setPasteModal(false);
                    try {
                      safeStorage.setItem('relay.cachedPlaylist', pastedText);
                      safeStorage.removeItem('relay.url');
                    } catch {}
                  } catch (e) {
                    setMsg(e.message);
                  }
                }}
              >
                Load List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
