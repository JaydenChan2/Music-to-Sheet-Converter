import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';

// Fallback string names (high to low, top to bottom as displayed)
const STANDARD_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
const SLIDE_MARKS = { up: '/', down: '\\' };

// Drawn-staff geometry (px).
const CH = 12;        // width of one character column; slots grow with their widest fret number
const GAP = 24;       // distance between strings
const TOP = 28;       // room above the top string for bar numbers
const BOTTOM = 18;
const PADX = 14;      // space after each bar line
const LABEL_W = 30;   // gutter for string names
const LINE_H = TOP + GAP * 5 + BOTTOM;

// Lay out one measure as 16th-note slot columns. Each slot is as wide as its
// widest fret number plus one column, so rhythm stays readable.
function layoutMeasure(cells) {
    let x = PADX;
    const slots = cells.map((slot) => {
        const w = (Math.max(1, ...slot.map((c) => (c ? c.text.length : 0))) + 1) * CH;
        const s = { x, w, center: x + w / 2, notes: slot.filter(Boolean) };
        x += w;
        return s;
    });
    return { slots, width: x + PADX / 2 };
}

// x position of time t inside measure m, gliding from one slot centre to the next.
function playheadX(m, t) {
    const n = m.slots.length;
    const pos = Math.max(0, Math.min(1, (t - m.start) / (m.end - m.start))) * n;
    const i = Math.min(n - 1, Math.floor(pos));
    const from = m.slots[i].center;
    const to = i + 1 < n ? m.slots[i + 1].center : m.width;
    return from + (pos - i) * (to - from);
}

const TabViewer = ({ result, currentTime, isPlaying, loopBar = null, check = null, removedNotes = null, onSeek, onNoteClick, children }) => {
    const containerRef = useRef(null);
    const activeRef = useRef(null);
    const [available, setAvailable] = useState(900);

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
                const slide = SLIDE_MARKS[col.slides?.[strIdx]];
                const string = parseInt(strIdx);
                measure[col.position][string] = {
                    text: (slide || '') + fret, fret, string, slide: !!slide,
                    confidence: col.confidence?.[strIdx],
                };
            });
        });
        // Notes the check step hid: shown as ghosts only where the slot is free.
        (removedNotes || []).forEach((r) => {
            const string = parseInt(r.string);
            const slot = cells[r.measure]?.[r.position];
            if (slot && !slot[string]) {
                slot[string] = { text: String(r.fret), fret: r.fret, string, removed: true, confidence: r.confidence };
            }
        });
        return result.measures.map((m, i) => ({ ...m, ...layoutMeasure(cells[i]) }));
    }, [result, removedNotes]);

    // Track the sheet's width so measures wrap cleanly onto lines.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => setAvailable(el.clientWidth - LABEL_W);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, [result]);

    const lines = useMemo(() => {
        const out = [];
        let line = [];
        let width = 0;
        measures.forEach((m) => {
            if (line.length && width + m.width > available) {
                out.push(line);
                line = [];
                width = 0;
            }
            line.push(m);
            width += m.width;
        });
        if (line.length) out.push(line);
        return out;
    }, [measures, available]);

    const activeIndex = measures.findIndex((m) => currentTime >= m.start && currentTime < m.end);
    const showPlayhead = activeIndex >= 0 && (isPlaying || currentTime > 0);

    useEffect(() => {
        if (isPlaying && activeRef.current) {
            activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [activeIndex, isPlaying]);

    const labels = result?.tuning?.labels || STANDARD_LABELS;
    const noteLimit = check?.thresholds?.note ?? 0;
    const flaggedBars = new Set(check?.flagged_bars || []);

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
                {result.retuned && (
                    <span
                        className="chip chip--on"
                        title={`The recording isn't at standard pitch (A = 440 Hz), so it was shifted onto it before the notes were detected. To play along with the original recording, tune your guitar to A = ${Math.round(440 * 2 ** (result.pitch_offset_cents / 1200))} Hz.`}
                    >
                        Recording {Math.abs(result.pitch_offset_cents)}¢ {result.pitch_offset_cents < 0 ? 'flat' : 'sharp'} · retuned
                    </span>
                )}
                <div className="res__dl">
                    <a href={result.files.text} download className="tgl"><Download size={12} /> TXT</a>
                    <a href={result.files.midi} download className="tgl"><Download size={12} /> MIDI</a>
                </div>
            </div>

            {children}

            <div className="sheet">
                <div ref={containerRef} className="sheet__inner">
                    {result.note_count === 0 && (
                        <p className="sheet__empty">No guitar notes were detected in this audio.</p>
                    )}
                    {result.note_count > 0 && lines.map((line, lineIdx) => (
                        <div key={lineIdx} className="staff" style={{ height: LINE_H, paddingLeft: LABEL_W }}>
                            {labels.map((name, r) => (
                                <React.Fragment key={r}>
                                    <i className="staff__string" style={{ top: TOP + r * GAP, left: LABEL_W, width: line.reduce((w, m) => w + m.width, 0) }} />
                                    <span className="staff__label" style={{ top: TOP + r * GAP }}>{name}</span>
                                </React.Fragment>
                            ))}
                            {line.map((m, mi) => {
                                const isActive = m.index === activeIndex;
                                const isLoop = m.index === loopBar;
                                const isFlagged = flaggedBars.has(m.index);
                                return (
                                    <div
                                        key={m.index}
                                        ref={isActive ? activeRef : null}
                                        onClick={() => onSeek?.(Math.max(0, m.start))}
                                        title={`Bar ${m.index + 1}`}
                                        className={`bar${mi === 0 ? ' bar--first' : ''}${isActive ? ' is-on' : ''}${isLoop ? ' is-loop' : ''}${isFlagged ? ' is-flagged' : ''}`}
                                        style={{ width: m.width, '--top': `${TOP}px`, '--span': `${GAP * 5}px` }}
                                    >
                                        <span className="bar__num">{m.index + 1}{isFlagged && <b title="Double-check this bar"> ?</b>}</span>
                                        {m.slots.map((s) => s.notes.map((note) => (
                                            <button
                                                key={`${s.x}-${note.string}`}
                                                className={`note${note.slide ? ' note--slide' : ''}${note.removed ? ' note--removed' : note.confidence != null && note.confidence < noteLimit ? ' note--unsure' : ''}`}
                                                style={{ left: s.center, top: TOP + note.string * GAP }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onNoteClick?.(note.string, note.fret);
                                                }}
                                                title={note.removed
                                                    ? `Hidden by the tab check (${Math.round(note.confidence * 100)}% confidence) · click to hear it`
                                                    : note.confidence != null
                                                    ? `Play this note · ${Math.round(note.confidence * 100)}% confidence${note.confidence < (check?.thresholds?.note ?? 0.6) ? ' — double-check' : ''}`
                                                    : 'Play this note'}
                                            >
                                                {note.text}
                                            </button>
                                        )))}
                                        {isActive && showPlayhead && (
                                            <i className="playhead" style={{ transform: `translateX(${playheadX(m, currentTime)}px)` }} />
                                        )}
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
