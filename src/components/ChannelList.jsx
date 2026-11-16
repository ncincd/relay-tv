import React, { useEffect, useRef, useState } from 'react';

const ROW = 80;

export default function ChannelList({
  items,
  activeId,
  onPick,
  favs,
  onFav,
  onDeleteChannel,
  epg = {},
  onFocusSearch,
  firstRowRef,
}) {
  const boxRef = useRef(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);

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
  }, []);

  // Auto-scroll when active channel changes
  useEffect(() => {
    const i = items.findIndex((c) => c.id === activeId);
    const el = boxRef.current;
    if (i < 0 || !el) return;
    const y = i * ROW;
    if (y < el.scrollTop || y + ROW > el.scrollTop + el.clientHeight) {
      el.scrollTop = y - el.clientHeight / 2 + ROW / 2;
    }
  }, [activeId, items]);

  const start = Math.max(0, Math.floor(top / ROW) - 4);
  const end = Math.min(items.length, start + Math.ceil(height / ROW) + 8);

  return (
    <div
      className="list"
      ref={boxRef}
      onScroll={(ev) => setTop(ev.currentTarget.scrollTop)}
      tabIndex={0}
      aria-label="Channel Lineup"
    >
      <div style={{ height: items.length * ROW, position: 'relative' }}>
        {items.slice(start, end).map((c, k) => {
          const index = start + k;
          const cUrlClean = (c.url || '').trim().replace(/\/+$/, '');
          const fav =
            Array.isArray(favs) &&
            favs.some((f) => {
              const u = (typeof f === 'string' ? f : f?.url || '').trim().replace(/\/+$/, '');
              return u === cUrlClean;
            });
          const currentProg = (epg[c.tvgId] || []).find(
            (x) => x.s <= Date.now() && Date.now() < x.e
          );
          const isActive = c.id === activeId;
          const isFirst = index === 0;

          return (
            <div
              key={c.id ?? index}
              ref={isFirst ? firstRowRef : null}
              className={'row' + (isActive ? ' on' : '')}
              style={{ top: index * ROW }}
              onClick={() => onPick(c.id)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                  onPick(c.id);
                } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
                  if (index === 0 && onFocusSearch) {
                    e.preventDefault();
                    onFocusSearch();
                  }
                }
              }}
            >
              {/* Channel Logo */}
              <Logo c={c} />

              {/* Channel Name & Details (Channel number is under the category/group) */}
              <div className="meta">
                <div className="meta-title-row">
                  <b className="ch-title" title={c.name}>{c.name}</b>
                  {c.isCustom && <span className="custom-tag">Custom</span>}
                </div>

                <div className="meta-sub-row">
                  <span className="ch-group-label">{c.group || 'Live Stream'}</span>
                  <span className="ch-num-badge">CH {String(index + 1).padStart(3, '0')}</span>
                </div>

                {currentProg?.t && (
                  <span className="ch-epg-hint">▶ {currentProg.t}</span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="row-actions">
                <button
                  className={'star' + (fav ? ' on' : '')}
                  aria-label={fav ? 'Remove favorite' : 'Add favorite'}
                  tabIndex={-1}
                  title={fav ? 'Favorited' : 'Favorite'}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onFav(c);
                  }}
                >
                  {fav ? '★' : '☆'}
                </button>

                {c.isCustom && onDeleteChannel && (
                  <button
                    className="delete-btn"
                    aria-label="Delete stream"
                    tabIndex={-1}
                    title="Delete custom stream"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (confirm(`Remove "${c.name}" from your channels?`)) {
                        onDeleteChannel(c.id);
                      }
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Logo({ c }) {
  const [bad, setBad] = useState(false);

  // Generate pleasant background hue based on channel name
  const getAvatarBg = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 25%)`;
  };

  return (
    <div
      className="logo"
      style={{
        background: !c.logo || bad ? getAvatarBg(c.name || 'C') : undefined,
      }}
    >
      {c.logo && !bad ? (
        <img
          src={c.logo}
          alt=""
          loading="lazy"
          onError={() => setBad(true)}
        />
      ) : (
        <span className="logo-initials">{(c.name || 'C').slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}
