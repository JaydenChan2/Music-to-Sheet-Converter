// Generated visuals that stand in for the template's video media.
// Each one is drawn from the app's own domain: tab, audio, stems, notes, fretboard.
import React, { useMemo } from 'react';

const INK = '#2b2d33';
const MUTE = 'rgba(0,0,0,.18)';
const FAINT = 'rgba(0,0,0,.08)';
const ACC = '#e8590c';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Columns of a short fingerstyle progression (C - Am - F - G), top string first.
// '/7' marks a slide into fret 7.
const RIFF = [
  { 4: '3' }, { 3: '2' }, { 2: '0' }, { 1: '1' }, { 0: '0' }, { 1: '1' }, { 2: '0' }, { 3: '2' },
  { 4: '0' }, { 3: '2' }, { 2: '2' }, { 1: '1' }, { 0: '0' }, { 1: '1' }, { 2: '2' }, {},
  { 3: '3' }, { 2: '2' }, { 1: '1' }, { 0: '1' }, { 1: '1' }, { 2: '2' }, { 0: '/3' }, { 0: '5' },
  { 5: '3' }, { 4: '2' }, { 3: '0' }, { 2: '0' }, { 1: '0' }, { 0: '3' }, { 1: '/3' }, {},
  { 1: '5' }, { 0: '5' }, { 1: '8' }, { 0: '/7' }, { 0: '5' }, { 1: '5' }, { 2: '5' }, { 2: '7' },
];

/** Six-line tab staff with fret numbers scrolling under a fixed orange playhead. */
export function TabStaff({ riff = RIFF, dur = 48, col, fs, labels = ['e', 'B', 'G', 'D', 'A', 'E'], showLabels = true }) {
  const rows = labels.map((_, s) => riff.map((c) => c[s] || ''));
  return (
    <div className="vis vis-staff" style={{ '--dur': `${dur}s`, ...(col && { '--col': col }), ...(fs && { '--fs': fs }) }} aria-hidden="true">
      {rows.map((notes, s) => (
        <div className="vis-staff__row" key={s}>
          <div className="vis-staff__notes">
            {[...notes, ...notes].map((n, i) => (
              <span key={i} className={n.startsWith('/') ? 'is-slide' : ''}>{n && <b>{n}</b>}</span>
            ))}
          </div>
        </div>
      ))}
      {showLabels && (
        <div className="vis-staff__labels">{labels.map((l) => <span key={l}>{l}</span>)}</div>
      )}
      <div className="vis-staff__head" />
    </div>
  );
}

/** Audio waveform; bars past `split` turn orange (the part already "heard"). */
export function Waveform({ seed = 3, bars = 120, split = 0.42, animate = false }) {
  const heights = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: bars }, (_, i) => {
      const env = 0.35 + 0.65 * Math.abs(Math.sin(i / 9) * Math.cos(i / 23));
      return Math.max(0.06, env * (0.45 + r() * 0.55));
    });
  }, [seed, bars]);
  const w = 1000 / bars;
  return (
    <svg className="vis" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="1000" y1="300" y2="300" stroke={MUTE} vectorEffect="non-scaling-stroke" />
      {heights.map((h, i) => (
        <rect
          key={i}
          className={animate && i % 3 === 0 ? 'eq-bar' : undefined}
          style={animate ? { animationDelay: `${(i % 11) * -0.17}s` } : undefined}
          x={i * w + w * 0.2} width={w * 0.6} y={300 - h * 150} height={h * 300}
          fill={i / bars < split ? ACC : INK} opacity={i / bars < split ? 0.95 : 0.85}
        />
      ))}
    </svg>
  );
}

