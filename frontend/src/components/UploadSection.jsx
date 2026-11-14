import React, { useRef, useState } from 'react';
import { AlertCircle, FileAudio, Upload } from 'lucide-react';
import { ArrowRight } from './site/primitives';

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'mp4', 'flac', 'ogg', 'aac', 'webm', 'aiff', 'aif', 'opus', 'mov'];
const CUSTOM_TUNING_PATTERN = /^\s*([A-Ga-g][#b♯♭]?\d?[\s,]+){5}[A-Ga-g][#b♯♭]?\d?\s*$/;

const Tick = () => (
    <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
        <path d="M1 5l3.5 3.5L11 1" fill="none" stroke="#fff" strokeWidth="1.6" />
    </svg>
);

const GuitarSettings = ({ options, onOptionChange, tunings, maxCapo, separationAvailable }) => (
    <div className="setup__col">
        <p className="setup__label"><b>01</b> Your guitar</p>
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

const UploadSection = ({ onFileSelected, onUrlSubmitted, options, onOptionChange, tunings, maxCapo, separationAvailable, error }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [localError, setLocalError] = useState(null);
    const [url, setUrl] = useState('');
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
        const validationError = validateOptions() || validateFile(file);
        if (validationError) setLocalError(validationError);
        else onFileSelected(file);
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
        const optionsError = validateOptions();
        if (optionsError) {
            setLocalError(optionsError);
            return;
        }
        onUrlSubmitted(trimmed);
    };

    return (
        <div className="setup">
            <GuitarSettings
                options={options}
                onOptionChange={onOptionChange}
                tunings={tunings}
                maxCapo={maxCapo}
                separationAvailable={separationAvailable}
            />

            <div className="setup__col">
                <p className="setup__label"><b>02</b> Add a song</p>
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
    );
};

export default UploadSection;
