import React, { useEffect, useState } from 'react';

export default function Guide({ programs = [] }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const cur = programs.find((p) => p.s <= now && now < p.e);
  const next = programs.filter((p) => p.s > now).slice(0, 6);

  if (!cur && !next.length) return null;

  const hm = (t) =>
    new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="guide">
      {cur && (
        <div className="cur">
          <div>
            <b>{cur.t}</b>
            <span>
              {hm(cur.s)} – {hm(cur.e)}
            </span>
          </div>
          <div className="prog">
            <i
              style={{
                width:
                  Math.min(
                    100,
                    Math.max(0, ((now - cur.s) / (cur.e - cur.s)) * 100)
                  ) + '%',
              }}
            />
          </div>
          {cur.d && <p>{cur.d}</p>}
        </div>
      )}

      {next.length > 0 && (
        <ul>
          {next.map((p, i) => (
            <li key={i}>
              <time>{hm(p.s)}</time>
              <span>{p.t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
