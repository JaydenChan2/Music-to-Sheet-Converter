import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';

const PlaybackControls = ({ isPlaying, onPlayPause, progress, duration, tempo, onSeek }) => {
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-800 backdrop-blur-xl p-4 z-50">
            <div className="max-w-4xl mx-auto flex flex-col gap-3">
                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden cursor-pointer group" onClick={onSeek}>
                    <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 relative transition-all duration-100 ease-linear"
                        style={{ width: `${(progress / duration) * 100}%` }}
                    >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-400 font-medium w-16">
                        {formatTime(progress)} / {formatTime(duration)}
                    </div>

                    <div className="flex items-center gap-6">
                        <button className="text-slate-400 hover:text-white transition-colors">
                            <SkipBack size={20} />
                        </button>

                        <button
                            onClick={onPlayPause}
                            className="w-12 h-12 flex items-center justify-center rounded-full bg-white text-purple-900 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-purple-500/20"
                        >
                            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                        </button>

                        <button className="text-slate-400 hover:text-white transition-colors">
                            <SkipForward size={20} />
                        </button>
                    </div>

                    <div className="flex items-center gap-4 w-16 justify-end">
                        {tempo && (
                            <div className="text-xs font-mono text-purple-400 border border-purple-500/30 px-2 py-1 rounded bg-purple-500/5">
                                {Math.round(tempo)} BPM
                            </div>
                        )}
                        <Volume2 size={18} className="text-slate-400 cursor-pointer hover:text-white" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlaybackControls;
