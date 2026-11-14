import React, { useRef, useState } from 'react';
import { AlertCircle, FileAudio, Upload } from 'lucide-react';
import { ArrowRight } from './site/primitives';

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'mp4', 'flac', 'ogg', 'aac', 'webm', 'aiff', 'aif', 'opus', 'mov'];
// '95', '4:10' or '1:04:10' -> seconds; '' -> null; anything else -> NaN
function parseClock(text) {
    const t = text.trim();
    if (!t) return null;
    if (!/^\d+(\.\d+)?(:\d{1,2}(\.\d+)?){0,2}$/.test(t)) return NaN;
    const parts = t.split(':').map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return NaN;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
}

const fmtClock = (sec) => {
    const s = Math.round(sec);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

const CUSTOM_TUNING_PATTERN = /^\s*([A-Ga-g][#b♯♭]?\d?[\s,]+){5}[A-Ga-g][#b♯♭]?\d?\s*$/;

const Tick = () => (
    <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
        <path d="M1 5l3.5 3.5L11 1" fill="none" stroke="#fff" strokeWidth="1.6" />
    </svg>
);

const VIDEO_TYPES = [
    { id: 'song', title: 'Song', text: 'A recording or performance. Transcribes what it hears.' },
    { id: 'tutorial', title: 'Tutorial', text: 'A lesson with talking. Uses the capo, tuning and chords the teacher mentions.' },
    { id: 'tab', title: 'Tabs on screen', text: 'A video that shows the tab. Takes strings and frets from the picture.' },
];

const VideoTypePicker = ({ value, onChange, speechAvailable }) => (
    <div className="vtype">
        <p className="setup__label"><b>01</b> What kind of video?</p>
        <div className="vtype__grid" role="radiogroup" aria-label="Video type">
            {VIDEO_TYPES.map((t) => (
                <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={value === t.id}
                    disabled={t.soon}
                    className={`vtype__card${value === t.id ? ' is-on' : ''}`}
                    onClick={() => onChange(t.id)}
                >
                    <span className="vtype__title">{t.title}{t.soon && <em>Soon</em>}</span>
                    <span className="vtype__text">{t.text}</span>
                </button>
            ))}
        </div>
        {value === 'tab' && (
            <p className="setup__hint">
                Works with play-along and lesson videos that show a six-line tab staff. Strings and frets are read from the
                picture, timing from the audio. Paste a link, or upload a video file (not just audio).
            </p>
        )}
        {value === 'tutorial' && (
            <p className="setup__hint">
                {speechAvailable
                    ? "YouTube captions are used when the video has them; otherwise speech is recognised on this computer. What the teacher says fills in Tuning and Capo if you leave them at Standard / No capo."
                    : 'Speech recognition isn\'t installed on the backend (pip install faster-whisper), so only links that have captions can be listened to.'}
            </p>
        )}
    </div>
);

const GuitarSettings = ({ options, onOptionChange, tunings, maxCapo, separationAvailable }) => (
    <div className="setup__col">
        <p className="setup__label"><b>02</b> Your guitar</p>
        <p className="setup__hint">How is the guitar in the recording set up?</p>
        <div className="fields fields--2">
            <label className="field">
                <span className="field__label">Tuning</span>
                <select className="select" value={options.tuning} onChange={(e) => onOptionChange('tuning', e.target.value)}>
                    {tunings.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.notes})</option>
                    ))}
                    <option value="custom">Custom...</option>
                </select>
            </label>
            <label className="field">
                <span className="field__label">Capo</span>
                <select className="select" value={options.capo} onChange={(e) => onOptionChange('capo', Number(e.target.value))}>
                    <option value={0}>No capo</option>
                    {Array.from({ length: maxCapo }, (_, i) => i + 1).map((fret) => (
                        <option key={fret} value={fret}>Capo on fret {fret}</option>
                    ))}
                </select>
            </label>
        </div>
        {options.tuning === 'custom' && (
            <label className="field">
                <span className="field__label">Custom tuning, lowest string first</span>
                <input
                    type="text"
                    className="input"
                    value={options.customTuning}
                    onChange={(e) => onOptionChange('customTuning', e.target.value)}
                    placeholder="e.g. D A D G B E  or  C G C F A D"
                />
            </label>
        )}
        {options.capo > 0 && (
            <p className="setup__hint">Frets will be written relative to the capo (0 = capo'd string), as in most tabs.</p>
        )}
        <label className="check" aria-disabled={!separationAvailable}>
            <input
                type="checkbox"
                checked={options.separate && separationAvailable}
                disabled={!separationAvailable}
                onChange={(e) => onOptionChange('separate', e.target.checked)}
            />
            <span className="check__box"><Tick /></span>
            <span>
                <strong>Isolate guitar first</strong>
                <span>
                    {separationAvailable
                        ? 'Removes vocals, drums and bass before transcribing. Recommended for full songs; takes longer.'
                        : 'Unavailable: install demucs on the backend to enable.'}
                </span>
            </span>
        </label>
    </div>
);

