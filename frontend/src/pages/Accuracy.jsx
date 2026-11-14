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

const CALIBRATION = [
  { shown: '~44%', notes: '590', right: '52.5%' },
  { shown: '~61%', notes: '1,413', right: '64.5%' },
  { shown: '~78%', notes: '2,012', right: '80.5%' },
  { shown: '~93%', notes: '3,921', right: '93.3%' },
];

const TAB_VIDEO = [
  { metric: 'Exact string & fret', sub: 'Of notes matched to the answers', audio: '68.2%', video: '94.5%', strong: true },
  { metric: 'Note onset F1', sub: 'Were the right notes found, at the right time?', audio: '66.4%', video: '66.5%' },
  { metric: 'Drawn notes read back correctly', sub: 'Frame reader alone · 10 of 12 clips between 77% and 100%', audio: '–', video: '86.3%' },
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
  { k: 'The tab check knows clean guitar', v: 'Its confidence model was fitted on GuitarSet. On lo-fi or dense mixes it is less sure of itself and hides more notes, which is why hidden notes can be shown again in the studio.' },
  { k: 'Drawn tab videos, not real ones', v: 'The tabs-on-screen numbers come from tab videos drawn from the annotations, so the answers are known. Real videos vary more in style; very dense, fast strumming is the reader’s weak spot (two rock clips read at 25% and 56%).' },
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

      <section className="section" id="tab-check" style={{ scrollMarginTop: 'var(--h-nav)' }}>
        <div className="wrap">
          <div className="statement mb-xl">
            <div>
              <p className="eyebrow" data-reveal>Tab check</p>
              <h2 className="h2" data-reveal>Checked against<br />the recording</h2>
            </div>
            <p className="lede" data-reveal data-reveal-delay="1">
              After the tab is built, every note is checked against the audio and given a confidence. Notes the
              recording barely supports are hidden, and the score is honest: notes shown as 80% sure are right
              about 80% of the time.
            </p>
          </div>
          <div className="stats stats--3">
            <Stat value="72.9" suffix="%" label="Note onset F1 with the check" note="Up from 71.3% without it, on the same 60 test clips." />
            <Stat value="0.84" label="Right-vs-wrong separation" note="Cross-validated AUC of the confidence model on 3,009 validation notes." delay="1" />
            <Stat value="5.4" suffix="pts" label="Overall score error" note="Average gap between the tab’s score and its real share of right notes." delay="2" />
          </div>
          <div className="wrap--narrow" style={{ marginTop: 'clamp(64px, 11vh, 120px)' }}>
            <table className="dtable" data-reveal>
              <thead><tr><th>Confidence shown</th><th>Notes</th><th>Actually right</th></tr></thead>
              <tbody>
                {CALIBRATION.map((c) => (
                  <tr key={c.shown}><td>{c.shown}</td><td>{c.notes}</td><td><strong>{c.right}</strong></td></tr>
                ))}
              </tbody>
            </table>
            <p className="body" style={{ marginTop: '1.4rem', color: 'var(--ink-mute)' }}>
              Bars flagged “double-check” have about 75% of notes right, against 83% for the rest. Test set, scored once.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--alt" id="tabs-on-screen" style={{ scrollMarginTop: 'var(--h-nav)' }}>
        <div className="wrap">
          <div className="statement mb-xl">
            <div>
              <p className="eyebrow" data-reveal>Tabs on screen</p>
              <h2 className="h2" data-reveal>When the video<br />shows the tab</h2>
            </div>
            <p className="lede" data-reveal data-reveal-delay="1">
              GuitarSet’s annotations were drawn as a play-along tab video — bar numbers, page flips, video
              compression — and played over the real recordings, so every right answer is known. 12 test clips.
            </p>
          </div>
          <div className="stats stats--3">
            <Stat value="94.5" suffix="%" label="Exact string & fret" note="With the tab on screen, against 68.2% from the audio alone." />
            <Stat value="86.3" suffix="%" label="Drawn notes read correctly" note="By the frame reader, before matching to the audio." delay="1" />
            <Stat value="76" suffix="%" label="Hardest clip, fixed" note="A jazz clip where audio alone put 0% of notes on the right string." delay="2" />
          </div>
          <div className="wrap--narrow" style={{ marginTop: 'clamp(64px, 11vh, 120px)' }}>
            <table className="dtable dtable--3" data-reveal>
              <thead><tr><th>Metric</th><th>Audio only</th><th>Tabs on screen</th></tr></thead>
              <tbody>
                {TAB_VIDEO.map((r) => (
                  <tr key={r.metric}>
                    <td>{r.metric}<small>{r.sub}</small></td>
                    <td><strong>{r.audio}</strong></td>
                    <td>{r.strong ? <strong className="hl">{r.video}</strong> : <strong>{r.video}</strong>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="body" style={{ marginTop: '1.4rem', color: 'var(--ink-mute)' }}>
              The video fixes <em>where</em> notes are played, not <em>which</em> notes are found — so note F1 stays put
              while string and fret accuracy jumps.
            </p>
          </div>
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
          <h2 className="h2 mb-xl" data-reveal>Run it yourself</h2>
          <pre className="code" data-reveal>
            <span className="p">$ </span>cd backend{'\n'}
            <span className="p">$ </span>mkdir -p .benchmark_cache/guitarset && cd .benchmark_cache/guitarset{'\n'}
            <span className="p">$ </span>curl -L -o annotation.zip     https://zenodo.org/api/records/3371780/files/annotation.zip/content{'\n'}
            <span className="p">$ </span>curl -L -o audio_mono-mic.zip https://zenodo.org/api/records/3371780/files/audio_mono-mic.zip/content{'\n'}
            <span className="p">$ </span>unzip -q annotation.zip -d annotation && unzip -q audio_mono-mic.zip -d audio_mono-mic{'\n'}
            <span className="p">$ </span>cd ../.. && .venv/bin/python benchmark_guitarset.py   <span className="c"># outputs are cached</span>{'\n'}
            <span className="p">$ </span>.venv/bin/python benchmark_verify.py test           <span className="c"># tab check</span>{'\n'}
            <span className="p">$ </span>.venv/bin/python benchmark_tabvideo.py --clips 12   <span className="c"># tabs on screen</span>
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
