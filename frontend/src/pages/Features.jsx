import React from 'react';
import { Link } from 'react-router-dom';
import { LinkArrow } from '../components/site/primitives';
import { ExportSheet, Fretboard, LoopBar, Stems, TabStaff, Tuning, Waveform } from '../components/site/Visuals';

const TUNINGS = ['Standard', 'Drop D', 'Half step down', 'Whole step down', 'Drop C#', 'Drop C', 'Open G', 'Open D', 'Open E', 'DADGAD', 'Custom'];

const SLIDE_RIFF = [{ 1: '3' }, {}, { 1: '/5' }, {}, { 1: '5' }, { 0: '3' }, {}, { 0: '/5' }, {}, { 2: '7' }, { 2: '\\5' }, {}, { 1: '5' }, { 1: '3' }, {}, {}];

const ROWS = [
  {
    id: 'tunings',
    kicker: 'Setup',
    title: <>Tunings<br />and capo</>,
    text: "Tell it how the guitar in the recording is set up. Fingerings are chosen for that tuning, and with a capo, frets are written relative to it — 0 means the capo'd string, as in most tabs. Your choice is remembered.",
    visual: <Tuning notes={['D', 'A', 'D', 'G', 'B', 'E']} changed={[0]} />,
    chips: TUNINGS,
  },
  {
    id: 'separation',
    kicker: 'Source separation',
    title: <>Guitar,<br />isolated</>,
    text: 'For full songs, Demucs removes vocals, drums and bass before transcribing, so they do not turn into phantom notes. Turn it off for solo guitar recordings to save time.',
    visual: <Stems seed={4} />,
  },
  {
    id: 'slides',
    kicker: 'Technique',
    title: <>Slides,<br />marked</>,
    text: 'A slide sweeps through the frets in between; a re-pick or hammer-on jumps. The pitch contour tells them apart, and slides are written the way you would: 3/5 up, 7\\5 down.',
    visual: <TabStaff riff={SLIDE_RIFF} dur={22} col="96px" showLabels={false} />,
    chips: ['/ slide up', '\\ slide down'],
  },
  {
    id: 'synth',
    kicker: 'Playback',
    title: <>Hear the tab<br />as written</>,
    text: 'Switch between the original recording and a Karplus-Strong plucked-string synth that plays the tab note for note, right in the browser. A/B them at the same position to check the transcription by ear.',
    visual: <Waveform seed={13} split={0.5} animate />,
    chips: ['Acoustic (steel)', 'Classical (nylon)', 'Electric (clean)', 'Electric (overdrive)'],
  },
  {
    id: 'practice',
    kicker: 'Practice',
    title: <>Loop, slow,<br />click</>,
    text: 'Loop the current bar, drop the speed to 50% or 75% without changing pitch, turn on a metronome, and click any fret number to hear that single note.',
    visual: <LoopBar />,
    chips: ['50%', '75%', '100%', '125%'],
  },
  {
    id: 'fingering',
    kicker: 'Fingering',
    title: <>Hand-aware<br />placement</>,
    text: 'Every note has several possible string and fret positions. A Viterbi search picks the sequence that minimises hand movement and stretch across the whole song, not just note by note.',
    visual: <Fretboard />,
  },
  {
    id: 'export',
    kicker: 'Export',
    title: <>TXT<br />and MIDI</>,
    text: 'Download the tab as plain text to print or share, or as MIDI to open in MuseScore or any DAW for standard notation.',
    visual: <ExportSheet />,
  },
];

export default function Features() {
  return (
    <>
      <section className="phero media">
        <Fretboard frets={12} dots={[[5, 0], [4, 2], [3, 2], [2, 1], [1, 0], [0, 0], [0, 3], [1, 5], [0, 7], [0, 10]]} fit="xMaxYMid meet" />
        <div className="scrim scrim--bottom" />
        <div className="hero__inner">
          <div className="wrap">
            <p className="eyebrow" data-reveal>Features</p>
            <h1 className="display" data-reveal data-reveal-delay="1">Made for<br />players</h1>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap statement">
          <h2 className="h2" data-reveal>Read it.<br />Hear it.<br />Loop it.</h2>
          <p className="lede" data-reveal data-reveal-delay="1">
            The transcription is the start, not the end. Everything here exists to get a song
            from a recording into your hands.
          </p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          {ROWS.map((r, i) => (
            <article key={r.id} id={r.id} className={`frow${i % 2 ? ' frow--flip' : ''}`}>
              <div className="media" data-reveal>{r.visual}</div>
              <div className="detail__step" data-reveal data-reveal-delay="1">
                <span className="num">{String(i + 1).padStart(2, '0')} — {r.kicker}</span>
                <h3 className="h2" style={{ fontSize: 'clamp(1.7rem,3.2vw,3rem)' }}>{r.title}</h3>
                <p className="lede" style={{ marginTop: '1.2rem' }}>{r.text}</p>
                {r.chips && (
                  <div className="chips">
                    {r.chips.map((c, n) => <span key={c} className={`chip${n === 0 ? ' chip--on' : ''}`}>{c}</span>)}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--alt">
        <div className="wrap trio" data-reveal>
          <div className="trio__item">
            <h4>Try it on a song</h4>
            <p>Every feature above is live in the studio.</p>
            <LinkArrow to="/studio">Open the studio</LinkArrow>
          </div>
          <div className="trio__item">
            <h4>Under the hood</h4>
            <p>The tools behind each step, from yt-dlp to Viterbi.</p>
            <LinkArrow to="/how-it-works">How it works</LinkArrow>
          </div>
          <div className="trio__item">
            <h4>How good is it?</h4>
            <p>Scored against hand-corrected GuitarSet annotations.</p>
            <LinkArrow to="/accuracy">Accuracy</LinkArrow>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="band__inner">
          <p className="eyebrow">Ready</p>
          <h2 className="h2" data-reveal>Bring a song</h2>
          <p className="lede">A file or a link is all it takes.</p>
          <Link className="btn btn--solid" to="/studio">Start transcribing</Link>
        </div>
      </section>
    </>
  );
}
