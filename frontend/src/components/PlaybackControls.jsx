import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';

const PlaybackControls = ({ isPlaying, onPlayPause, progress, duration, tempo, onSeek }) => {
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
            <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/50 rounded-full px-6 py-3 shadow-2xl flex items-center justify-between gap-6">

                {/* Play/Pause Group */}
                <div className="flex items-center gap-4">
                    <button className="text-zinc-400 hover:text-white transition-colors">
                        <SkipBack size={18} />
                    </button>

                    <button
                        onClick={onPlayPause}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all"
                    >
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                    </button>

                    <button className="text-zinc-400 hover:text-white transition-colors">
                        <SkipForward size={18} />
                    </button>
                </div>

                {/* Progress Group (Simplified) */}
                <div className="flex-grow flex flex-col gap-1.5">
                    <div className="relative h-1 bg-zinc-800 rounded-full overflow-hidden cursor-pointer group" onClick={onSeek}>
                        <div
                            className="absolute top-0 left-0 h-full bg-zinc-200 transition-all duration-100 ease-linear"
                            style={{ width: `${(progress / duration || 0) * 100}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-500 font-medium font-mono">
                        <span>{formatTime(progress)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                {/* Tempo / Volume Group */}
                <div className="flex items-center gap-3 pl-2 border-l border-zinc-800">
                    {tempo && (
                        <div className="text-[10px] font-mono text-zinc-500">
                            {Math.round(tempo)} BPM
                        </div>
                    )}
                    <Volume2 size={16} className="text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors" />
                </div>
            </div>
        </div>
    );
};

export default PlaybackControls;
