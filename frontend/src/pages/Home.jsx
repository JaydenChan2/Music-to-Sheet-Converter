import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Carousel, LinkArrow, Rail, Stat } from '../components/site/primitives';
import { ExportSheet, Fretboard, LoopBar, PianoRoll, Stems, TabStaff, Tuning, Waveform } from '../components/site/Visuals';

const PIPELINE = [
  { title: 'Add a song', text: 'Drop an audio file or paste a YouTube, SoundCloud, Bandcamp or direct link.', visual: <Waveform seed={3} split={0} /> },
  { title: 'Isolate the guitar', text: 'Demucs separates guitar from vocals, drums and bass.', visual: <Stems /> },
  { title: 'Detect every note', text: 'basic-pitch finds polyphonic notes, chords and pitch bends.', visual: <PianoRoll seed={5} /> },
  { title: 'Find the beat', text: 'A beat grid snaps notes to readable 16th-note rhythm.', visual: <PianoRoll seed={5} snapped /> },
  { title: 'Choose the fingering', text: 'A Viterbi search picks strings and frets that keep your hand still.', visual: <Fretboard /> },
  { title: 'Read the tab', text: 'Bars, slides and timing, synced to playback.', visual: <TabStaff dur={60} /> },
];

const HIGHLIGHTS = [
  { title: 'Any tuning', text: 'Ten presets from Drop D to DADGAD, or type your own.', to: '/features#tunings', visual: <Tuning /> },
  { title: 'Capo aware', text: 'Frets are written relative to the capo, like real tabs.', to: '/features#tunings', visual: <Fretboard dots={[[3, 4], [2, 2], [1, 3], [0, 2], [1, 4]]} frets={6} /> },
  { title: 'Slides marked', text: 'A pitch sweep becomes 3/5; a re-pick stays two notes.', to: '/features#slides', visual: <TabStaff dur={36} showLabels={false} /> },
  { title: 'Hear the tab', text: 'A plucked-string synth plays exactly what was written.', to: '/features#synth', visual: <Waveform seed={11} split={0.6} animate /> },
  { title: 'Loop a bar', text: 'Repeat a tricky bar at 50% speed until it sticks.', to: '/features#practice', visual: <LoopBar /> },
  { title: 'Take it with you', text: 'Download as text tab, or MIDI for MuseScore.', to: '/features#export', visual: <ExportSheet /> },
];

