import React, { useEffect, useRef } from 'react';

const TabViewer = ({ tabs, currentTime, isPlaying }) => {
    const containerRef = useRef(null);

    // Strings E A D G B e
    const stringNames = ['e', 'B', 'G', 'D', 'A', 'E'];

    return (
        <div className="w-full mt-8">
            <div className="flex justify-between items-baseline mb-6 border-b border-zinc-800 pb-2">
                <h3 className="text-zinc-100 font-medium tracking-tight">Transcription</h3>
                <div className="text-xs text-zinc-500 font-mono">Standard Tuning</div>
            </div>

            <div
                ref={containerRef}
                className="overflow-x-auto pb-6 custom-scrollbar font-mono text-base leading-relaxed select-text"
            >
                {(!tabs || tabs.length === 0) ? (
                    <div className="text-center py-20 border border-dashed border-zinc-800 rounded-xl">
                        <p className="text-zinc-600 text-sm">Waiting for audio data...</p>
                    </div>
                ) : (
                    <div className="min-w-max bg-zinc-900/30 rounded-xl p-6 border border-zinc-800/50">
                        {stringNames.map((strName, idx) => (
                            <div key={idx} className="flex items-center text-zinc-400 h-8">
                                <span className="w-8 shrink-0 text-zinc-500 font-semibold border-r border-zinc-800 mr-2">{strName}</span>
                                <span className="tracking-[0.2em] flex-grow whitespace-nowrap text-zinc-300">
                                    {tabs.map((column, colIdx) => (
                                        <span
                                            key={colIdx}
                                            className={currentTime >= column.time && currentTime < (tabs[colIdx + 1]?.time || column.time + 0.2)
                                                ? "bg-white text-zinc-950 px-0.5 rounded-[1px]"
                                                : ""
                                            }
                                        >
                                            {column.notes[idx] !== undefined ? column.notes[idx] : '—'}
                                        </span>
                                    ))}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TabViewer;
