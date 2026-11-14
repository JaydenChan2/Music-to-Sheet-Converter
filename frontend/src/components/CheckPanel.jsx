import React from 'react';

const LABELS = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

/** Result of cross-checking the finished tab against the recording. */
export default function CheckPanel({ check, showUnsure, onToggleUnsure, showRemoved, onToggleRemoved, onSeekBar }) {
    if (!check) return null;
    const pct = Math.round(check.overall * 100);
    const { removed = 0, repitched = 0 } = check.changes || {};
    const flagged = check.bars.filter((b) => check.flagged_bars.includes(b.index));

    return (
        <section className={`tcheck tcheck--${check.label}`}>
            <div className="tcheck__score">
                <span className="tcheck__pct">{pct}<small>%</small></span>
                <span className="tcheck__label">{LABELS[check.label]}</span>
            </div>

            <div className="tcheck__body">
                <p className="eyebrow" style={{ margin: 0 }}>Tab check</p>
                <p className="tcheck__lede">
                    Every note was checked against the recording. About <strong>{pct}%</strong> of them are likely right.
                    {check.unsure_notes > 0
                        ? ` ${check.unsure_notes} of ${check.total_notes} notes are marked as unsure.`
                        : ' No notes needed flagging.'}
                </p>
                {(removed > 0 || repitched > 0) && (
                    <p className="tcheck__note">
                        Refined: {removed > 0 && `hid ${removed} note${removed === 1 ? '' : 's'} the recording didn’t clearly support`}
                        {removed > 0 && repitched > 0 && ', '}
                        {repitched > 0 && `corrected the pitch of ${repitched}`}.
                    </p>
                )}

                {flagged.length > 0 && (
                    <div className="tcheck__bars">
                        <span className="lesson__k">Bars to double-check</span>
                        <div className="chips" style={{ marginTop: '.6rem' }}>
                            {flagged.map((b) => (
                                <button
                                    key={b.index}
                                    className="chip tcheck__bar"
                                    onClick={() => onSeekBar(b)}
                                    title={`${Math.round(b.confidence * 100)}% confidence · ${b.unsure_notes} of ${b.notes} notes unsure`}
                                >
                                    Bar {b.index + 1} <small>{Math.round(b.confidence * 100)}%</small>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="tcheck__toggles">
                    <label className="tcheck__toggle">
                        <input type="checkbox" checked={showUnsure} onChange={(e) => onToggleUnsure(e.target.checked)} />
                        <span className="tcheck__box" aria-hidden="true" />
                        Highlight unsure notes in the tab
                    </label>
                    {removed > 0 && (
                        <label className="tcheck__toggle">
                            <input type="checkbox" checked={showRemoved} onChange={(e) => onToggleRemoved(e.target.checked)} />
                            <span className="tcheck__box" aria-hidden="true" />
                            Show removed notes ({removed}) as faint ghosts
                        </label>
                    )}
                </div>
            </div>
        </section>
    );
}
