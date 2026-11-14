import React from 'react';

/** What tabs-on-screen mode read from the video, with the frame it read best. */
export default function VideoTabPanel({ info, frameUrl }) {
    if (!info) return null;
    const pct = Math.round((info.match_rate ?? info.matched / Math.max(1, info.events)) * 100);
    const found = info.bars_read > 0;

    return (
        <section className="vtab">
            <div className="vtab__head">
                <p className="eyebrow" style={{ margin: 0 }}>From the video</p>
                {found && <span className="chip">{info.frames_with_tab} of {info.frames_read} frames showed tab</span>}
            </div>

            {!found ? (
                <p className="lesson__empty">
                    No tab staff was found in this part of the video, so it was transcribed from the audio alone.
                    Tabs on screen needs a six-line tab staff with bar lines in the picture.
                </p>
            ) : (
                <div className="vtab__grid">
                    {frameUrl && (
                        <figure className="vtab__frame">
                            <img src={frameUrl} alt="The frame the tab was read from, with the detected staff and digits outlined" loading="lazy" />
                            <figcaption>What was read: staff lines, bar lines and fret numbers are outlined in orange.</figcaption>
                        </figure>
                    )}
                    <div className="vtab__stats">
                        <div>
                            <span className="vtab__big">{pct}<small>%</small></span>
                            <span className="lesson__k">of notes heard took their string &amp; fret from the video</span>
                        </div>
                        <p>
                            {info.matched} of {info.events} notes matched a column on screen; their strings and frets come
                            from the video, their timing from the recording. {info.bars_read} bars were read
                            {info.numbered ? ', using the printed bar numbers' : ''}.
                        </p>
                        {info.tuning_from_video && (
                            <p className="vtab__note">
                                The on-screen tab fits <strong>{info.tuning_from_video.name}
                                {info.tuning_from_video.capo > 0 ? `, capo ${info.tuning_from_video.capo}` : ''}</strong> best, so that was used.
                            </p>
                        )}
                        {pct < 50 && (
                            <p className="vtab__note">
                                Under half the notes matched. The tab on screen may be for a different part, or a tuning or capo
                                the app couldn’t work out — try setting them yourself.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}

/** Tuning/capo picked up from the video's title or description. */
export function TitleNotice({ fromTitle }) {
    if (!fromTitle || (!fromTitle.tuning && !fromTitle.capo)) return null;
    const parts = [fromTitle.tuning?.name, fromTitle.capo && `capo ${fromTitle.capo.value}`].filter(Boolean);
    const quote = (fromTitle.tuning || fromTitle.capo).quote;
    return (
        <p className="clip-note">
            Set <strong>{parts.join(', ')}</strong> from the video’s description: “{quote}”
        </p>
    );
}
