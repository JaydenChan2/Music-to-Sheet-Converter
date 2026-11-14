import React from 'react';
import { Link } from 'react-router-dom';
import { LinkArrow, Rail } from '../components/site/primitives';
import { Fretboard, PianoRoll, Stems, TabStaff, Waveform } from '../components/site/Visuals';

const STEPS = [
  { tool: 'yt-dlp', title: 'Download', text: 'Links from YouTube, SoundCloud, Bandcamp or a direct URL are fetched as audio. Uploaded files skip this step.' },
  { tool: 'ffmpeg', title: 'Decode', text: 'Any format — MP3, WAV, M4A, FLAC, OGG, even video — is decoded to plain audio.' },
  { tool: 'Demucs htdemucs_6s', title: 'Isolate', text: 'A six-stem separation model pulls the guitar out from vocals, drums, bass and piano. Optional: off for solo recordings.' },
  { tool: 'Spotify basic-pitch', title: 'Detect', text: 'A neural network finds every note, including chords — pitch, onset, length and pitch bends.' },
  { tool: 'librosa', title: 'Beat grid', text: 'Beat tracking finds the tempo, then notes are snapped to a 16th-note grid in 4/4 bars so the rhythm is readable.' },
  { tool: 'Viterbi search', title: 'Fingering', text: 'Each note can be played in several places. A dynamic-programming search picks the string and fret sequence with the least hand movement and stretch.' },
  { tool: 'Pitch contour', title: 'Slides', text: 'A slide sweeps through the frets in between; a re-pick or hammer-on jumps. Sweeps are written as 3/5 or 7\\5.' },
  { tool: 'Web Audio API', title: 'Playback', text: 'A Karplus-Strong plucked-string synth plays the tab back in the browser, with loop, speed and metronome.' },
];

const RAIL = [
  { title: 'Waveform', text: 'The recording as it arrives.', visual: <Waveform seed={2} split={0} /> },
  { title: 'Stems', text: 'Guitar separated from the band.', visual: <Stems seed={6} /> },
  { title: 'Notes', text: 'Raw detected notes, free timing.', visual: <PianoRoll seed={8} /> },
  { title: 'Grid', text: 'Snapped to beats and 16ths.', visual: <PianoRoll seed={8} snapped /> },
  { title: 'Fingering', text: 'Strings and frets chosen.', visual: <Fretboard /> },
  { title: 'Tab', text: 'The finished tablature.', visual: <TabStaff dur={50} /> },
];

export default function HowItWorks() {
  return (
    <>
      <section className="phero media">
        <PianoRoll seed={14} snapped />
        <div className="scrim scrim--bottom" />
        <div className="hero__inner">
          <div className="wrap">
            <p className="eyebrow" data-reveal>How it works</p>
            <h1 className="display" data-reveal data-reveal-delay="1">Eight steps<br />to a tab</h1>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap statement">
          <h2 className="h2" data-reveal>Signal in,<br />fingers out</h2>
          <p className="lede" data-reveal data-reveal-delay="1">
            Each stage hands a cleaner, more musical version of the song to the next — from raw
            audio, to notes, to rhythm, to positions on the neck. The studio shows you which
            stage it is on as it runs.
          </p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap detail">
          <div className="detail__media media" data-reveal>
            <Fretboard frets={10} dots={[[4, 3], [3, 2], [2, 0], [1, 1], [0, 0], [0, 3], [1, 5], [0, 5], [0, 8]]} />
            <div className="scrim scrim--vignette" />
          </div>
          <div className="detail__steps detail__steps--dense">
            {STEPS.map((s, i) => (
              <div className="detail__step" key={s.title} data-reveal>
                <span className="num">{String(i + 1).padStart(2, '0')}<em>{s.tool}</em></span>
                <h3 className="h3">{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Rail id="stages" eyebrow="Stage by stage" heading={<>What the song<br />looks like</>} slides={RAIL} />

      <section className="section" id="run-locally" style={{ scrollMarginTop: 'var(--h-nav)' }}>
        <div className="wrap--narrow">
          <p className="eyebrow" data-reveal>Run it locally</p>
          <h2 className="h2 mb-xl" data-reveal>Two terminals</h2>
          <div className="detail__steps detail__steps--dense">
            <div className="detail__step" data-reveal>
              <span className="num">01<em>Python 3.10 or 3.11 · ffmpeg</em></span>
              <h3 className="h3">Backend</h3>
              <p>basic-pitch does not support Python 3.12+. The first job downloads the Demucs
                model (~80 MB) and is slower than later ones.</p>
              <pre className="code" style={{ marginTop: '1.4rem' }}>
                <span className="p">$ </span>brew install ffmpeg{'\n'}
                <span className="p">$ </span>cd backend{'\n'}
                <span className="p">$ </span>uv venv --python 3.11 .venv{'\n'}
                <span className="p">$ </span>uv pip install --python .venv/bin/python -r requirements.txt{'\n'}
                <span className="p">$ </span>.venv/bin/python app.py   <span className="c"># http://127.0.0.1:5001</span>
              </pre>
            </div>
            <div className="detail__step" data-reveal>
              <span className="num">02<em>Node 18+</em></span>
              <h3 className="h3">Front end</h3>
              <p>Vite proxies <code>/api</code> to the backend. Point it elsewhere
                with <code>VITE_BACKEND_URL</code>.</p>
              <pre className="code" style={{ marginTop: '1.4rem' }}>
                <span className="p">$ </span>cd frontend{'\n'}
                <span className="p">$ </span>npm install{'\n'}
                <span className="p">$ </span>npm run dev   <span className="c"># http://localhost:5173</span>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--alt section--tight">
        <div className="wrap trio" data-reveal>
          <div className="trio__item">
            <h4>See it run</h4>
            <p>Watch each stage tick by on a real song.</p>
            <LinkArrow to="/studio">Open the studio</LinkArrow>
          </div>
          <div className="trio__item">
            <h4>Check the numbers</h4>
            <p>How each stage holds up against hand-labelled data.</p>
            <LinkArrow to="/accuracy">Accuracy</LinkArrow>
          </div>
          <div className="trio__item">
            <h4>Read the code</h4>
            <p>The full pipeline lives in backend/audio_processor.py.</p>
            <LinkArrow href="https://github.com/JaydenChan2/Music-to-Sheet-Converter">GitHub</LinkArrow>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="band__inner">
          <p className="eyebrow">Next</p>
          <h2 className="h2" data-reveal>Try the pipeline</h2>
          <p className="lede">Run a song through all eight steps.</p>
          <Link className="btn btn--solid" to="/studio">Open the studio</Link>
        </div>
      </section>
    </>
  );
}
