import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { getProxyStreamUrl } from '../lib/config';
import { TV_KEYS } from '../lib/tizen-keys';

export default function Player({
  channel,
  index = 0,
  programs = [],
  useProxy,
  setUseProxy,
  onOpenDrawer,
  onPrev,
  onNext,
  favs = [],
  onFav,
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [osd, setOsd] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(false);

  // Show OSD banner for 4 seconds whenever channel changes
  useEffect(() => {
    setOsd(true);
    const t = setTimeout(() => setOsd(false), 4500);
    return () => clearTimeout(t);
  }, [channel?.id, channel?.url]);

  // Mouse activity shows floating controls briefly
  useEffect(() => {
    let timer;
    const onMove = () => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControlsVisible(false), 3500);
    };

    window.addEventListener('mousemove', onMove);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  // Video stream initialization
  useEffect(() => {
    if (!channel?.url) return;
    let dead = false;
    let retries = 0;
    let attemptedFallback = false;

    setErr('');
    setLoading(true);
    setLevels([]);
    setLevel(-1);

    const streamUrl = useProxy
      ? getProxyStreamUrl(channel.url)
      : channel.url;

    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    const fail = (message) => {
      if (dead) return;
      setLoading(false);
      setErr(message || 'Stream unavailable. The channel link may be offline.');
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false, // Prevents TV worker sandbox bugs
        lowLatencyMode: true,
        backBufferLength: 30,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 2,
        levelLoadingTimeOut: 12000,
        fragLoadingTimeOut: 12000,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        if (dead) return;
        setLoading(false);
        setLevels(data.levels.map((l) => l.height || Math.round(l.bitrate / 1000) + 'k'));
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (dead) return;
        if (!data.fatal) return;

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries++ < 2) {
          hls.recoverMediaError();
          return;
        }

        // Automatic proxy fallback to direct stream
        if (useProxy && !attemptedFallback) {
          attemptedFallback = true;
          console.warn('Proxy failed, falling back to direct stream:', channel.url);
          hls.loadSource(channel.url);
          return;
        }

        hls.destroy();
        fail(`Could not connect to ${channel.name} (${data.details || 'Network error'})`);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.onloadeddata = () => {
        if (!dead) setLoading(false);
      };
      video.onerror = () => {
        fail(`Could not open stream: ${channel.name}`);
      };
      video.play().catch(() => {});
    } else {
      fail('HLS playback is not supported on this TV engine.');
    }

    return () => {
      dead = true;
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }
    };
  }, [channel?.url, useProxy]);

  const cleanUrl = (channel?.url || '').trim().replace(/\/+$/, '');
  const isFav =
    Boolean(cleanUrl) &&
    Array.isArray(favs) &&
    favs.some((f) => {
      const u = (typeof f === 'string' ? f : f?.url || '').trim().replace(/\/+$/, '');
      return u === cleanUrl;
    });

  const currentProgram = programs.find(
    (p) => p.s <= Date.now() && Date.now() < p.e
  );

  return (
    <div className="tv-fullscreen-stage" onClick={onOpenDrawer}>
      {/* 100% Fullscreen Video Element */}
      <video
        ref={videoRef}
        className="tv-video-player"
        playsInline
        autoPlay
        onPlaying={() => setLoading(false)}
        onWaiting={() => setLoading(true)}
      />

      {/* TV Loading Spinner */}
      {loading && !err && (
        <div className="tv-loading-overlay">
          <div className="tv-spinner"></div>
          <div className="tv-loading-meta">
            <span>Loading Live Stream…</span>
            <b>{channel?.name || 'Channel'}</b>
          </div>
        </div>
      )}

      {/* TV Channel On-Screen Display (OSD Banner) */}
      <div className={'tv-osd-banner' + (osd ? ' visible' : '')}>
        <div className="osd-left">
          <div className="osd-ch-number">
            {String(index + 1).padStart(3, '0')}
          </div>
          <div className="osd-ch-details">
            <div className="osd-title-row">
              <span className="live-dot" />
              <b className="osd-title">{channel?.name}</b>
              {channel?.isCustom && <span className="osd-tag">CUSTOM</span>}
            </div>
            <div className="osd-meta-row">
              <span>{channel?.group || 'Live Stream'}</span>
              {currentProgram?.t && <span className="osd-epg">▶ {currentProgram.t}</span>}
            </div>
          </div>
        </div>

        <div className="osd-remote-hint">
          <span className="osd-hint-pill">▶ Press <b>RIGHT</b> or <b>OK</b> for Channel Guide</span>
        </div>
      </div>

      {/* Floating Controls (fades in on mouse move / hover) */}
      <div
        className={'tv-floating-bar' + (controlsVisible ? ' visible' : '')}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className={'floating-btn' + (isFav ? ' fav-active' : '')}
          onClick={() => onFav && onFav(channel)}
          title={isFav ? 'Remove favorite' : 'Add to favorites'}
        >
          {isFav ? '★ Favorited' : '☆ Favorite'}
        </button>

        <button className="floating-btn guide-btn primary" onClick={onOpenDrawer}>
          📺 Channel Guide (▶ Right)
        </button>

        {levels.length > 1 && (
          <select
            className="floating-select"
            value={level}
            aria-label="Quality"
            onChange={(e) => {
              const val = +e.target.value;
              setLevel(val);
              if (hlsRef.current) hlsRef.current.currentLevel = val;
            }}
          >
            <option value={-1}>Auto Quality</option>
            {levels.map((h, i) => (
              <option key={i} value={i}>
                {typeof h === 'number' ? h + 'p' : h}
              </option>
            ))}
          </select>
        )}

        {setUseProxy && (
          <label className="floating-proxy-badge">
            <input
              type="checkbox"
              checked={useProxy}
              onChange={(e) => setUseProxy(e.target.checked)}
            />
            <span>{useProxy ? '⚡ Proxy ON' : 'Direct Play'}</span>
          </label>
        )}
      </div>

      {/* Error Overlay */}
      {err && (
        <div className="tv-error-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="error-card">
            <div className="error-icon">⚠️</div>
            <h3>Stream Unavailable</h3>
            <p>{err}</p>
            <div className="error-actions">
              <button
                className="primary"
                onClick={() => {
                  setErr('');
                  setLoading(true);
                  if (videoRef.current) videoRef.current.load();
                }}
              >
                🔄 Retry Stream
              </button>
              <button onClick={onOpenDrawer}>
                📺 Choose Another Channel
              </button>
              {onNext && (
                <button onClick={onNext}>
                  Next Channel ▶
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
