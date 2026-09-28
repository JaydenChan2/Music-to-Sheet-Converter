import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';

// Standard guitar string names (high to low, top to bottom as displayed)
const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];
const FONT = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace";

// Render one measure as 6 text rows. Every 16th-note slot gets a column wide
// enough for its widest fret number plus one dash, so rhythm stays readable.
function renderMeasure(cells) {
    const rows = Array.from({ length: 6 }, () => '');
    cells.forEach((slot) => {
        const width = Math.max(1, ...slot.map((f) => (f === null ? 0 : String(f).length))) + 1;
        slot.forEach((fret, r) => {
            const val = fret === null ? '' : String(fret);
            rows[r] += val + '-'.repeat(width - val.length);
        });
    });
    return rows.map((row) => row + '|');
}

const TabViewer = ({ result, currentTime, isPlaying, onSeek }) => {
    const containerRef = useRef(null);
    const charRef = useRef(null);
    const activeRef = useRef(null);
    const [availableChars, setAvailableChars] = useState(100);

    const measures = useMemo(() => {
        if (!result) return [];
        const perMeasure = result.slots_per_measure;
        const cells = result.measures.map(() =>
            Array.from({ length: perMeasure }, () => new Array(6).fill(null)));
        result.tabs.forEach((col) => {
            const measure = cells[col.measure];
            if (!measure) return;
            Object.entries(col.notes).forEach(([strIdx, fret]) => {
                measure[col.position][parseInt(strIdx)] = fret;
            });
        });
        return result.measures.map((m, i) => ({ ...m, rows: renderMeasure(cells[i]) }));
    }, [result]);

    // Work out how many characters fit per line so measures wrap cleanly.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => {
            const charWidth = charRef.current?.getBoundingClientRect().width || 8.4;
            setAvailableChars(Math.floor(el.clientWidth / charWidth));
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, [result]);

    const lines = useMemo(() => {
        const out = [];
        let line = [];
        let width = 3; // "e |"
        measures.forEach((m) => {
            const w = m.rows[0].length;
            if (line.length && width + w > availableChars) {
                out.push(line);
                line = [];
                width = 3;
            }
            line.push(m);
            width += w;
        });
        if (line.length) out.push(line);
        return out;
    }, [measures, availableChars]);

    const activeIndex = measures.findIndex((m) => currentTime >= m.start && currentTime < m.end);

    useEffect(() => {
        if (isPlaying && activeRef.current) {
            activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [activeIndex, isPlaying]);

    if (!result) {
        return (
            <div className="text-center py-20 border border-dashed border-zinc-800 rounded-xl">
                <p className="text-zinc-600 text-sm">Waiting for audio data...</p>
            </div>
        );
    }

    return (
        <div className="w-full mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                    <span>~{Math.round(result.tempo)} BPM</span>
                    <span>{result.time_signature.join('/')}</span>
                    <span>Standard tuning</span>
                    <span>{result.note_count} notes</span>
                    <span>Source: {result.stem}</span>
                </div>
                <div className="flex gap-2">
                    <a href={result.files.text} download className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-600 hover:text-zinc-200 transition-colors">
                        <Download size={12} /> TXT
                    </a>
                    <a href={result.files.midi} download className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-600 hover:text-zinc-200 transition-colors">
                        <Download size={12} /> MIDI
                    </a>
                </div>
            </div>

            <div
                className="select-text bg-zinc-900/30 rounded-xl p-6 border border-zinc-800/50"
                style={{ fontFamily: FONT }}
            >
                <div ref={containerRef} className="relative w-full text-sm leading-6">
                    <span ref={charRef} className="absolute invisible">0</span>
                    {result.note_count === 0 && (
                        <p className="text-zinc-500 text-sm">No guitar notes were detected in this audio.</p>
                    )}
                    {result.note_count > 0 && lines.map((line, lineIdx) => (
                        <div key={lineIdx} className="flex mb-6 whitespace-pre text-zinc-300">
                            <div className="text-zinc-500">
                                {STRING_NAMES.map((n) => <div key={n}>{n.padStart(2)}|</div>)}
                            </div>
                            {line.map((m) => {
                                const active = m.index === activeIndex;
                                return (
                                    <div
                                        key={m.index}
                                        ref={active ? activeRef : null}
                                        onClick={() => onSeek?.(Math.max(0, m.start))}
                                        title={`Bar ${m.index + 1}`}
                                        className={`cursor-pointer rounded-sm transition-colors ${active ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}
                                    >
                                        {m.rows.map((row, r) => <div key={r}>{row}</div>)}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TabViewer;
