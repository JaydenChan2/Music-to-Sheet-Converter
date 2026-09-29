import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';

// Fallback string names (high to low, top to bottom as displayed)
const STANDARD_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
const SLIDE_MARKS = { up: '/', down: '\\' };
const FONT = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace";

// Lay out one measure as 16th-note slot columns. Each slot is as wide as its
// widest fret number plus one dash, so rhythm stays readable.
function layoutMeasure(cells) {
    const slots = cells.map((slot) => {
        const width = Math.max(1, ...slot.map((c) => (c ? c.text.length : 0))) + 1;
        return { width, cells: slot.map((c) => ({ ...c, pad: '-'.repeat(width - (c ? c.text.length : 0)) })) };
    });
    return { slots, width: slots.reduce((w, s) => w + s.width, 0) + 1 };
}

const TabViewer = ({ result, currentTime, isPlaying, onSeek, onNoteClick }) => {
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
                // "/5" = slid up into fret 5, "\3" = slid down into fret 3
                const text = (SLIDE_MARKS[col.slides?.[strIdx]] || '') + fret;
                measure[col.position][parseInt(strIdx)] = { text, fret, string: parseInt(strIdx) };
            });
        });
        return result.measures.map((m, i) => ({ ...m, ...layoutMeasure(cells[i]) }));
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
        const labelChars = 2 + Math.max(...(result?.tuning?.labels || STANDARD_LABELS).map((l) => l.length));
        let width = labelChars;
        measures.forEach((m) => {
            const w = m.width;
            if (line.length && width + w > availableChars) {
                out.push(line);
                line = [];
                width = labelChars;
            }
            line.push(m);
            width += w;
        });
        if (line.length) out.push(line);
        return out;
    }, [measures, availableChars, result]);

    const activeIndex = measures.findIndex((m) => currentTime >= m.start && currentTime < m.end);
    const active = measures[activeIndex];
    const activeSlot = active
        ? Math.floor(((currentTime - active.start) / (active.end - active.start)) * active.slots.length)
        : -1;

    useEffect(() => {
        if (isPlaying && activeRef.current) {
            activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [activeIndex, isPlaying]);

    const labels = result?.tuning?.labels || STANDARD_LABELS;
    const labelWidth = Math.max(...labels.map((l) => l.length));

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
                    <span>{result.tuning ? `${result.tuning.name} (${result.tuning.notes})` : 'Standard tuning'}</span>
                    {result.tuning?.capo > 0 && <span className="text-zinc-300">Capo {result.tuning.capo}</span>}
                    <span>{result.note_count} notes</span>
                    {result.slide_count > 0 && (
                        <span title="/ = slide up, \ = slide down">
                            {result.slide_count} slide{result.slide_count === 1 ? '' : 's'} (<span className="font-mono">/</span> up, <span className="font-mono">\</span> down)
                        </span>
                    )}
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
                                {labels.map((n, i) => <div key={i}>{n.padStart(labelWidth)}|</div>)}
                            </div>
                            {line.map((m) => {
                                const isActive = m.index === activeIndex;
                                return (
                                    <div
                                        key={m.index}
                                        ref={isActive ? activeRef : null}
                                        onClick={() => onSeek?.(Math.max(0, m.start))}
                                        title={`Bar ${m.index + 1}`}
                                        className={`flex cursor-pointer rounded-sm transition-colors ${isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}
                                    >
                                        {m.slots.map((slot, si) => (
                                            <div key={si} className={isActive && si === activeSlot && isPlaying ? 'bg-white/20 rounded-sm' : ''}>
                                                {slot.cells.map((cell, r) => (
                                                    <div key={r}>
                                                        {cell && cell.text ? (
                                                            <span
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onNoteClick?.(cell.string, cell.fret);
                                                                }}
                                                                title="Play this note"
                                                                className="hover:text-emerald-300 hover:bg-emerald-400/10 rounded-sm"
                                                            >
                                                                {cell.text}
                                                            </span>
                                                        ) : null}
                                                        {cell.pad}
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                        <div>{Array.from({ length: 6 }, (_, r) => <div key={r}>|</div>)}</div>
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
