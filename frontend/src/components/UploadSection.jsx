import React, { useState, useRef } from 'react';
import { Upload, Music, FileAudio, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const UploadSection = ({ onFileSelected }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const validateFile = (file) => {
        const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'video/mp4', 'audio/x-m4a'];
        // Allow broad audio/video types or check extension if mime type is generic
        if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
            // Fallback check for extensions
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['mp3', 'wav', 'mp4', 'm4a', 'flac'].includes(ext)) {
                return "Please upload a valid audio or video file (MP3, WAV, MP4).";
            }
        }
        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            return "File size exceeds 50MB limit.";
        }
        return null;
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        setError(null);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            const validationError = validateFile(file);
            if (validationError) {
                setError(validationError);
            } else {
                onFileSelected(file);
            }
        }
    };

    const handleFileChange = (e) => {
        setError(null);
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const validationError = validateFile(file);
            if (validationError) {
                setError(validationError);
            } else {
                onFileSelected(file);
            }
        }
    };

    const onButtonClick = () => {
        fileInputRef.current.click();
    };

    return (
        <div className="w-full max-w-2xl mx-auto mt-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div
                    className={cn(
                        "relative group cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 ease-out",
                        isDragging
                            ? "border-purple-500 bg-purple-500/10 scale-[1.02]"
                            : "border-slate-700 bg-slate-900/50 hover:border-purple-400/50 hover:bg-slate-800/50"
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={onButtonClick}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="audio/*,video/*,.mp3,.wav,.mp4,.m4a"
                        onChange={handleFileChange}
                    />

                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                        <div className={cn(
                            "w-20 h-20 mb-6 rounded-full flex items-center justify-center transition-all duration-300",
                            isDragging ? "bg-purple-500 text-white shadow-lg shadow-purple-500/30" : "bg-slate-800 text-purple-400 group-hover:scale-110 group-hover:bg-slate-700"
                        )}>
                            {isDragging ? (
                                <FileAudio size={40} className="animate-bounce" />
                            ) : (
                                <Upload size={32} />
                            )}
                        </div>

                        <h3 className="text-2xl font-bold text-white mb-2">
                            {isDragging ? "Drop audio file here" : "Upload Audio or Video"}
                        </h3>

                        <p className="text-slate-400 max-w-sm mx-auto mb-6">
                            Drag and drop your guitar recording, or click to browse.
                            Supports MP3, WAV, MP4.
                        </p>

                        <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
                            <span className="flex items-center gap-1.5">
                                <Music size={14} /> High Precision Pitch
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={14} /> Smart Tabs
                            </span>
                        </div>
                    </div>

                    {/* Decorative gradients */}
                    <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-600/30 transition-colors" />
                    <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-pink-600/20 rounded-full blur-3xl pointer-events-none group-hover:bg-pink-600/30 transition-colors" />
                </div>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-200"
                        >
                            <AlertCircle size={20} className="text-red-500" />
                            <p>{error}</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

export default UploadSection;
