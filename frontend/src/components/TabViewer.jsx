import React from 'react';

const TabViewer = ({ tabs }) => {
    // Standard guitar string names (high to low, top to bottom as displayed)
    const stringNames = ['e', 'B', 'G', 'D', 'A', 'E'];

    // How many note columns per line before wrapping
    const COLUMNS_PER_LINE = 32;
    // How many columns per measure
    const COLUMNS_PER_MEASURE = 8;

    const renderTabs = () => {
        if (!tabs || tabs.length === 0) {
            return (
                <div className="text-center py-20 border border-dashed border-zinc-800 rounded-xl">
                    <p className="text-zinc-600 text-sm">Waiting for audio data...</p>
                </div>
            );
        }

        // Build column data: each column is an array of 6 values (one per string)
        // null means rest/dash for that string
        const columns = tabs.map(col => {
            const row = new Array(6).fill(null);
            if (col.notes) {
                Object.entries(col.notes).forEach(([strIdx, fret]) => {
                    const idx = parseInt(strIdx);
                    if (idx >= 0 && idx < 6) {
                        row[idx] = fret;
                    }
                });
            }
            return row;
        });

        // Split into lines
        const lines = [];
        for (let i = 0; i < columns.length; i += COLUMNS_PER_LINE) {
            lines.push(columns.slice(i, i + COLUMNS_PER_LINE));
        }

        return lines.map((lineColumns, lineIdx) => (
            <div key={lineIdx} className="mb-8">
                <pre className="text-sm leading-6 text-zinc-300 m-0 overflow-x-auto">
                    {stringNames.map((name, strIdx) => {
                        // Build the string line
                        let line = `${name.padStart(2)}|`;

                        lineColumns.forEach((col, colIdx) => {
                            const val = col[strIdx];
                            if (val !== null && val !== undefined) {
                                const fretStr = String(val);
                                line += fretStr;
                                // Pad: if fret is 2 digits, use 1 dash; if 1 digit, use 2 dashes
                                line += '-'.repeat(Math.max(1, 3 - fretStr.length));
                            } else {
                                line += '---';
                            }

                            // Add measure bar every COLUMNS_PER_MEASURE
                            if ((colIdx + 1) % COLUMNS_PER_MEASURE === 0 && colIdx < lineColumns.length - 1) {
                                line += '|';
                            }
                        });

                        line += '|';
                        return line;
                    }).join('\n')}
                </pre>
            </div>
        ));
    };

    return (
        <div className="w-full mt-6">
            <div
                className="font-mono select-text bg-zinc-900/30 rounded-xl p-6 border border-zinc-800/50"
                style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace" }}
            >
                {renderTabs()}
            </div>
        </div>
    );
};

export default TabViewer;
