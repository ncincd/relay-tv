// Helper to resolve API routes for development and TV package environments

export const DEFAULT_PROXY_HOST = 'http://10.168.135.95:3000';

export function getProxyHost() {
  if (typeof window === 'undefined') return DEFAULT_PROXY_HOST;
  return localStorage.getItem('relay.proxyHost') || DEFAULT_PROXY_HOST;
}

export function setProxyHost(host) {
  if (typeof window === 'undefined') return;
  if (!host) {
    localStorage.removeItem('relay.proxyHost');
  } else {
    localStorage.setItem('relay.proxyHost', host.replace(/\/+$/, ''));
  }
}

export function getApiBase() {
  if (typeof window === 'undefined') return '';

  // If running inside packaged Tizen file:// protocol, route API calls through configured host PC
  if (window.location.protocol === 'file:') {
    return getProxyHost().replace(/\/+$/, '');
  }

  // Running over http/https (e.g. http://localhost:3000 or hosted on LAN)
  return '';
}

export function getPlaylistApiUrl(targetUrl) {
  const base = getApiBase();
  return `${base}/api/playlist?url=${encodeURIComponent(targetUrl)}`;
}

export function getProxyStreamUrl(targetUrl) {
  const base = getApiBase();
  return `${base}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
}

export function getEpgApiUrl() {
  const base = getApiBase();
  return `${base}/api/epg`;
}

export async function checkProxyHealth() {
  const base = getApiBase();
  const testUrl = `${base}/api/epg`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(testUrl, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok || res.status === 200 || res.status === 405;
  } catch (e) {
    return false;
  }
}
