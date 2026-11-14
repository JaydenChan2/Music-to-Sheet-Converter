import React, { useEffect, useRef, useState } from 'react';
import { getExamples } from '../api';
import UploadSection from '../components/UploadSection';
import TabViewer from '../components/TabViewer';
import PlaybackControls from '../components/PlaybackControls';
import SynthPanel from '../components/SynthPanel';
import LessonPanel from '../components/LessonPanel';
import CheckPanel from '../components/CheckPanel';
import VideoTabPanel, { TitleNotice } from '../components/VideoTabPanel';
import { STAGES, useStudio } from '../studio/studio';

function Status() {
  const { backendUp, isProcessing, result } = useStudio();
  if (isProcessing) return <span className="status status--busy"><i />Transcribing</span>;
  if (result) return <span className="status status--up"><i />Tab ready</span>;
  if (backendUp === null) return <span className="status"><i />Connecting</span>;
  if (backendUp === 'waking') return <span className="status status--busy"><i />Waking up the server</span>;
  return backendUp
    ? <span className="status status--up"><i />Backend online</span>
    : <span className="status status--down"><i />Backend offline</span>;
}

const MODE_LABEL = { song: 'Song', tutorial: 'Tutorial', tab: 'Tabs on screen' };

function Examples() {
  const s = useStudio();
  const [data, setData] = useState(null);
  useEffect(() => {
    getExamples().then(setData).catch(() => setData({ examples: [] }));
  }, []);
  if (!data?.examples?.length) return null;
  return (
    <div className="examples">
      <div className="examples__head">
        <p className="setup__label"><b>00</b> Try an example</p>
        <p className="setup__hint">Already transcribed, so they open instantly — one for each mode.</p>
      </div>
      <div className="examples__grid">
        {data.examples.map((ex) => (
          <button key={ex.id} className="examples__card" onClick={() => s.loadExample(ex)}>
            <span className="examples__mode">{MODE_LABEL[ex.mode] || ex.mode}</span>
            <span className="examples__title">{ex.title}</span>
            <span className="examples__blurb">{ex.blurb}</span>
            <span className="examples__meta">{ex.notes} notes · tab check {Math.round(ex.check * 100)}%</span>
          </button>
        ))}
      </div>
      <p className="examples__credit">{data.credit}</p>
    </div>
  );
}

function Processing() {
  const { job, title } = useStudio();
  const stages = STAGES.filter((s) => s.id !== 'queued' && (!s.tutorialOnly || job.video_type === 'tutorial') && (!s.tabOnly || job.video_type === 'tab') && (s.id !== 'downloading' || job.from_link));
  const nowIdx = stages.findIndex((s) => s.id === job.stage);
  const now = STAGES.find((s) => s.id === job.stage);
  return (
    <div className="proc" aria-live="polite">
      <p className="eyebrow">Now transcribing</p>
      <h2 className="proc__title" title={title}>{title}</h2>
      <p className="proc__detail">{now ? `${now.detail}…` : 'Processing…'}</p>
      <div className="meter"><i style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} /></div>
      <ol className="stages">
        {stages.map((s, i) => (
          <li key={s.id} className={`stage${i < nowIdx ? ' is-done' : ''}${i === nowIdx ? ' is-now' : ''}`}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            <strong>{s.label}</strong>
          </li>
        ))}
      </ol>
      {job.stage === 'separating' && <p className="proc__note">This is the slowest step: roughly 10–60 s per song.</p>}
      <p className="proc__note">You can browse the rest of the site — the job keeps running.</p>
    </div>
  );
}

const fmtClock = (sec) => {
  const t = Math.round(sec);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), r = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

function ClipNotice({ clip }) {
  if (!clip || !(clip.is_part || clip.truncated)) return null;
  const span = `${fmtClock(clip.start)}–${fmtClock(clip.end)}`;
  const total = clip.source_duration ? ` of ${fmtClock(clip.source_duration)}` : '';
  return clip.truncated ? (
    <div className="alert alert--warn" role="status">
      <span>
        This recording{total ? ` is ${fmtClock(clip.source_duration)} long, so` : ' is long, so'} only {span} was
        transcribed. Set a start and end time to pick a different part.
      </span>
    </div>
  ) : (
    <p className="clip-note">Transcribed <strong>{span}</strong>{total}. Times below are counted from {fmtClock(clip.start)}.</p>
  );
}

function Results() {
  const s = useStudio();
  const [showUnsure, setShowUnsure] = useState(true);
  const [showRemoved, setShowRemoved] = useState(false);
  const check = s.result.verification;
  return (
    <div>
      <div className="res__bar">
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow" style={{ margin: 0 }}>Transcription</p>
          <h2 className="res__title">{s.title}</h2>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={s.reset}>New song</button>
      </div>

      <ClipNotice clip={s.result.clip} />
      <TitleNotice fromTitle={s.result.from_title} />

      <VideoTabPanel info={s.result.video_tab} frameUrl={s.result.files.tab_frame} />

      <CheckPanel
        check={check}
        showUnsure={showUnsure}
        onToggleUnsure={setShowUnsure}
        showRemoved={showRemoved}
        onToggleRemoved={setShowRemoved}
        onSeekBar={(b) => s.seekTo(Math.max(0, b.start))}
      />

      <LessonPanel lesson={s.result.lesson} clip={s.result.clip} duration={s.result.duration} onSeek={(t) => s.seekTo(t)} />

      <TabViewer
        result={s.result}
        currentTime={s.currentTime}
        isPlaying={s.isPlaying}
        loopBar={s.loopBar}
        check={showUnsure ? check : null}
        removedNotes={showRemoved ? check?.removed_notes : null}
        onSeek={(t) => s.seekTo(t)}
        onNoteClick={s.auditionNote}
      >
        <SynthPanel
          settings={s.playback}
          onChange={s.setPlaybackOption}
          loopBar={s.loopBar}
          onToggleLoop={s.toggleLoop}
          currentBar={s.currentBar}
        />
      </TabViewer>

      <PlaybackControls
        isPlaying={s.isPlaying}
        onPlayPause={s.togglePlay}
        progress={s.currentTime}
        duration={s.duration}
        onSeek={s.seekFraction}
        onSkipBack={() => s.skip(-5)}
        onSkipForward={() => s.skip(5)}
      />
    </div>
  );
}

export default function Studio() {
  const s = useStudio();

  // Leaving the studio pauses playback; the loaded tab stays for when you come back.
  const stopRef = useRef(s.stopPlaying);
  useEffect(() => { stopRef.current = s.stopPlaying; });
  useEffect(() => () => stopRef.current(), []);

  return (
    <>
      <section className="studio-head">
        <div className="wrap studio-head__row">
          <div>
            <p className="eyebrow" data-reveal>Studio</p>
            <h1 className="display" data-reveal data-reveal-delay="1">Transcribe</h1>
          </div>
          <Status />
        </div>
      </section>

      <section className="studio">
        <div className="wrap">
          {!s.job && <Examples />}
          {!s.job && (
            <UploadSection
              onFileSelected={s.transcribeFile}
              onUrlSubmitted={s.transcribeUrl}
              options={s.options}
              onOptionChange={s.setOption}
              tunings={s.tunings}
              maxCapo={s.maxCapo}
              maxDuration={s.maxDuration}
              separationAvailable={s.separationAvailable}
              speechAvailable={s.speechAvailable}
              error={s.error}
            />
          )}
          {s.isProcessing && <Processing />}
          {s.result && <Results />}
        </div>
      </section>
    </>
  );
}
