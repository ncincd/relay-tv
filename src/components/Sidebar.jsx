import React from 'react';

export default function Sidebar({
  activeView,
  setActiveView,
  channelCount = 0,
  customCount = 0,
  favCount = 0,
  recentCount = 0,
  onOpenAddModal,
  onOpenFile,
  onOpenPaste,
  onLoadUsChannels,
}) {
  const navItems = [
    { id: 'all', label: 'All Channels', icon: '📺', count: channelCount },
    { id: 'custom', label: 'My Streams', icon: '⚡', count: customCount },
    { id: 'favorites', label: 'Favorites', icon: '★', count: favCount },
    { id: 'recent', label: 'Recent', icon: '🕒', count: recentCount },
  ];

  return (
    <nav className="tv-sidebar" aria-label="Main Navigation">
      <div className="sidebar-brand">
        <div className="brand-icon">▶</div>
        <div className="brand-text">
          <span>Relay</span> <small>TV</small>
        </div>
      </div>

      <div className="sidebar-action-box">
        <button className="add-channel-btn primary" onClick={onOpenAddModal}>
          <span className="plus-icon">+</span>
          <span>Add Channel</span>
        </button>
      </div>

      <div className="sidebar-section">
        <div className="section-label">Library</div>
        <ul className="nav-menu">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <li key={item.id}>
                <button
                  className={'nav-item' + (isActive ? ' active' : '')}
                  onClick={() => setActiveView(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  {item.count > 0 && <span className="nav-badge">{item.count}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="sidebar-section">
        <div className="section-label">Default Playlists</div>
        <button
          className="import-btn us-channels-btn"
          onClick={onLoadUsChannels}
          title="Reload US Channels Playlist"
        >
          <span>🇺🇸 US CHANNELS</span>
        </button>
      </div>

      <div className="sidebar-section">
        <div className="section-label">Import</div>
        <div className="quick-import-buttons">
          <label className="import-btn" title="Open .m3u from device">
            <span>📂 Open File</span>
            <input type="file" accept=".m3u,.m3u8,.txt" hidden onChange={onOpenFile} />
          </label>
          <button className="import-btn" onClick={onOpenPaste} title="Paste M3U raw text">
            <span>📝 Paste Text</span>
          </button>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="tv-status-badge">
          <span className="pulse-dot" />
          <span>Tizen Ready</span>
        </div>
      </div>
    </nav>
  );
}
