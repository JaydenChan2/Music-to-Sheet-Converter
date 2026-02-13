import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const TabViewer = ({ tabs, currentTime, isPlaying }) => {
    const containerRef = useRef(null);

    // Strings E A D G B e
    const stringNames = ['e', 'B', 'G', 'D', 'A', 'E'];

    // Mock data handling if tabs is empty or just initialized
    // We expect tabs to be a list of "measures" or a long stream of columns
    // For simplicity, let's assume `tabs` is an array of columns:
    // [ { "E": "-", "A": "0", ... }, ... ]

    // If tabs is just a raw list of notes, we need to convert it. 
    // For this component, let's assume the parent passes formatted 'blocks' of text or a structured object.
    // Let's use a structured approach: List of { time: float, notes: { stringIdx: fret } }

    return (
        <div className="w-full max-w-4xl mx-auto mt-8 bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-2xl backdrop-blur-md overflow-hidden">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Generated Tablature</h3>
                <div className="text-sm text-slate-400">Standard Tuning (E A D G B E)</div>
            </div>

            <div
                ref={containerRef}
                className="overflow-x-auto pb-4 custom-scrollbar font-mono text-lg leading-relaxed select-text"
            >
                {(!tabs || tabs.length === 0) ? (
                    <div className="text-center text-slate-500 py-12">
                        No tab data available yet.
                    </div>
                ) : (
                    <div className="min-w-max">
                        {stringNames.map((strName, idx) => (
                            <div key={idx} className="flex items-center text-slate-300 hover:bg-slate-800/50 rounded px-2 transition-colors">
                                <span className="w-8 sticky left-0 font-bold text-purple-400 bg-slate-900 z-10">{strName}|</span>
                                <span className="tracking-[0.15em] ml-2">
                                    {/* Render string content */}
                                    {tabs.map((column, colIdx) => (
                                        <span
                                            key={colIdx}
                                            className={currentTime >= column.time && currentTime < (tabs[colIdx + 1]?.time || column.time + 0.2)
                                                ? "bg-purple-500/50 text-white rounded-sm"
                                                : ""
                                            }
                                        >
                                            {column.notes[idx] !== undefined ? column.notes[idx] : '-'}
                                        </span>
                                    ))}
                                </span>
                                <span className="ml-2">|</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TabViewer;
