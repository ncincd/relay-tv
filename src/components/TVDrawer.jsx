import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TV_KEYS } from '../lib/tizen-keys';
import { getProxyHost } from '../lib/config';

// Fixed row height keeps rows from ever being squeezed and enables windowed rendering
const ROW = 92;
const OVERSCAN = 3;

export default function TVDrawer({
  isOpen,
  onClose,
  channels = [],
  activeId,
  onPick,
  favs = [],
  onFav,
  epg = {},
  onOpenAddModal,
  onOpenUrlModal,
  onLoadUsChannels,
  useProxy,
  setUseProxy,
}) {
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'favs' | 'custom'
  const [group, setGroup] = useState('All');
  const [q, setQ] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [top, setTop] = useState(0);
  const [viewH, setViewH] = useState(640);

  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  const checkFav = (url) => {
    const target = (url || '').trim().replace(/\/+$/, '');
    return (
      Array.isArray(favs) &&
      favs.some((f) => {
        const u = (typeof f === 'string' ? f : f?.url || '').trim().replace(/\/+$/, '');
        return u === target;
      })
    );
  };

  const baseChannels = useMemo(() => {
    if (activeTab === 'favs') return channels.filter((c) => checkFav(c.url));
    if (activeTab === 'custom') return channels.filter((c) => c.isCustom);
    return channels;
  }, [activeTab, channels, favs]);

  const groups = useMemo(() => {
    return [...new Set(baseChannels.map((c) => c.group))].filter(Boolean);
  }, [baseChannels]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return baseChannels.filter(
      (c) => (group === 'All' || c.group === group) && (!s || c.name.toLowerCase().includes(s))
    );
  }, [baseChannels, group, q]);

  // Measure visible list height
  useEffect(() => {
    const measure = () => {
      if (listRef.current) setViewH(listRef.current.clientHeight || 640);
    };
    measure();
    const t = setTimeout(measure, 350); // after slide-in animation
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [isOpen]);

  // Scroll so that a given row is visible (manual, works on old TV webviews)
  const ensureVisible = (index, center = false) => {
    const el = listRef.current;
    if (!el) return;
    const h = el.clientHeight || viewH;
    const y = index * ROW;
    let next = el.scrollTop;
    if (center) {
      next = Math.max(0, y - h / 2 + ROW / 2);
    } else if (y < el.scrollTop) {
      next = y;
    } else if (y + ROW > el.scrollTop + h) {
      next = y + ROW - h;
    }
    el.scrollTop = next;
    setTop(next);
  };

  // On open: focus + center the channel currently playing
  useEffect(() => {
    if (!isOpen) return;
    const curIdx = filtered.findIndex((c) => String(c.id) === String(activeId));
    const idx = curIdx >= 0 ? curIdx : 0;
    setFocusedIndex(idx);
    const t = setTimeout(() => ensureVisible(idx, true), 30);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Keep focus index valid when filters change
  useEffect(() => {
    if (filtered.length === 0) {
      setFocusedIndex(0);
    } else if (focusedIndex >= filtered.length) {
      setFocusedIndex(filtered.length - 1);
    }
  }, [filtered.length]);

  // Follow focus with scrolling
  useEffect(() => {
    if (isOpen) ensureVisible(focusedIndex);
  }, [focusedIndex]);

  const moveFocus = (delta) => {
    setFocusedIndex((prev) => Math.max(0, Math.min(filtered.length - 1, prev + delta)));
  };

  // Remote key navigation inside drawer (capture phase so App-level handler never interferes)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      const inSearch = document.activeElement === searchInputRef.current;

      if (
        e.keyCode === TV_KEYS.RETURN ||
        e.key === 'Escape' ||
        (!inSearch && (e.key === 'ArrowLeft' || e.keyCode === TV_KEYS.LEFT))
      ) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.keyCode === TV_KEYS.YELLOW || e.keyCode === TV_KEYS.SEARCH) {
        e.preventDefault();
        e.stopPropagation();
        searchInputRef.current?.focus();
        return;
      }

      if (inSearch) {
        if (e.key === 'ArrowDown' || e.keyCode === TV_KEYS.DOWN || e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          e.stopPropagation();
          searchInputRef.current?.blur();
          setFocusedIndex(0);
        }
        return;
      }

      if (e.key === 'ArrowDown' || e.keyCode === TV_KEYS.DOWN) {
        e.preventDefault();
        e.stopPropagation();
        moveFocus(1);
        return;
      }
      if (e.key === 'ArrowUp' || e.keyCode === TV_KEYS.UP) {
        e.preventDefault();
        e.stopPropagation();
        if (focusedIndex === 0) searchInputRef.current?.focus();
        else moveFocus(-1);
        return;
      }
      // Channel +/- jump a whole page
      if (e.keyCode === TV_KEYS.CHANNEL_DOWN) {
        e.preventDefault();
        e.stopPropagation();
        moveFocus(7);
        return;
      }
      if (e.keyCode === TV_KEYS.CHANNEL_UP) {
        e.preventDefault();
        e.stopPropagation();
        moveFocus(-7);
        return;
      }
      if (e.key === 'Enter' || e.keyCode === TV_KEYS.ENTER || e.keyCode === 13) {
        e.preventDefault();
        e.stopPropagation();
        if (filtered[focusedIndex]) onPick(filtered[focusedIndex].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, filtered, focusedIndex, onClose, onPick]);

  const navTabs = [
    { id: 'all', label: 'All', icon: '📺', count: channels.length },
    { id: 'favs', label: 'Favorites', icon: '★', count: channels.filter((c) => checkFav(c.url)).length },
    { id: 'custom', label: 'My Streams', icon: '⚡', count: channels.filter((c) => c.isCustom).length },
  ];

  // Windowed rendering
  const total = filtered.length;
  const start = Math.max(0, Math.floor(top / ROW) - OVERSCAN);
  const end = Math.min(total, Math.ceil((top + viewH) / ROW) + OVERSCAN);

  // Visible scrollbar thumb
  const contentH = total * ROW;
  const canScroll = contentH > viewH;
  const thumbH = canScroll ? Math.max(56, (viewH * viewH) / contentH) : 0;
  const thumbTop = canScroll ? (top / (contentH - viewH)) * (viewH - thumbH) : 0;

  return (
    <>
      <div
        className={'tv-drawer-backdrop' + (isOpen ? ' open' : '')}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      <aside
        className={'tv-guide-drawer' + (isOpen ? ' open' : '')}
        aria-label="Channel Guide Drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-top-row">
            <div className="drawer-title-box">
              <span className="drawer-logo">▶</span>
              <h3>Channel Guide</h3>
            </div>
            <div className="drawer-quick-actions">
              <button className="drawer-action-btn primary" onClick={onOpenAddModal}>
                + Add
              </button>
              <button className="drawer-action-btn" onClick={onOpenUrlModal}>
                🔗 URL
              </button>
              <button className="drawer-close-btn" onClick={onClose} aria-label="Close guide">
                ✕
              </button>
            </div>
          </div>

          <div className="drawer-tabs-row" role="tablist">
            {navTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  className={'drawer-tab' + (isActive ? ' active' : '')}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setGroup('All');
                    setFocusedIndex(0);
                  }}
                >
                  <span>{tab.icon} {tab.label}</span>
                  {tab.count > 0 && <small>{tab.count}</small>}
                </button>
              );
            })}
          </div>

          <div className="drawer-search-box">
            <span className="search-glyph">🔍</span>
            <input
              ref={searchInputRef}
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setFocusedIndex(0);
                if (listRef.current) listRef.current.scrollTop = 0;
                setTop(0);
              }}
              placeholder={`Search ${baseChannels.length} channels…  (🟡)`}
              aria-label="Search channels"
            />
            {q && (
              <button className="search-clear-btn" onClick={() => setQ('')}>
                ✕
              </button>
            )}
          </div>

          {groups.length > 0 && (
            <div className="drawer-chips-bar">
              {['All', ...groups].map((g) => (
                <button
                  key={g}
                  className={'drawer-chip' + (g === group ? ' active' : '')}
                  onClick={() => {
                    setGroup(g);
                    setFocusedIndex(0);
                    if (listRef.current) listRef.current.scrollTop = 0;
                    setTop(0);
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Channel list: fixed-height absolutely positioned rows inside a scrollable box */}
        <div className="drawer-list-wrap">
          <div
            className="drawer-channel-list"
            ref={listRef}
            onScroll={(e) => setTop(e.currentTarget.scrollTop)}
          >
            {total > 0 ? (
              <div className="drawer-list-inner" style={{ height: contentH }}>
                {filtered.slice(start, end).map((c, k) => {
                  const index = start + k;
                  const isPlaying = String(c.id) === String(activeId);
                  const isFocused = index === focusedIndex;
                  const isFavorited = checkFav(c.url);
                  const currentProg = (epg[c.tvgId] || []).find(
                    (x) => x.s <= Date.now() && Date.now() < x.e
                  );

                  return (
                    <div
                      key={c.id ?? index}
                      className={
                        'drawer-channel-row' +
                        (isPlaying ? ' is-playing' : '') +
                        (isFocused ? ' is-focused' : '')
                      }
                      style={{ top: index * ROW, height: ROW - 8 }}
                      onClick={() => onPick(c.id)}
                      onMouseEnter={() => setFocusedIndex(index)}
                    >
                      <div className="drawer-ch-logo">
                        {c.logo ? (
                          <img src={c.logo} alt="" loading="lazy" />
                        ) : (
                          <span className="ch-avatar">{(c.name || 'C').slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>

                      <div className="drawer-ch-info">
                        <div className="drawer-ch-title-row">
                          <b className="drawer-ch-name">{c.name}</b>
                          {isPlaying && <span className="playing-badge">PLAYING</span>}
                        </div>
                        <div className="drawer-ch-meta-row">
                          <span className="drawer-ch-group">{c.group || 'Live Stream'}</span>
                          <span className="drawer-ch-number">CH {String(index + 1).padStart(3, '0')}</span>
                        </div>
                        {currentProg?.t && <div className="drawer-ch-program">▶ {currentProg.t}</div>}
                      </div>

                      <button
                        className={'drawer-star-btn' + (isFavorited ? ' on' : '')}
                        onClick={(e) => {
                          e.stopPropagation();
                          onFav && onFav(c);
                        }}
                        title={isFavorited ? 'Remove favorite' : 'Add favorite'}
                      >
                        {isFavorited ? '★' : '☆'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="drawer-empty-state">
                <p>No channels found.</p>
                {activeTab === 'custom' && (
                  <button className="primary" onClick={onOpenAddModal}>
                    + Add First Stream
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Always-visible scroll indicator */}
          {canScroll && (
            <div className="drawer-scroll-track" aria-hidden="true">
              <div className="drawer-scroll-thumb" style={{ height: thumbH, top: thumbTop }} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <div className="drawer-footer-top">
            <div className="drawer-remote-hints">
              <span><kbd>▲</kbd><kbd>▼</kbd> Browse</span>
              <span><kbd>OK</kbd> Watch</span>
              <span><kbd>◀</kbd> Close</span>
            </div>
            <div className="drawer-position">
              {total > 0 ? `${focusedIndex + 1} / ${total}` : '0 / 0'}
            </div>
          </div>

          <div className="drawer-footer-status">
            {setUseProxy && (
              <label
                className="drawer-proxy-switch"
                title={useProxy ? `Streaming via LAN Proxy (${getProxyHost()})` : 'Direct Stream'}
              >
                <input
                  type="checkbox"
                  checked={useProxy}
                  onChange={(e) => setUseProxy(e.target.checked)}
                />
                <span className={'status-dot' + (useProxy ? ' proxy-on' : ' direct-on')} />
                <span>{useProxy ? 'LAN Proxy Active' : 'Direct Play'}</span>
              </label>
            )}
            <button className="us-reload-btn" onClick={onLoadUsChannels}>
              🇺🇸 US Channels
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
