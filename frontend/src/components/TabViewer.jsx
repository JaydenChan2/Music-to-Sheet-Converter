import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';

// Fallback string names (high to low, top to bottom as displayed)
const STANDARD_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
const SLIDE_MARKS = { up: '/', down: '\\' };

// Lay out one measure as 16th-note slot columns. Each slot is as wide as its
// widest fret number plus one dash, so rhythm stays readable.
function layoutMeasure(cells) {
    const slots = cells.map((slot) => {
        const width = Math.max(1, ...slot.map((c) => (c ? c.text.length : 0))) + 1;
        return { width, cells: slot.map((c) => ({ ...c, pad: '-'.repeat(width - (c ? c.text.length : 0)) })) };
    });
    return { slots, width: slots.reduce((w, s) => w + s.width, 0) + 1 };
}

const TabViewer = ({ result, currentTime, isPlaying, onSeek, onNoteClick, children }) => {
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

    if (!result) return null;

    return (
        <div>
            <div className="res__meta">
                <span className="chip">~{Math.round(result.tempo)} BPM</span>
                <span className="chip">{result.time_signature.join('/')}</span>
                <span className="chip">{result.tuning ? `${result.tuning.name} (${result.tuning.notes})` : 'Standard tuning'}</span>
                {result.tuning?.capo > 0 && <span className="chip chip--on">Capo {result.tuning.capo}</span>}
                <span className="chip">{result.note_count} notes</span>
                {result.slide_count > 0 && (
                    <span className="chip" title="/ = slide up, \ = slide down">
                        {result.slide_count} slide{result.slide_count === 1 ? '' : 's'} (/ up, \ down)
                    </span>
                )}
                <span className="chip">Source: {result.stem}</span>
                <div className="res__dl">
                    <a href={result.files.text} download className="tgl"><Download size={12} /> TXT</a>
                    <a href={result.files.midi} download className="tgl"><Download size={12} /> MIDI</a>
                </div>
            </div>

            {children}

            <div className="sheet select-text">
                <div ref={containerRef} className="sheet__inner">
                    <span ref={charRef} style={{ position: 'absolute', visibility: 'hidden' }}>0</span>
                    {result.note_count === 0 && (
                        <p className="sheet__empty">No guitar notes were detected in this audio.</p>
                    )}
                    {result.note_count > 0 && lines.map((line, lineIdx) => (
                        <div key={lineIdx} className="sheet__line">
                            <div className="sheet__labels">
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
                                        className={`sheet__bar${isActive ? ' is-on' : ''}`}
                                    >
                                        {m.slots.map((slot, si) => (
                                            <div key={si} className={isActive && si === activeSlot && isPlaying ? 'sheet__slot is-on' : 'sheet__slot'}>
                                                {slot.cells.map((cell, r) => (
                                                    <div key={r}>
                                                        {cell && cell.text ? (
                                                            <span
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onNoteClick?.(cell.string, cell.fret);
                                                                }}
                                                                title="Play this note"
                                                                className="sheet__note"
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
