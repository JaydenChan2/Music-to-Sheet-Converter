import React, { useState, useRef } from 'react';
import { Upload, Music, FileAudio, AlertCircle } from 'lucide-react';
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
        if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['mp3', 'wav', 'mp4', 'm4a', 'flac'].includes(ext)) {
                return "Please upload a valid audio file.";
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

    return (
        <div className="w-full mt-12">
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
            >
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
                        accept="audio/*,video/*,.mp3,.wav,.mp4,.m4a"
                        onChange={handleFileChange}
                    />

                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-6">
                        <div className={cn(
                            "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300",
                            isDragging ? "bg-zinc-100 text-black shadow-xl" : "bg-zinc-900 text-zinc-500 group-hover:text-zinc-300"
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
                                Dragg & drop or click to browse.
                                <br />Support for MP3, WAV, MP4.
                            </p>
                        </div>
                    </div>
                </div>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center gap-2 text-red-400 text-sm"
                        >
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

export default UploadSection;
