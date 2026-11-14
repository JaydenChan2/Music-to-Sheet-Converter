import React from 'react';
import { Repeat, Timer, Volume2 } from 'lucide-react';
import { TONES } from '../synth';

const SPEEDS = [0.5, 0.75, 1, 1.25];

const Segmented = ({ options, value, onChange, label }) => (
    <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
            <button key={o.value} onClick={() => onChange(o.value)} className={value === o.value ? 'is-on' : ''} aria-pressed={value === o.value}>
                {o.label}
            </button>
        ))}
    </div>
);

const SynthPanel = ({ settings, onChange, loopBar, onToggleLoop, currentBar }) => {
    const isSynth = settings.mode === 'synth';
    return (
        <div className="tools">
            <Segmented
                label="Playback source"
                options={[{ value: 'original', label: 'Original' }, { value: 'synth', label: 'Synth' }]}
                value={settings.mode}
                onChange={(mode) => onChange('mode', mode)}
            />

            {isSynth && (
                <select className="select" value={settings.tone} onChange={(e) => onChange('tone', e.target.value)} title="Synth tone">
                    {Object.entries(TONES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
                </select>
            )}

            <Segmented
                label="Speed"
                options={SPEEDS.map((s) => ({ value: s, label: `${s * 100}%` }))}
                value={settings.speed}
                onChange={(speed) => onChange('speed', speed)}
            />

            <button
                className={`tgl${loopBar !== null ? ' is-on' : ''}`}
                onClick={onToggleLoop}
                title="Repeat the current bar"
                disabled={loopBar === null && currentBar < 0}
            >
                <Repeat size={12} /> {loopBar !== null ? `Looping bar ${loopBar + 1}` : 'Loop bar'}
            </button>

            {isSynth && (
                <button className={`tgl${settings.metronome ? ' is-on' : ''}`} onClick={() => onChange('metronome', !settings.metronome)} title="Click on every beat">
                    <Timer size={12} /> Metronome
                </button>
            )}

            <label className="vol" title="Volume">
                <Volume2 size={14} />
                <input type="range" min={0} max={1} step={0.01} value={settings.volume} onChange={(e) => onChange('volume', Number(e.target.value))} aria-label="Volume" />
            </label>

            {isSynth && <p className="tools__hint">Hearing the tab as written. Click any fret number to hear that note.</p>}
        </div>
    );
};

export default SynthPanel;
