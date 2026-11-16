import { Readable } from 'node:stream';

const cache = new Map();

export function proxyMiddleware() {
  return async (req, res, next) => {
    // Parse URL path
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const pathname = reqUrl.pathname;

    // Enable CORS for all incoming requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    // 1. /api/playlist - Fetch M3U playlist text without CORS limits
    if (pathname === '/api/playlist') {
      const target = reqUrl.searchParams.get('url') || '';
      try {
        const u = new URL(target);
        if (!/^https?:$/.test(u.protocol)) throw new Error('Unsupported protocol');

        const r = await fetch(u, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          redirect: 'follow',
        });
        if (!r.ok) throw new Error(`Server returned ${r.status}`);

        const text = await r.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(text);
      } catch (err) {
        res.statusCode = 400;
        res.end(`Could not load playlist: ${err.message}`);
      }
      return;
    }

    // 2. /api/proxy - Manifest rewriter and chunk relay
    if (pathname === '/api/proxy') {
      const target = reqUrl.searchParams.get('url') || '';
      let u;
      try {
        u = new URL(target);
      } catch {
        res.statusCode = 400;
        res.end('Bad URL');
        return;
      }

      if (!/^https?:$/.test(u.protocol)) {
        res.statusCode = 400;
        res.end('Unsupported protocol');
        return;
      }

      try {
        const r = await fetch(u, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          redirect: 'follow',
        });

        if (!r.ok && r.status >= 400) {
          res.statusCode = r.status;
          res.end(`Upstream returned ${r.status}`);
          return;
        }

        const type = r.headers.get('content-type') || '';
        const isM3U8 =
          /mpegurl/i.test(type) ||
          /\.m3u8?(\?|$)/i.test(u.pathname + u.search);

        if (isM3U8) {
          const text = await r.text();
          const wrap = (x) => {
            const absolute = new URL(x, r.url).href;
            return '/api/proxy?url=' + encodeURIComponent(absolute);
          };

          const body = text
            .split(/\r?\n/)
            .map((line) => {
              const l = line.trim();
              if (!l) return line;
              if (l.startsWith('#')) {
                // Rewrite URI="..." attributes in keys or subtitle tracks
                return line.replace(/URI="([^"]+)"/g, (_, x) => `URI="${wrap(x)}"`);
              }
              // Rewrite stream chunks and child manifest URLs
              return wrap(l);
            })
            .join('\n');

          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        } else {
          // Stream media chunks (.ts, .m4s, .mp4, keys)
          res.statusCode = r.status;
          res.setHeader('Content-Type', type || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          if (r.body) {
            Readable.fromWeb(r.body).pipe(res);
          } else {
            res.end();
          }
        }
      } catch (err) {
        res.statusCode = 502;
        res.end(`Proxy fetch failed: ${err.message}`);
      }
      return;
    }

    // 3. /api/epg - Guide parser
    if (pathname === '/api/epg' && req.method === 'POST') {
      let bodyData = '';
      req.on('data', (chunk) => {
        bodyData += chunk;
      });

      req.on('end', async () => {
        try {
          const { url, ids = [] } = JSON.parse(bodyData || '{}');
          if (!url) throw new Error('Missing URL');

          const key = url + '|' + ids.length;
          const hit = cache.get(key);
          if (hit && Date.now() - hit.t < 30 * 60e3) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(hit.d));
            return;
          }

          const u = new URL(url);
          const r = await fetch(u, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            redirect: 'follow',
          });
          if (!r.ok || !r.body) throw new Error('fetch failed');

          let stream = r.body;
          if (/\.gz(\?|$)/i.test(u.pathname) || /gzip/i.test(r.headers.get('content-type') || '')) {
            stream = stream.pipeThrough(new DecompressionStream('gzip'));
          }

          const dec = (s) =>
            s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
             .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
             .replace(/&amp;/g, '&').trim();

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

          const want = new Set(ids);
          const from = Date.now() - 3 * 3600e3;
          const to = Date.now() + 24 * 3600e3;
          const out = {};

          let buf = '';
          for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
            buf += chunk;
            let end = 0;
            for (const m of buf.matchAll(/<programme\s([^>]*)>([\s\S]*?)<\/programme>/g)) {
              end = m.index + m[0].length;
              const ch = attr(m[1], 'channel');
              if (!ch || (want.size && !want.has(ch))) continue;
              const s = ts(attr(m[1], 'start')), e = ts(attr(m[1], 'stop'));
              if (e < from || s > to) continue;
              (out[ch] ??= []).push({
                s,
                e,
                t: tag(m[2], 'title'),
                d: tag(m[2], 'desc').slice(0, 240),
              });
            }
            buf = buf.slice(end);
          }

          for (const k in out) out[k].sort((a, b) => a.s - b.s);
          cache.set(key, { t: Date.now(), d: out });

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(out));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    next();
  };
}