const UploadSection = ({ onFileSelected, onUrlSubmitted, options, onOptionChange, tunings, maxCapo, maxDuration = 720, separationAvailable, speechAvailable, error }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [localError, setLocalError] = useState(null);
    const [url, setUrl] = useState('');
    const [range, setRange] = useState({ start: '', end: '' });

    // Optional part of the recording to transcribe. Returns [error, {start, end}].
    const checkRange = () => {
        const start = parseClock(range.start);
        const end = parseClock(range.end);
        if (Number.isNaN(start)) return ['Start time should look like 4:10.'];
        if (Number.isNaN(end)) return ['End time should look like 6:30.'];
        if (end !== null && end <= (start || 0)) return ['The end time has to be after the start time.'];
        if (end !== null && end - (start || 0) > maxDuration) {
            return [`That part is ${fmtClock(end - (start || 0))} long; pick at most ${Math.round(maxDuration / 60)} minutes.`];
        }
        return [null, { start: range.start.trim(), end: range.end.trim() }];
    };
    const fileInputRef = useRef(null);
    const shownError = localError || error;

    const validateFile = (file) => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!file.type.startsWith('audio/') && !file.type.startsWith('video/') && !AUDIO_EXTENSIONS.includes(ext)) {
            return 'Please upload a valid audio file.';
        }
        if (file.size > 200 * 1024 * 1024) {
            return 'File size exceeds 200MB limit.';
        }
        return null;
    };

    const validateOptions = () => {
        if (options.tuning === 'custom' && !CUSTOM_TUNING_PATTERN.test(options.customTuning)) {
            return 'Enter 6 notes for the custom tuning, lowest string first (e.g. D A D G B E).';
        }
        return null;
    };

    const acceptFile = (file) => {
        setLocalError(null);
        const [rangeError, picked] = checkRange();
        const validationError = validateOptions() || rangeError || validateFile(file);
        if (validationError) setLocalError(validationError);
        else onFileSelected(file, picked);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) acceptFile(e.dataTransfer.files[0]);
    };

    const handleFileChange = (e) => {
        if (e.target.files?.length) acceptFile(e.target.files[0]);
        e.target.value = '';
    };

    const handleUrlSubmit = (e) => {
        e.preventDefault();
        setLocalError(null);
        const trimmed = url.trim();
        if (!/^https?:\/\/\S+$/i.test(trimmed)) {
            setLocalError('Please enter a valid http(s) link.');
            return;
        }
        const [rangeError, picked] = checkRange();
        const optionsError = validateOptions() || rangeError;
        if (optionsError) {
            setLocalError(optionsError);
            return;
        }
        onUrlSubmitted(trimmed, picked);
    };

    return (
        <div>
            <VideoTypePicker value={options.videoType} onChange={(v) => onOptionChange('videoType', v)} speechAvailable={speechAvailable} />
        <div className="setup">
            <GuitarSettings
                options={options}
                onOptionChange={onOptionChange}
                tunings={tunings}
                maxCapo={maxCapo}
                separationAvailable={separationAvailable}
            />

            <div className="setup__col">
                <p className="setup__label"><b>03</b> Add a song</p>
                <div className="range">
                    <div className="fields fields--2">
                        <label className="field">
                            <span className="field__label">Start (optional)</span>
                            <input className="input" inputMode="numeric" placeholder="0:00" value={range.start}
                                onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
                        </label>
                        <label className="field">
                            <span className="field__label">End (optional)</span>
                            <input className="input" inputMode="numeric" placeholder="end" value={range.end}
                                onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
                        </label>
                    </div>
                    <p className="setup__hint">
                        Only want part of it? Up to {Math.round(maxDuration / 60)} minutes are transcribed at a time —
                        handy for long lessons, or just the solo.
                    </p>
                </div>
                <div
                    className={`drop${isDragging ? ' is-over' : ''}`}
                    role="button"
                    tabIndex={0}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current.click()}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fileInputRef.current.click())}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        hidden
                        accept={`audio/*,video/*,${AUDIO_EXTENSIONS.map((ext) => '.' + ext).join(',')}`}
                        onChange={handleFileChange}
                    />
                    <div>
                        <div className="drop__icon">
                            {isDragging ? <FileAudio size={24} strokeWidth={1.4} /> : <Upload size={22} strokeWidth={1.4} />}
                        </div>
                        <h3 className="h3">{isDragging ? 'Drop it' : 'Upload audio'}</h3>
                        <p>Drag & drop or click to browse.<br />MP3, WAV, M4A, FLAC, OGG, MP4 and more · up to 200 MB</p>
                    </div>
                </div>

                <div className="or">or paste a link</div>

                <form onSubmit={handleUrlSubmit} className="linkform">
                    <label className="field">
                        <span className="field__label">Song link</span>
                        <input
                            type="url"
                            className="input"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="YouTube, SoundCloud, Bandcamp or a direct audio URL"
                        />
                    </label>
                    <button type="submit" className="btn btn--solid btn--sm" disabled={!url.trim()}>
                        Transcribe <ArrowRight />
                    </button>
                </form>

                {shownError && (
                    <div className="alert" role="alert">
                        <AlertCircle size={16} />
                        <span>{shownError}</span>
                    </div>
                )}
            </div>
        </div>
        </div>
    );
};

export default UploadSection;