/** Four stems stacked; the guitar lane is lifted out in orange. */
export function Stems({ seed = 9 }) {
  const lanes = ['Vocals', 'Drums', 'Bass', 'Guitar'];
  const paths = useMemo(() => {
    const r = rng(seed);
    return lanes.map((_, li) => {
      let d = '';
      for (let x = 0; x <= 1000; x += 6) {
        const amp = (li === 1 ? (x % 120 < 18 ? 40 : 6) : 22 + 18 * Math.sin(x / (60 + li * 30))) * (0.5 + r() * 0.5);
        const y = Math.sin(x / (5 + li * 3)) * amp;
        d += `${x === 0 ? 'M' : 'L'}${x},${y.toFixed(1)} `;
      }
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);
  return (
    <svg className="vis" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {lanes.map((name, i) => {
        const y = 130 + i * 140;
        const isGuitar = name === 'Guitar';
        return (
          <g key={name} transform={`translate(0 ${y})`}>
            <line x1="0" x2="1000" y1="0" y2="0" stroke={FAINT} />
            <path d={paths[i]} fill="none" stroke={isGuitar ? ACC : INK} strokeWidth={isGuitar ? 2.4 : 1.2} opacity={isGuitar ? 1 : 0.28} />
            <text x="70" y="-48" fontFamily="Inter Tight, sans-serif" fontSize="15" letterSpacing="4" fill={isGuitar ? ACC : INK} opacity={isGuitar ? 1 : 0.45}>
              {name.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Piano roll of detected notes over a pitch grid. */
export function PianoRoll({ seed = 5, snapped = false }) {
  const notes = useMemo(() => {
    const r = rng(seed);
    const out = [];
    let t = 40;
    while (t < 980) {
      const chord = r() < 0.3;
      const base = 6 + Math.floor(r() * 14);
      const len = snapped ? 60 * (1 + Math.floor(r() * 3)) : 30 + r() * 120;
      const start = snapped ? Math.round(t / 60) * 60 : t;
      out.push({ x: start, y: base, w: len - 6 });
      if (chord) {
        out.push({ x: start, y: base + 4, w: len - 6 });
        out.push({ x: start, y: base + 7, w: len - 6 });
      }
      t += snapped ? 60 * (1 + Math.floor(r() * 2)) : 30 + r() * 70;
    }
    return out;
  }, [seed, snapped]);
  const rowH = 22;
  return (
    <svg className="vis" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {Array.from({ length: 32 }, (_, i) => (
        <rect key={i} x="0" y={i * rowH} width="1000" height={rowH} fill={[1, 3, 6, 8, 10].includes(i % 12) ? FAINT : 'transparent'} />
      ))}
      {snapped && Array.from({ length: 17 }, (_, i) => (
        <line key={i} x1={i * 60} x2={i * 60} y1="0" y2="700" stroke={i % 4 === 0 ? ACC : MUTE} strokeWidth={i % 4 === 0 ? 2 : 1} opacity={i % 4 === 0 ? 0.6 : 1} />
      ))}
      {notes.map((n, i) => (
        <rect key={i} x={n.x} y={700 - n.y * rowH - 140} width={Math.max(10, n.w)} height={rowH - 6} fill={i % 7 === 3 ? ACC : INK} opacity={i % 7 === 3 ? 1 : 0.82} />
      ))}
    </svg>
  );
}

/** A fretboard with a fingering path drawn across it. */
export function Fretboard({ dots = [[5, 3], [4, 2], [3, 0], [2, 2], [1, 3], [0, 5], [1, 5], [0, 7]], frets = 9, path = true, fit = 'xMidYMid slice' }) {
  const X0 = 90, X1 = 960, Y0 = 170, GAP = 72;
  const fretX = (f) => X0 + ((X1 - X0) / frets) * f;
  const noteX = (f) => (f === 0 ? X0 - 34 : (fretX(f - 1) + fretX(f)) / 2);
  const strY = (s) => Y0 + s * GAP;
  const pts = dots.map(([s, f]) => [noteX(f), strY(s)]);
  return (
    <svg className="vis" viewBox="0 0 1000 700" preserveAspectRatio={fit} aria-hidden="true">
      {Array.from({ length: frets + 1 }, (_, f) => (
        <line key={f} x1={fretX(f)} x2={fretX(f)} y1={Y0 - 20} y2={strY(5) + 20} stroke={f === 0 ? INK : MUTE} strokeWidth={f === 0 ? 6 : 2} />
      ))}
      {[3, 5, 7, 9].filter((f) => f <= frets).map((f) => (
        <circle key={f} cx={noteX(f)} cy={(strY(2) + strY(3)) / 2} r="9" fill={FAINT} />
      ))}
      {Array.from({ length: 6 }, (_, s) => (
        <line key={s} x1={X0 - 60} x2="1000" y1={strY(s)} y2={strY(s)} stroke={INK} strokeWidth={0.8 + s * 0.35} opacity=".55" />
      ))}
      {path && <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={ACC} strokeWidth="2" strokeDasharray="6 6" />}
      {dots.map(([s, f], i) => (
        <g key={i}>
          <circle cx={noteX(f)} cy={strY(s)} r="22" fill={i === dots.length - 1 ? ACC : INK} />
          <text x={noteX(f)} y={strY(s) + 6} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="17" fontWeight="500" fill="#fff">{f}</text>
        </g>
      ))}
    </svg>
  );
}

/** Tuning pegs: six open-string note names, one retuned (orange). */
export function Tuning({ notes = ['D', 'A', 'D', 'G', 'B', 'E'], changed = [0] }) {
  return (
    <svg className="vis" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {notes.map((n, i) => {
        const x = 140 + i * 144;
        const on = changed.includes(i);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1="80" y2="620" stroke={INK} strokeWidth={3.2 - i * 0.35} opacity=".55" />
            <circle cx={x} cy="330" r="52" fill={on ? ACC : '#fff'} stroke={on ? ACC : INK} strokeWidth="1.5" />
            <text x={x} y="346" textAnchor="middle" fontFamily="Inter Tight, sans-serif" fontSize="44" fontWeight="400" fill={on ? '#fff' : INK}>{n}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Export: a tab sheet beside a MIDI lane. */
export function ExportSheet() {
  const lines = ['e|-----0-----|---0-----3--|', 'B|---1---1---|-1---1---3--|', 'G|-0-------0-|---2---2-0--|', 'D|-----------|------------|', 'A|-3---------|-0----------|', 'E|-----------|----------3-|'];
  return (
    <svg className="vis" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="120" y="120" width="420" height="460" fill="#fff" stroke={MUTE} />
      <text x="150" y="168" fontFamily="Inter Tight, sans-serif" fontSize="14" letterSpacing="4" fill={ACC}>SONG.TXT</text>
      {lines.map((l, i) => (
        <text key={i} x="150" y={220 + i * 30} fontFamily="JetBrains Mono, monospace" fontSize="15.5" fill={INK}>{l}</text>
      ))}
      <rect x="580" y="180" width="300" height="400" fill={INK} />
      <text x="610" y="228" fontFamily="Inter Tight, sans-serif" fontSize="14" letterSpacing="4" fill={ACC}>SONG.MID</text>
      {[[0, 3, 60], [40, 7, 40], [80, 5, 60], [140, 9, 40], [180, 2, 80], [40, 11, 80], [140, 12, 60]].map(([x, y, w], i) => (
        <rect key={i} x={610 + x} y={260 + y * 22} width={w} height="14" fill={i % 3 === 0 ? ACC : '#e8e9ec'} />
      ))}
    </svg>
  );
}

/** Loop brace over a bar with a looping playhead. */
export function LoopBar() {
  return (
    <div className="vis" style={{ position: 'absolute', inset: 0 }}>
      <TabStaff dur={90} showLabels={false} />
      <svg className="vis" viewBox="0 0 1000 700" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
        <rect x="330" y="0" width="300" height="700" fill={ACC} opacity=".07" />
        <line x1="330" x2="330" y1="0" y2="700" stroke={ACC} strokeWidth="2" />
        <line x1="630" x2="630" y1="0" y2="700" stroke={ACC} strokeWidth="2" />
      </svg>
    </div>
  );
}
