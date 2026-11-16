import React, { useState } from 'react';

const SAMPLES = [
  { name: 'US CHANNELS', url: 'https://iptv-org.github.io/iptv/countries/us.m3u', group: 'US Channels' },
  { name: 'IPTV News Playlist', url: 'https://iptv-org.github.io/iptv/categories/news.m3u', group: 'News' },
  { name: 'Big Buck Bunny (HLS)', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', group: 'Movies' },
];

export default function AddChannelModal({ isOpen, onClose, onAddChannel, onAddPlaylist }) {
  const [mode, setMode] = useState('single'); // 'single' or 'playlist'
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [group, setGroup] = useState('My Channels');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const cleanUrl = url.trim();
    const cleanName = name.trim() || 'Custom Channel';

    if (!cleanUrl) {
      setError('Please provide a stream or playlist URL.');
      return;
    }

    try {
      new URL(cleanUrl);
    } catch {
      setError('Please enter a valid URL (starting with http:// or https://).');
      return;
    }

    if (mode === 'single') {
      onAddChannel({
        name: cleanName,
        url: cleanUrl,
        group: group.trim() || 'My Channels',
        logo: '',
        tvgId: '',
        isCustom: true,
      });
    } else {
      onAddPlaylist(cleanUrl, cleanName);
    }

    setName('');
    setUrl('');
    setGroup('My Channels');
    onClose();
  };

  const handleApplySample = (s) => {
    setName(s.name);
    setUrl(s.url);
    setGroup(s.group);
    if (s.url.endsWith('.m3u')) {
      setMode('playlist');
    } else {
      setMode('single');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Stream or Channel</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="modal-tabs">
          <button
            type="button"
            className={'tab-btn' + (mode === 'single' ? ' active' : '')}
            onClick={() => setMode('single')}
          >
            📺 Single Channel (.m3u8)
          </button>
          <button
            type="button"
            className={'tab-btn' + (mode === 'playlist' ? ' active' : '')}
            onClick={() => setMode('playlist')}
          >
            📋 Full Playlist (.m3u)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Channel / Stream Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'single' ? 'e.g. Sports One, My Live Stream' : 'e.g. My Cable Playlist'}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Stream or Playlist URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/stream.m3u8"
            />
          </div>

          {mode === 'single' && (
            <div className="form-group">
              <label>Category / Folder</label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="e.g. Favorites, Sports, News"
              />
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="sample-chips">
            <small>Quick test presets:</small>
            <div className="chips-row">
              {SAMPLES.map((s, idx) => (
                <button
                  type="button"
                  key={idx}
                  className="preset-chip"
                  onClick={() => handleApplySample(s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Save Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
