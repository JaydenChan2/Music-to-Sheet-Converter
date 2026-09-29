import React, { useState, useRef } from 'react';
import { Upload, FileAudio, AlertCircle, Link2, ArrowRight, Guitar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'mp4', 'flac', 'ogg', 'aac', 'webm', 'aiff', 'aif', 'opus', 'mov'];

const SELECT_CLASS = "w-full rounded-lg bg-zinc-900/60 border border-zinc-800 focus:border-zinc-500 outline-none px-3 py-2 text-sm text-zinc-200";

const GuitarSettings = ({ options, onOptionChange, tunings, maxCapo }) => (
    <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/20 p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Guitar size={16} className="text-zinc-500" />
            Your guitar
            <span className="text-zinc-600 text-xs">How is the guitar in the recording set up?</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1.5">
                <span className="block text-xs uppercase tracking-wider text-zinc-500">Tuning</span>
                <select
                    value={options.tuning}
                    onChange={(e) => onOptionChange('tuning', e.target.value)}
                    className={SELECT_CLASS}
                >
                    {tunings.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.notes})</option>
                    ))}
                    <option value="custom">Custom...</option>
                </select>
            </label>
            <label className="space-y-1.5">
                <span className="block text-xs uppercase tracking-wider text-zinc-500">Capo</span>
                <select
                    value={options.capo}
                    onChange={(e) => onOptionChange('capo', Number(e.target.value))}
                    className={SELECT_CLASS}
                >
                    <option value={0}>No capo</option>
                    {Array.from({ length: maxCapo }, (_, i) => i + 1).map((fret) => (
                        <option key={fret} value={fret}>Capo on fret {fret}</option>
                    ))}
                </select>
            </label>
        </div>
        {options.tuning === 'custom' && (
            <label className="block space-y-1.5">
                <span className="block text-xs uppercase tracking-wider text-zinc-500">Custom tuning (lowest string first)</span>
                <input
                    type="text"
                    value={options.customTuning}
                    onChange={(e) => onOptionChange('customTuning', e.target.value)}
                    placeholder="e.g. D A D G B E  or  C G C F A D"
                    className={SELECT_CLASS + " placeholder:text-zinc-600"}
                />
            </label>
        )}
        {options.capo > 0 && (
            <p className="text-xs text-zinc-500">Frets will be written relative to the capo (0 = capo'd string), as in most tabs.</p>
        )}
    </div>
);

const CUSTOM_TUNING_PATTERN = /^\s*([A-Ga-g][#b♯♭]?\d?[\s,]+){5}[A-Ga-g][#b♯♭]?\d?\s*$/;

const UploadSection = ({ onFileSelected, onUrlSubmitted, options, onOptionChange, tunings, maxCapo, separationAvailable, error }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [localError, setLocalError] = useState(null);
    const [url, setUrl] = useState('');
    const fileInputRef = useRef(null);
    const shownError = localError || error;

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const validateFile = (file) => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!file.type.startsWith('audio/') && !file.type.startsWith('video/') && !AUDIO_EXTENSIONS.includes(ext)) {
            return "Please upload a valid audio file.";
        }
        if (file.size > 200 * 1024 * 1024) {
            return "File size exceeds 200MB limit.";
        }
        return null;
    };

    const validateOptions = () => {
        if (options.tuning === 'custom' && !CUSTOM_TUNING_PATTERN.test(options.customTuning)) {
            return "Enter 6 notes for the custom tuning, lowest string first (e.g. D A D G B E).";
        }
        return null;
    };

    const acceptFile = (file) => {
        setLocalError(null);
        const validationError = validateOptions() || validateFile(file);
        if (validationError) {
            setLocalError(validationError);
        } else {
            onFileSelected(file);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            acceptFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            acceptFile(e.target.files[0]);
        }
        e.target.value = '';
    };

    const handleUrlSubmit = (e) => {
        e.preventDefault();
        setLocalError(null);
        const trimmed = url.trim();
        if (!/^https?:\/\/\S+$/i.test(trimmed)) {
            setLocalError("Please enter a valid http(s) link.");
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
        <div className="w-full mt-12 space-y-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
            >
                <GuitarSettings options={options} onOptionChange={onOptionChange} tunings={tunings} maxCapo={maxCapo} />

                <div
                    className={cn(
                        "relative cursor-pointer overflow-hidden rounded-2xl transition-all duration-300 ease-out",
                        "border border-dashed",
                        isDragging
                            ? "border-zinc-400 bg-zinc-900/80 scale-[1.01]"
                            : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50 hover:border-zinc-700"
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current.click()}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept={`audio/*,video/*,${AUDIO_EXTENSIONS.map((e) => '.' + e).join(',')}`}
                        onChange={handleFileChange}
                    />

                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-6">
                        <div className={cn(
                            "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300",
                            isDragging ? "bg-zinc-100 text-black shadow-xl" : "bg-zinc-900 text-zinc-500"
                        )}>
                            {isDragging ? (
                                <FileAudio size={28} className="animate-bounce" />
                            ) : (
                                <Upload size={24} />
                            )}
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-xl font-medium text-zinc-200">
                                {isDragging ? "Drop audio file" : "Upload Audio"}
                            </h3>
                            <p className="text-zinc-500 text-sm max-w-xs mx-auto">
                                Drag & drop or click to browse.
                                <br />MP3, WAV, M4A, FLAC, OGG, MP4 and more.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-xs uppercase tracking-widest text-zinc-600">
                    <div className="h-px flex-1 bg-zinc-800/70" />
                    or paste a link
                    <div className="h-px flex-1 bg-zinc-800/70" />
                </div>

                <form onSubmit={handleUrlSubmit} className="flex gap-2">
                    <div className="relative flex-1">
                        <Link2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="YouTube, SoundCloud, Bandcamp or a direct audio URL"
                            className="w-full rounded-xl bg-zinc-900/40 border border-zinc-800 focus:border-zinc-500 outline-none pl-11 pr-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!url.trim()}
                        className="rounded-xl bg-white text-black px-5 text-sm font-medium flex items-center gap-2 disabled:opacity-30 hover:bg-zinc-200 transition-colors"
                    >
                        Transcribe <ArrowRight size={16} />
                    </button>
                </form>

                <label className={cn("flex items-start gap-3 text-sm select-none", separationAvailable ? "cursor-pointer" : "opacity-50")}>
                    <input
                        type="checkbox"
                        checked={options.separate && separationAvailable}
                        disabled={!separationAvailable}
                        onChange={(e) => onOptionChange('separate', e.target.checked)}
                        className="mt-0.5 accent-white"
                    />
                    <span>
                        <span className="text-zinc-300">Isolate guitar first</span>
                        <span className="block text-zinc-500 text-xs mt-0.5">
                            {separationAvailable
                                ? "Removes vocals, drums and bass before transcribing. Recommended for full songs; takes longer."
                                : "Unavailable: install demucs on the backend to enable."}
                        </span>
                    </span>
                </label>

                <AnimatePresence>
                    {shownError && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center gap-2 text-red-400 text-sm"
                        >
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{shownError}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

export default UploadSection;
