import React, { useEffect, useRef } from 'react';
import UploadSection from '../components/UploadSection';
import TabViewer from '../components/TabViewer';
import PlaybackControls from '../components/PlaybackControls';
import SynthPanel from '../components/SynthPanel';
import LessonPanel from '../components/LessonPanel';
import { STAGES, useStudio } from '../studio/studio';

function Status() {
  const { backendUp, isProcessing, result } = useStudio();
  if (isProcessing) return <span className="status status--busy"><i />Transcribing</span>;
  if (result) return <span className="status status--up"><i />Tab ready</span>;
  if (backendUp === null) return <span className="status"><i />Connecting</span>;
  return backendUp
    ? <span className="status status--up"><i />Backend online</span>
    : <span className="status status--down"><i />Backend offline</span>;
}

function Processing() {
  const { job, title } = useStudio();
  const stages = STAGES.filter((s) => s.id !== 'queued' && (!s.tutorialOnly || job.video_type === 'tutorial') && (s.id !== 'downloading' || job.from_link));
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

function Results() {
  const s = useStudio();
  return (
    <div>
      <div className="res__bar">
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow" style={{ margin: 0 }}>Transcription</p>
          <h2 className="res__title">{s.title}</h2>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={s.reset}>New song</button>
      </div>

      <LessonPanel lesson={s.result.lesson} onSeek={(t) => s.seekTo(t)} />

      <TabViewer
        result={s.result}
        currentTime={s.currentTime}
        isPlaying={s.isPlaying}
        loopBar={s.loopBar}
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
          {!s.job && (
            <UploadSection
              onFileSelected={s.transcribeFile}
              onUrlSubmitted={s.transcribeUrl}
              options={s.options}
              onOptionChange={s.setOption}
              tunings={s.tunings}
              maxCapo={s.maxCapo}
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