export default function Home() {
  return (
    <>
      {/* 1 · hero */}
      <section className="hero media">
        <TabStaff />
        <div className="scrim scrim--bottom" />
        <div className="hero__inner">
          <div className="wrap">
            <h1 className="display hero__title" data-reveal>Audio<br />to <span className="hl">tab</span></h1>
            <p className="hero__copy" data-reveal data-reveal-delay="1">
              Drop in a recording or paste a link. Get back guitar tablature you can actually
              play: strings, frets, slides and rhythm.
            </p>
            <div className="hero__cta" data-reveal data-reveal-delay="2">
              <Link className="btn btn--solid" to="/studio">Open the studio</Link>
              <Link className="btn btn--ghost" to="/how-it-works">How it works</Link>
            </div>
          </div>
        </div>
        <div className="scroll-cue"><span>Scroll</span><i /></div>
      </section>

      {/* 2 · statement */}
      <section className="section">
        <div className="wrap statement">
          <h2 className="h2" data-reveal>Every note,<br />on the string<br />you'd play it</h2>
          <p className="lede" data-reveal data-reveal-delay="1">
            Hearing a pitch is half the job. The same E can be played in five places, so every
            note is placed by a search that keeps your hand still and your stretches short —
            the way a guitarist would write it down.
          </p>
        </div>
      </section>

      {/* 3 · pipeline rail */}
      <Rail id="pipeline" eyebrow="The pipeline" heading={<>From waveform<br />to fretboard</>} slides={PIPELINE} />

      {/* 4 · stats */}
      <section className="section">
        <div className="wrap">
          <p className="eyebrow" data-reveal>Measured on GuitarSet</p>
          <h2 className="h2 mb-xl" data-reveal>Accuracy,<br />not adjectives</h2>
          <div className="stats stats--3">
            <Stat value="71.3" suffix="%" label="Note onset F1" />
            <Stat value="55.2" suffix="%" label="Exact string & fret" delay="1" />
            <Stat value="11280" suffix="notes" label="Scored on 60 test clips" delay="2" />
          </div>
          <div className="mt-lg" data-reveal><LinkArrow to="/accuracy">Read the evaluation</LinkArrow></div>
        </div>
      </section>

      {/* 5 · feature duo */}
      <section className="section section--tight">
        <div className="wrap duo">
          <Link to="/features#synth" className="gl-panel media" data-reveal>
            <Waveform seed={7} split={0.55} animate />
            <div className="scrim scrim--bottom" />
            <div className="gl-panel__copy">
              <h3 className="h3">Hear it<br />as written</h3>
              <p>Switch from the original recording to a built-in guitar synth that plays the tab
                note for note — the fastest way to hear what the transcription got right.</p>
            </div>
          </Link>
          <Link to="/features#tunings" className="gl-panel gl-panel--tall media" data-reveal data-reveal-delay="1">
            <Tuning notes={['D', 'A', 'D', 'G', 'A', 'D']} changed={[0, 4, 5]} />
            <div className="scrim scrim--bottom" />
            <div className="gl-panel__copy">
              <h3 className="h3">Any tuning,<br />any capo</h3>
              <p>Tell it how the guitar in the recording is set up — Drop D, Open G, DADGAD or
                your own — and the fingering follows.</p>
            </div>
          </Link>
        </div>
      </section>

      {/* 6 · full bleed */}
      <section className="bleed media">
        <Stems seed={21} />
        <div className="scrim scrim--full" />
        <div className="bleed__copy">
          <div className="wrap">
            <p className="eyebrow" data-reveal>Source separation</p>
            <h2 className="h2" data-reveal data-reveal-delay="1">Pulled out of<br />the full mix</h2>
            <p className="lede" data-reveal data-reveal-delay="2">
              Full songs go through Demucs first, so vocals, drums and bass don't turn into
              phantom notes. Solo recordings can skip it and finish faster.
            </p>
          </div>
        </div>
      </section>

      {/* 7 · second stat band */}
      <section className="section section--alt">
        <div className="wrap">
          <p className="eyebrow" data-reveal>Built for practice</p>
          <h2 className="h2 mb-xl" data-reveal>Slow it down</h2>
          <div className="stats stats--2">
            <Stat value="50" suffix="%" label="Slowest speed, pitch preserved" />
            <Stat value="4" suffix="tones" label="Steel, nylon, clean, overdrive" delay="1" />
          </div>
        </div>
      </section>

      {/* 8 · sticky detail */}
      <section className="section">
        <div className="wrap detail">
          <div className="detail__media media" data-reveal>
            <TabStaff dur={70} />
            <div className="scrim scrim--vignette" />
          </div>
          <div className="detail__steps">
            <div className="detail__step" data-reveal>
              <span className="num">Follow along</span>
              <h3 className="h3">The bar lights up</h3>
              <p>The current bar and beat highlight as the song plays. Click any bar to jump
                straight to it.</p>
            </div>
            <div className="detail__step" data-reveal>
              <span className="num">Click to hear</span>
              <h3 className="h3">Every fret is a button</h3>
              <p>Not sure about a note? Click the fret number and hear it on that string.</p>
            </div>
            <div className="detail__step" data-reveal>
              <span className="num">Export</span>
              <h3 className="h3">TXT and MIDI</h3>
              <p>Keep the tab as plain text, or open the MIDI in MuseScore for standard
                notation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 9 · split word */}
      <section className="section split" aria-label="Hear it, play it">
        <span data-reveal>Hear it</span>
        <span data-reveal data-reveal-delay="1">Play it</span>
      </section>

      {/* 10 · range cards */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <h2 className="h2" style={{ marginBottom: 'clamp(36px,6vh,72px)' }} data-reveal>Where to next</h2>
          <div className="cards">
            <Link to="/studio" className="card" data-reveal>
              <div className="media"><Waveform seed={19} split={0.3} /></div>
              <div className="scrim scrim--bottom" />
              <div className="card__copy">
                <p className="card__kicker">Studio</p>
                <h3 className="h3">Transcribe a song</h3>
                <p>Set your tuning and capo, add a file or link, and watch the tab come together.</p>
                <span className="link-arrow">Open the studio <ArrowRight /></span>
              </div>
            </Link>
            <Link to="/how-it-works" className="card" data-reveal data-reveal-delay="1">
              <div className="media"><PianoRoll seed={31} snapped /></div>
              <div className="scrim scrim--bottom" />
              <div className="card__copy">
                <p className="card__kicker">Method</p>
                <h3 className="h3">How it works</h3>
                <p>Eight steps from a link to a fingered tab, and the tools behind each one.</p>
                <span className="link-arrow">See the pipeline <ArrowRight /></span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* 10b · highlights carousel */}
      <section className="section section--alt">
        <div className="wrap">
          <Carousel
            eyebrow="Highlights"
            heading="More than notes"
            aside={<LinkArrow to="/features">All features</LinkArrow>}
            items={HIGHLIGHTS}
          />
        </div>
      </section>

      {/* 11 · trio */}
      <section className="section section--tight">
        <div className="wrap trio" data-reveal>
          <div className="trio__item">
            <h4>Upload a file</h4>
            <p>MP3, WAV, M4A, FLAC, OGG, MP4 and more, up to 200 MB.</p>
            <LinkArrow to="/studio">Upload</LinkArrow>
          </div>
          <div className="trio__item">
            <h4>Paste a link</h4>
            <p>YouTube, SoundCloud, Bandcamp or any direct audio URL.</p>
            <LinkArrow to="/studio">Paste a link</LinkArrow>
          </div>
          <div className="trio__item">
            <h4>Run it yourself</h4>
            <p>A Flask backend and a React front end. Set up in a few commands.</p>
            <LinkArrow to="/how-it-works#run-locally">Setup guide</LinkArrow>
          </div>
        </div>
      </section>

      {/* 12 · band */}
      <section className="band media">
        <TabStaff dur={80} showLabels={false} />
        <div className="scrim scrim--full" style={{ background: 'rgba(var(--wash), .82)' }} />
        <div className="band__inner">
          <p className="eyebrow">Start here</p>
          <h2 className="h2" data-reveal>One song<br />at a time</h2>
          <p className="lede">Pick something you've always wanted to learn. Your tuning and playback
            settings are remembered for next time.</p>
          <Link className="btn btn--solid" to="/studio">Transcribe a song</Link>
        </div>
      </section>
    </>
  );
}

