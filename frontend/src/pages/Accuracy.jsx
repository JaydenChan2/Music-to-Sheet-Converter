import React from 'react';
import { Link } from 'react-router-dom';
import { LinkArrow, Stat } from '../components/site/primitives';
import { PianoRoll } from '../components/site/Visuals';

const RESULTS = [
  { metric: 'Note onset F1', sub: 'Mean per clip · precision 73.6%, recall 71.1%', score: '71.3%', strong: true },
  { metric: 'Note onset F1', sub: 'Pooled over all notes', score: '66.8%' },
  { metric: 'Note onset + offset F1', sub: 'Mean per clip', score: '39.5%' },
  { metric: 'Exact string & fret', sub: 'Of the 6,906 correctly detected notes', score: '55.2%', strong: true },
  { metric: 'Right pitch, different string', sub: 'Of the same notes', score: '44.8%' },
  { metric: 'basic-pitch raw notes, before the grid', sub: 'Onset F1 for reference', score: '79.2%' },
];

const SETUP = [
  { k: 'Audio', v: 'The mono microphone recordings (not the hexaphonic pickup), GuitarSet 1.1.0 from Zenodo.' },
  { k: 'Split', v: 'Random with a fixed seed: 20 validation clips (3,400 notes) and 60 test clips (11,280 notes), half accompaniment and half solo, covering all 6 players.' },
  { k: 'Pipeline', v: "The app's real pipeline with Demucs off: basic-pitch, then beat grid and 16th-note quantisation, then Viterbi fingering." },
  { k: 'Tuning', v: "Only basic-pitch's onset threshold was tuned — picked on validation (0.6), then the test set was scored once." },
  { k: 'Metrics', v: 'mir_eval.transcription at standard tolerances: pitch within 50 cents, onset within 50 ms. Fingering is scored on notes whose pitch and onset match.' },
];

const LIMITS = [
  { k: 'Possible training overlap', v: "basic-pitch was probably trained on GuitarSet, which may inflate note F1. The fingering score comes from this project's own Viterbi step and is not affected." },
  { k: 'Clean, solo audio', v: 'Studio recordings with Demucs off. Real songs with a band behind the guitar will likely score lower.' },
  { k: 'One right answer', v: "Fingering is graded against one player's choice. A different string is often still playable, so 55.2% understates how usable the tabs are." },
  { k: 'Coarse offsets', v: 'Every note in a chord gets the same grid-snapped length, so treat onset + offset F1 as a rough floor.' },
  { k: 'Random split', v: 'Validation and test share players and progressions. Only one setting was tuned, so the effect should be small.' },
  { k: 'Sample size', v: 'Only 60 of the 340 non-validation clips are scored. Pass --n-test 340 for a tighter estimate.' },
];

export default function Accuracy() {
  return (
    <>
      <section className="phero media">
        <PianoRoll seed={42} />
        <div className="scrim scrim--bottom" />
        <div className="hero__inner">
          <div className="wrap">
            <p className="eyebrow" data-reveal>Evaluation</p>
            <h1 className="display" data-reveal data-reveal-delay="1">Accuracy</h1>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap statement">
          <h2 className="h2" data-reveal>Graded against<br />hand-labelled<br />guitar</h2>
          <p className="lede" data-reveal data-reveal-delay="1">
            GuitarSet (Xi et al., ISMIR 2018) records every note with a hexaphonic pickup and
            corrects it by hand — so each note has a pitch, onset, offset <em>and string</em>.
            That makes it possible to grade the fingering, not just the notes.
          </p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="stats stats--3">
            <Stat value="71.3" suffix="%" label="Note onset F1" note="Mean per clip on the test set." />
            <Stat value="55.2" suffix="%" label="Exact string & fret" note="Of the notes it detected correctly." delay="1" />
            <Stat value="79.2" suffix="%" label="Before the grid" note="Snapping to readable 16ths costs about 8 points." delay="2" />
          </div>
        </div>
      </section>

      <section className="section section--alt">
        <div className="wrap--narrow">
          <p className="eyebrow" data-reveal>Results</p>
          <h2 className="h2 mb-xl" data-reveal>Test set · 60 clips<br />11,280 notes</h2>
          <table className="dtable" data-reveal>
            <thead><tr><th>Metric</th><th>Score</th></tr></thead>
            <tbody>
              {RESULTS.map((r) => (
                <tr key={r.metric + r.sub}>
                  <td>{r.metric}<small>{r.sub}</small></td>
                  <td>{r.strong ? <strong className="hl">{r.score}</strong> : <strong>{r.score}</strong>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="wrap detail">
          <div>
            <p className="eyebrow" data-reveal>Setup</p>
            <h2 className="h2" data-reveal>How it<br />was measured</h2>
          </div>
          <div className="detail__steps detail__steps--dense">
            {SETUP.map((s) => (
              <div className="detail__step" key={s.k} data-reveal>
                <h3 className="h3">{s.k}</h3>
                <p>{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--alt" id="limitations" style={{ scrollMarginTop: 'var(--h-nav)' }}>
        <div className="wrap detail">
          <div>
            <p className="eyebrow" data-reveal>Limitations</p>
            <h2 className="h2" data-reveal>Read the<br />fine print</h2>
          </div>
          <div className="detail__steps detail__steps--dense">
            {LIMITS.map((s) => (
              <div className="detail__step" key={s.k} data-reveal>
                <h3 className="h3">{s.k}</h3>
                <p>{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap--narrow">
          <p className="eyebrow" data-reveal>Reproduce</p>
          <h2 className="h2 mb-xl" data-reveal>About five minutes</h2>
          <pre className="code" data-reveal>
            <span className="p">$ </span>cd backend{'\n'}
            <span className="p">$ </span>mkdir -p .benchmark_cache/guitarset && cd .benchmark_cache/guitarset{'\n'}
            <span className="p">$ </span>curl -L -o annotation.zip     https://zenodo.org/api/records/3371780/files/annotation.zip/content{'\n'}
            <span className="p">$ </span>curl -L -o audio_mono-mic.zip https://zenodo.org/api/records/3371780/files/audio_mono-mic.zip/content{'\n'}
            <span className="p">$ </span>unzip -q annotation.zip -d annotation && unzip -q audio_mono-mic.zip -d audio_mono-mic{'\n'}
            <span className="p">$ </span>cd ../.. && .venv/bin/python benchmark_guitarset.py   <span className="c"># outputs are cached</span>
          </pre>
          <div className="mt-lg" data-reveal>
            <LinkArrow href="https://guitarset.weebly.com/">About GuitarSet</LinkArrow>
          </div>
        </div>
      </section>

      <section className="band section--alt">
        <div className="band__inner">
          <p className="eyebrow">Judge for yourself</p>
          <h2 className="h2" data-reveal>Hear the result</h2>
          <p className="lede">Transcribe a song, then switch to the synth and compare it with the original.</p>
          <Link className="btn btn--solid" to="/studio">Open the studio</Link>
        </div>
      </section>
    </>
  );
}
