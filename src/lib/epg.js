import { getEpgApiUrl } from './config';

const cache = new Map();

const dec = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
   .replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'")
   .replace(/&amp;/g, '&')
   .trim();

const tag = (b, n) => {
  const m = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`));
  return m ? dec(m[1]) : '';
};

const attr = (a, n) => (a.match(new RegExp(`${n}="([^"]*)"`)) || [])[1] || '';

const ts = (s) => {
  const m = s.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\s*([+-])?(\d\d)?(\d\d)?/);
  if (!m) return 0;
  const off = m[7] ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) * 60000 : 0;
  return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off;
};

export async function fetchEpg(url, ids = []) {
  if (!url || !ids.length) return {};
  const cacheKey = url + '|' + ids.sort().join(',');
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < 30 * 60e3) return hit.d;

  // 1. Try server proxy endpoint first (avoids browser CORS & offloads parsing)
  try {
    const epgApi = getEpgApiUrl();
    const res = await fetch(epgApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, ids }),
    });
    if (res.ok) {
      const data = await res.json();
      cache.set(cacheKey, { t: Date.now(), d: data });
      return data;
    }
  } catch {}

  // 2. Direct client-side fetch & parse fallback
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/xml, text/xml, */*' } });
    if (!res.ok) throw new Error('EPG fetch failed: ' + res.status);

    let text = '';
    const isGzip = /\.gz(\?|$)/i.test(url) || /gzip/i.test(res.headers.get('content-type') || '');
    if (isGzip && typeof DecompressionStream !== 'undefined' && res.body) {
      const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
      const textStream = stream.pipeThrough(new TextDecoderStream());
      const reader = textStream.getReader();
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        if (chunk.value) text += chunk.value;
      }
    } else {
      text = await res.text();
    }

    const want = new Set(ids);
    const from = Date.now() - 3 * 3600e3; // 3 hours ago
    const to = Date.now() + 24 * 3600e3;  // next 24 hours
    const out = {};

    for (const m of text.matchAll(/<programme\s([^>]*)>([\s\S]*?)<\/programme>/g)) {
      const ch = attr(m[1], 'channel');
      if (!ch || (want.size && !want.has(ch))) continue;
      const s = ts(attr(m[1], 'start'));
      const e = ts(attr(m[1], 'stop'));
      if (e < from || s > to) continue;
      (out[ch] ??= []).push({
        s,
        e,
        t: tag(m[2], 'title'),
        d: tag(m[2], 'desc').slice(0, 240),
      });
    }

    for (const k in out) {
      out[k].sort((a, b) => a.s - b.s);
    }

    cache.set(cacheKey, { t: Date.now(), d: out });
    return out;
  } catch (err) {
    console.warn('Could not parse EPG:', err);
    return {};
  }
}
