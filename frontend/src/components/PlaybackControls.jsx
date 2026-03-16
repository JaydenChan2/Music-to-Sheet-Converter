import React from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

const PlaybackControls = ({ isPlaying, onPlayPause, progress, duration, onSeek, onSkipBack, onSkipForward }) => {
    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleProgressClick = (e) => {
        const bar = e.currentTarget;
        const rect = bar.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (onSeek) onSeek(fraction);
    };

    const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
            <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/50 rounded-full px-6 py-3 shadow-2xl flex items-center justify-between gap-6">

                {/* Play/Pause Group */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={onSkipBack}
                        className="text-zinc-400 hover:text-white transition-colors"
                        title="Back 5s"
                    >
                        <SkipBack size={18} />
                    </button>

                    <button
                        onClick={onPlayPause}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all"
                    >
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                    </button>

                    <button
                        onClick={onSkipForward}
                        className="text-zinc-400 hover:text-white transition-colors"
                        title="Forward 5s"
                    >
                        <SkipForward size={18} />
                    </button>
                </div>

                {/* Progress Group */}
                <div className="flex-grow flex flex-col gap-1.5">
                    <div
                        className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden cursor-pointer group"
                        onClick={handleProgressClick}
                    >
                        <div
                            className="absolute top-0 left-0 h-full bg-zinc-200 rounded-full transition-all duration-100 ease-linear"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-500 font-medium font-mono">
                        <span>{formatTime(progress)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlaybackControls;
