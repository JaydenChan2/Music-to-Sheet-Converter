import React from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';

const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const PlaybackControls = ({ isPlaying, onPlayPause, progress, duration, onSeek, onSkipBack, onSkipForward }) => {
    const handleProgressClick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek?.(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    };
    const percent = duration > 0 ? (progress / duration) * 100 : 0;

    return (
        <div className="player">
            <div className="player__btns">
                <button className="player__skip" onClick={onSkipBack} title="Back 5s" aria-label="Back 5 seconds"><SkipBack size={16} /></button>
                <button className="player__play" onClick={onPlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
                </button>
                <button className="player__skip" onClick={onSkipForward} title="Forward 5s" aria-label="Forward 5 seconds"><SkipForward size={16} /></button>
            </div>
            <div className="player__track">
                <div
                    className="player__bar"
                    onClick={handleProgressClick}
                    role="slider"
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration || 0)}
                    aria-valuenow={Math.round(progress || 0)}
                >
                    <i style={{ width: `${percent}%` }} />
                </div>
                <div className="player__times">
                    <span>{formatTime(progress)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>
        </div>
    );
};

export default PlaybackControls;
