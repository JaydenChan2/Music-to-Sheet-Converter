import React from 'react';
import { Repeat, Timer, Volume2 } from 'lucide-react';
import { TONES } from '../synth';

const SPEEDS = [0.5, 0.75, 1, 1.25];

const Segmented = ({ options, value, onChange }) => (
    <div className="flex items-center bg-zinc-900/40 rounded-lg p-1 border border-zinc-800/50">
        {options.map((o) => (
            <button
                key={o.value}
                onClick={() => onChange(o.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${value === o.value ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
                {o.label}
            </button>
        ))}
    </div>
);

const Toggle = ({ active, onClick, children, title, disabled }) => (
    <button
        onClick={onClick}
        title={title}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs transition-colors disabled:opacity-30 ${active ? 'border-zinc-400 bg-zinc-800 text-white' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'}`}
    >
        {children}
    </button>
);

const SynthPanel = ({ settings, onChange, loopBar, onToggleLoop, currentBar }) => {
    const isSynth = settings.mode === 'synth';
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800/50 bg-zinc-900/20 px-4 py-3">
            <Segmented
                options={[{ value: 'original', label: 'Original' }, { value: 'synth', label: 'Synth' }]}
                value={settings.mode}
                onChange={(mode) => onChange('mode', mode)}
            />

            {isSynth && (
                <select
                    value={settings.tone}
                    onChange={(e) => onChange('tone', e.target.value)}
                    className="rounded-md bg-zinc-900/60 border border-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500"
                    title="Synth tone"
                >
                    {Object.entries(TONES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
                </select>
            )}

            <Segmented
                options={SPEEDS.map((s) => ({ value: s, label: `${s * 100}%` }))}
                value={settings.speed}
                onChange={(speed) => onChange('speed', speed)}
            />

            <Toggle
                active={loopBar !== null}
                onClick={onToggleLoop}
                title="Repeat the current bar"
                disabled={loopBar === null && currentBar < 0}
            >
                <Repeat size={12} /> {loopBar !== null ? `Looping bar ${loopBar + 1}` : 'Loop bar'}
            </Toggle>

            {isSynth && (
                <Toggle active={settings.metronome} onClick={() => onChange('metronome', !settings.metronome)} title="Click on every beat">
                    <Timer size={12} /> Metronome
                </Toggle>
            )}

            <label className="flex items-center gap-2 text-zinc-500 ml-auto" title="Volume">
                <Volume2 size={14} />
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.volume}
                    onChange={(e) => onChange('volume', Number(e.target.value))}
                    className="w-24 accent-white"
                />
            </label>

            {isSynth && (
                <p className="basis-full text-[11px] text-zinc-600">
                    Hearing the tab as written. Click any fret number to hear that note.
                </p>
            )}
        </div>
    );
};

export default SynthPanel;
