import React from 'react';

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const SOURCE_LABEL = {
    captions: 'From the video’s captions',
    'speech recognition': 'From speech recognition',
};

// Hints can come from outside the transcribed part (e.g. "capo 2" said in the
// intro). Those show the time in the full video and can't be jumped to.
const ClipContext = React.createContext({ offset: 0, length: Infinity });

function Stamp({ at, onSeek }) {
    const { offset, length } = React.useContext(ClipContext);
    if (at < -0.5 || at > length + 0.5) {
        return <span className="lesson__time is-outside" title="Said outside the part you transcribed">{fmt(at + offset)} in video</span>;
    }
    return <button className="lesson__time" onClick={() => onSeek(Math.max(0, at))} title="Jump here">{fmt(Math.max(0, at))}</button>;
}

function Setting({ label, hint, value, onSeek, kept }) {
    return (
        <div className={`lesson__setting${kept ? ' is-kept' : ''}`}>
            <span className="lesson__k">{label}</span>
            <strong>{value}</strong>
            <p>
                <Stamp at={hint.at} onSeek={onSeek} /> “{hint.quote}”
                {kept && <em> You set this yourself, so your choice was kept.</em>}
            </p>
        </div>
    );
}

const capoText = (v) => (v === 0 ? 'No capo' : `Capo ${v}`);

/** What tutorial mode picked up from the teacher, with jump-to timestamps. */
export default function LessonPanel({ lesson, clip, duration, onSeek }) {
    if (!lesson) return null;
    const { applied, ignored, chords, transcript, source, dropped_notes: dropped } = lesson;
    const heardNothing = !transcript.length;
    const nothingUseful = !applied.capo && !applied.tuning && !ignored.capo && !ignored.tuning && !chords.length;

    return (
        <ClipContext.Provider value={{ offset: clip?.start || 0, length: duration ?? Infinity }}>
        <section className="lesson">
            <div className="lesson__head">
                <p className="eyebrow" style={{ margin: 0 }}>From the lesson</p>
                {source && <span className="chip">{SOURCE_LABEL[source] || source}</span>}
            </div>

            {heardNothing ? (
                <p className="lesson__empty">
                    {source
                        ? 'No speech was found in this video, so it was transcribed like a song.'
                        : 'This video has no captions and speech recognition isn’t installed, so it was transcribed like a song.'}
                </p>
            ) : (
                <>
                    {(applied.capo || applied.tuning || ignored.capo || ignored.tuning) && (
                        <div className="lesson__settings">
                            {applied.tuning && <Setting label="Tuning set from lesson" value={applied.tuning.name} hint={applied.tuning} onSeek={onSeek} />}
                            {applied.capo && <Setting label="Capo set from lesson" value={capoText(applied.capo.value)} hint={applied.capo} onSeek={onSeek} />}
                            {ignored.tuning && <Setting label="Teacher mentioned" value={ignored.tuning.name} hint={ignored.tuning} onSeek={onSeek} kept />}
                            {ignored.capo && <Setting label="Teacher mentioned" value={capoText(ignored.capo.value)} hint={ignored.capo} onSeek={onSeek} kept />}
                        </div>
                    )}

                    {chords.length > 0 && (
                        <div className="lesson__chords">
                            <span className="lesson__k">Chords mentioned</span>
                            <div className="chips" style={{ marginTop: '.6rem' }}>
                                {chords.map((c) => (
                                    <button key={c.name} className="chip lesson__chord" onClick={() => onSeek(c.at)} title={`First mentioned at ${fmt(c.at)}`}>
                                        {c.name}{c.count > 1 && <small>×{c.count}</small>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {nothingUseful && <p className="lesson__empty">The teacher didn’t mention a capo, tuning or chord names that could be picked up.</p>}
                    {dropped > 0 && (
                        <p className="lesson__note">{dropped} note{dropped === 1 ? '' : 's'} heard while the teacher was talking {dropped === 1 ? 'was' : 'were'} left out. Turn on “Isolate guitar first” to keep guitar played over speech.</p>
                    )}

                    <details className="lesson__transcript">
                        <summary>What the teacher said <span>({transcript.length} lines)</span></summary>
                        <ol>
                            {transcript.map((seg, i) => (
                                <li key={i}><Stamp at={seg.start} onSeek={onSeek} /> {seg.text}</li>
                            ))}
                        </ol>
                    </details>
                </>
            )}
        </section>
        </ClipContext.Provider>
    );
}
