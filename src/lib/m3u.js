// Parse an M3U/M3U8 channel playlist into [{id,name,logo,group,url,tvgId}]
export function parseM3U(text) {
  const out = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith('#EXTINF')) {
      const a = {};
      for (const m of l.matchAll(/([\w-]+)="([^"]*)"/g)) a[m[1].toLowerCase()] = m[2];
      cur = {
        name: l.slice(l.lastIndexOf(',') + 1).trim() || a['tvg-name'] || 'Untitled',
        logo: a['tvg-logo'] || '',
        tvgId: a['tvg-id'] || '',
        group: a['group-title'] || '',
      };
    } else if (l.startsWith('#EXTGRP:') && cur) {
      cur.group = cur.group || l.slice(8).trim();
    } else if (!l.startsWith('#')) {
      out.push({
        id: out.length,
        name: cur?.name || l.split('/').pop(),
        logo: cur?.logo || '',
        tvgId: cur?.tvgId || '',
        group: cur?.group || 'Ungrouped',
        url: l,
      });
      cur = null;
    }
  }
  return out;
}

// A single HLS stream manifest (not a channel list)
export const isStream = (t) => /#EXT-X-(STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE)/.test(t);

// Guide (XMLTV) link declared in the playlist header, if any
export const getEpgUrl = (t) =>
  (t.trimStart().match(/^#EXTM3U[^\r\n]*?(?:url-tvg|x-tvg-url)="([^"]+)"/i) || [])[1]?.split(',')[0] || '';
