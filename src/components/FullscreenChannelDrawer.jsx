import React, { useEffect, useMemo, useRef, useState } from 'react';

const ROW = 76;

export default function FullscreenChannelDrawer({
  isOpen,
  onClose,
  channels = [],
  activeId,
  onPick,
  favs = [],
  onFav,
  epg = {},
}) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('All');
  const boxRef = useRef(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);

  // Measure scroll container height
  useEffect(() => {
    if (!boxRef.current) return;
    const update = () => {
      if (boxRef.current) setHeight(boxRef.current.clientHeight || 600);
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      try {
        const ro = new ResizeObserver(update);
        ro.observe(boxRef.current);
        return () => ro.disconnect();
      } catch (e) {
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
      }
    } else {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
  }, [isOpen]);

  // Extract categories
  const groups = useMemo(() => {
    return [...new Set(channels.map((c) => c.group))].filter(Boolean);
  }, [channels]);

  // Helper to check if a channel is favorited
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

  // Filter channels
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return channels.filter(
      (c) =>
        (group === 'All' ||
          (group === 'Favorites' ? checkFav(c.url) : c.group === group)) &&
        (!s || c.name.toLowerCase().includes(s))
    );
  }, [channels, group, q, favs]);

  // Auto-scroll to active channel when opened
  useEffect(() => {
    if (!isOpen || !boxRef.current) return;
    const i = filtered.findIndex((c) => c.id === activeId);
    if (i < 0) return;
    const y = i * ROW;
    boxRef.current.scrollTop = Math.max(0, y - height / 2 + ROW / 2);
  }, [isOpen, activeId, filtered, height]);

  // Virtual scrolling slice
  const start = Math.max(0, Math.floor(top / ROW) - 4);
  const end = Math.min(filtered.length, start + Math.ceil(height / ROW) + 8);

  const getAvatarBg = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 25%)`;
  };

  return (
    <div className={'fs-drawer-backdrop' + (isOpen ? ' open' : '')} onClick={onClose}>
      <aside
        className={'fs-channel-drawer' + (isOpen ? ' open' : '')}
        onClick={(e) => e.stopPropagation()}
        aria-label="Fullscreen Channels Overlay"
      >
        {/* Drawer Header */}
        <div className="fs-drawer-header">
          <div className="fs-header-title-row">
            <div className="fs-title-box">
              <span className="live-pulse" />
              <h3>Channel Guide</h3>
            </div>
            <button className="fs-close-btn" onClick={onClose} aria-label="Close channel drawer">
              ✕
            </button>
          </div>

          <div className="fs-search-box">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${filtered.length} channels…`}
              autoFocus={isOpen}
            />
          </div>

          {groups.length > 0 && (
            <div className="fs-category-chips">
              {['All', 'Favorites', ...groups].map((g) => (
                <button
                  key={g}
                  className={'fs-chip' + (g === group ? ' active' : '')}
                  onClick={() => setGroup(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable Virtual Channels List */}
        <div
          className="fs-channels-list"
          ref={boxRef}
          onScroll={(e) => setTop(e.currentTarget.scrollTop)}
          tabIndex={0}
        >
          {filtered.length > 0 ? (
            <div style={{ height: filtered.length * ROW, position: 'relative' }}>
              {filtered.slice(start, end).map((c, k) => {
                const index = start + k;
                const isCurrent = c.id === activeId;
                const fav = checkFav(c.url);
                const currentProg = (epg[c.tvgId] || []).find(
                  (x) => x.s <= Date.now() && Date.now() < x.e
                );

                return (
                  <div
                    key={c.id ?? index}
                    className={'fs-channel-row' + (isCurrent ? ' active' : '')}
                    style={{ top: index * ROW }}
                    onClick={() => {
                      onPick(c.id);
                    }}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.keyCode === 13) {
                        onPick(c.id);
                      }
                    }}
                  >
                    <div
                      className="fs-logo"
                      style={{
                        background: !c.logo ? getAvatarBg(c.name || 'C') : undefined,
                      }}
                    >
                      {c.logo ? (
                        <img src={c.logo} alt="" loading="lazy" />
                      ) : (
                        <span>{(c.name || 'C').slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>

                    <div className="fs-meta">
                      <div className="fs-meta-title">
                        <b>{c.name}</b>
                        {isCurrent && <span className="fs-now-playing-tag">PLAYING</span>}
                      </div>
                      <div className="fs-meta-sub">
                        <span>{c.group || 'Live Stream'}</span>
                        <span className="fs-num-badge">CH {String(index + 1).padStart(3, '0')}</span>
                      </div>
                      {currentProg?.t && <span className="fs-epg-live">▶ {currentProg.t}</span>}
                    </div>

                    <button
                      className={'star' + (fav ? ' on' : '')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFav(c);
                      }}
                      title={fav ? 'Favorited' : 'Favorite'}
                    >
                      {fav ? '★' : '☆'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="fs-empty-msg">No channels found.</div>
          )}
        </div>

        {/* Drawer Footer Navigation Help */}
        <div className="fs-drawer-footer">
          <span>
            <kbd>▲</kbd> <kbd>▼</kbd> Navigate
          </span>
          <span>
            <kbd>Enter</kbd> Watch
          </span>
          <span>
            <kbd>Back</kbd> Close Guide
          </span>
        </div>
      </aside>
    </div>
  );
}
