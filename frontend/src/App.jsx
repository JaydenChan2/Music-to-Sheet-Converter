import React, { useState, useRef, useEffect, useMemo } from 'react';
import UploadSection from './components/UploadSection';
import TabViewer from './components/TabViewer';
import PlaybackControls from './components/PlaybackControls';
import SynthPanel from './components/SynthPanel';
import { TabSynth } from './synth';
import { Music4 } from 'lucide-react';
import { createJobFromFile, createJobFromUrl, getHealth, waitForJob } from './api';

const STAGE_LABELS = {
  queued: 'Waiting in queue...',
  downloading: 'Downloading audio from link...',
  decoding: 'Decoding audio...',
  separating: 'Isolating the guitar from the mix...',
  transcribing: 'Detecting notes and chords...',
  arranging: 'Finding the beat and choosing fingerings...',
  rendering: 'Writing tab and MIDI...',
};

const DEFAULT_OPTIONS = { separate: true, tuning: 'standard', capo: 0, customTuning: '' };
const OPTIONS_KEY = 'guitar-options';

const DEFAULT_PLAYBACK = { mode: 'original', tone: 'acoustic', speed: 1, metronome: false, volume: 0.8 };
const PLAYBACK_KEY = 'playback-settings';

function loadSaved(key, defaults) {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') };
  } catch {
    return defaults;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode) - settings just won't persist
  }
}

function App() {
  const [title, setTitle] = useState(null);
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState(() => loadSaved(OPTIONS_KEY, DEFAULT_OPTIONS));
  const [tunings, setTunings] = useState([{ id: 'standard', name: 'Standard', notes: 'E A D G B E' }]);
  const [maxCapo, setMaxCapo] = useState(12);
  const [separationAvailable, setSeparationAvailable] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playback, setPlayback] = useState(() => loadSaved(PLAYBACK_KEY, DEFAULT_PLAYBACK));
  const [loopBar, setLoopBar] = useState(null);
  const audioRef = useRef(null);
  const synth = useMemo(() => new TabSynth(), []);

  const isProcessing = job !== null && job.status === 'running';
  const isSynth = playback.mode === 'synth';
  const duration = isSynth ? result?.duration || 0 : audioDuration;
  const loop = loopBar !== null && result ? result.measures[loopBar] : null;

  useEffect(() => {
    getHealth()
      .then((h) => {
        setSeparationAvailable(h.separation_available);
        if (h.tunings) setTunings(h.tunings);
        if (h.max_capo) setMaxCapo(h.max_capo);
      })
      .catch(() => setError("Can't reach the backend. Start it with: cd backend && .venv/bin/python app.py"));
    return () => synth.stop();
  }, [synth]);

  const handleOptionChange = (key, value) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: value };
      save(OPTIONS_KEY, next);
      return next;
    });
  };

  // Push playback settings into both players.
  useEffect(() => {
    synth.setTone(playback.tone);
    synth.setSpeed(playback.speed);
    synth.setMetronome(playback.metronome);
    synth.setVolume(playback.volume);
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = playback.speed;
      audio.preservesPitch = true;
      audio.volume = playback.volume;
    }
  }, [synth, playback]);

  useEffect(() => {
    synth.setLoop(loop ? { start: Math.max(0, loop.start), end: loop.end } : null);
  }, [synth, loop]);

  const position = () => (isSynth ? synth.currentTime() : audioRef.current?.currentTime || 0);

  // Keep the playhead smooth, and loop the original audio (the synth loops itself).
  useEffect(() => {
    if (!isPlaying) return;
    let raf;
    const tick = () => {
      let t = isSynth ? synth.currentTime() : audioRef.current?.currentTime || 0;
      if (!isSynth && loop && audioRef.current && t >= loop.end) {
        audioRef.current.currentTime = t = Math.max(0, loop.start);
      }
      setCurrentTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, isSynth, synth, loop]);

  const resetPlayback = () => {
    synth.stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioDuration(0);
    setLoopBar(null);
  };

  const startJob = async (label, create) => {
    resetPlayback();
    setTitle(label);
    setResult(null);
    setError(null);
    setJob({ status: 'running', stage: 'queued', progress: 0 });
    try {
      const created = await create();
      const finished = await waitForJob(created.id, (j) => {
        setJob(j);
        if (j.title) setTitle(j.title);
      });
      synth.load(finished.result);
      synth.onEnd = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };
      setResult(finished.result);
      if (audioRef.current) {
        audioRef.current.src = finished.result.files.original;
        audioRef.current.load();
      }
      setJob(finished);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setJob(null);
      setTitle(null);
    }
  };

  const handleFileSelected = (file) => startJob(file.name, () => createJobFromFile(file, options));
  const handleUrlSubmitted = (url) => startJob(url, () => createJobFromUrl(url, options));

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioDuration(audio.duration);
    audio.playbackRate = playback.speed; // reset by load()
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const startPlaying = (mode = playback.mode) => {
    if (mode === 'synth') {
      synth.play();
      setIsPlaying(true);
    } else if (audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((err) => {
        if (err.name !== 'AbortError') console.error("Playback error:", err);
      });
    }
  };

  const stopPlaying = () => {
    synth.pause();
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const handlePlayPause = () => (isPlaying ? stopPlaying() : startPlaying());

  const seekTo = (seconds, mode = playback.mode) => {
    const t = Math.max(0, Math.min(duration || seconds, seconds));
    if (mode === 'synth') synth.seek(t);
    else if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const handleSeek = (fraction) => duration && seekTo(fraction * duration);
  const handleSkipBack = () => seekTo(position() - 5);
  const handleSkipForward = () => seekTo(position() + 5);

  const handleUploadNew = () => {
    resetPlayback();
    setJob(null);
    setResult(null);
    setTitle(null);
    setError(null);
  };

  const handlePlaybackChange = (key, value) => {
    if (key === 'mode' && value !== playback.mode) {
      // Keep the same position so you can A/B the transcription against the original.
      const wasPlaying = isPlaying;
      const t = position();
      stopPlaying();
      seekTo(t, value);
      if (wasPlaying) startPlaying(value);
    }
    setPlayback((prev) => {
      const next = { ...prev, [key]: value };
      save(PLAYBACK_KEY, next);
      return next;
    });
  };

  const handleToggleLoop = () => {
    if (loopBar !== null) {
      setLoopBar(null);
      return;
    }
    const index = result.measures.findIndex((m) => currentTime >= m.start && currentTime < m.end);
    setLoopBar(Math.max(0, index));
  };

  const handleNoteClick = (visualString, fret) => {
    const string = 5 - visualString;
    const open = result.tuning?.open_strings || [40, 45, 50, 55, 59, 64];
    synth.audition(open[string] + fret, string);
  };

  const currentBar = result ? result.measures.findIndex((m) => currentTime >= m.start && currentTime < m.end) : -1;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-white/10">

      {/* Subtle Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-white/[0.02] rounded-full blur-[120px]" />
      </div>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
        preload="auto"
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-20 flex flex-col min-h-screen">

        {/* Header */}
        <header className="mb-16 text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Music4 size={28} strokeWidth={1.5} className="text-zinc-100" />
            <span className="text-sm font-medium tracking-widest text-zinc-500 uppercase">Guitar Tab AI</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-semibold tracking-tighter text-white text-balance">
            Audio to Tablature.
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto font-light leading-relaxed text-balance">
            Polyphonic guitar transcription with neural pitch detection and source separation.
            <span className="block mt-2 text-zinc-500">Upload an audio file or paste a link to a song.</span>
          </p>
        </header>

        <main className="flex-grow w-full max-w-4xl mx-auto">
          {!job && (
            <UploadSection
              onFileSelected={handleFileSelected}
              onUrlSubmitted={handleUrlSubmitted}
              options={options}
              onOptionChange={handleOptionChange}
              tunings={tunings}
              maxCapo={maxCapo}
              separationAvailable={separationAvailable}
              error={error}
            />
          )}

          {/* Processing Status */}
          {isProcessing && (
            <div className="text-center py-24 space-y-6 animate-in fade-in duration-700">
              <div className="relative w-12 h-12 mx-auto">
                <div className="absolute inset-0 border-2 border-zinc-800 rounded-full"></div>
                <div className="absolute inset-0 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="space-y-3">
                <p className="text-zinc-200 font-medium tracking-tight truncate max-w-md mx-auto">{title}</p>
                <p className="text-zinc-500 text-sm">{STAGE_LABELS[job.stage] || 'Processing...'}</p>
                <div className="w-64 h-1 mx-auto bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-300 transition-all duration-500" style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} />
                </div>
                {job.stage === 'separating' && (
                  <p className="text-zinc-600 text-xs">This is the slowest step: roughly 10-60s per song.</p>
                )}
              </div>
            </div>
          )}

          {/* Results View */}
          {result && (
            <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-28">
              {/* File Info Bar */}
              <div className="flex items-center justify-between gap-4 py-4 border-b border-zinc-800/50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-2 h-2 shrink-0 rounded-full bg-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-zinc-300 font-medium truncate">{title}</span>
                </div>

                <button
                  onClick={handleUploadNew}
                  className="text-xs font-medium text-zinc-500 hover:text-white transition-colors uppercase tracking-wider shrink-0"
                >
                  New Song
                </button>
              </div>

              <SynthPanel
                settings={playback}
                onChange={handlePlaybackChange}
                loopBar={loopBar}
                onToggleLoop={handleToggleLoop}
                currentBar={currentBar}
              />

              <TabViewer
                result={result}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onSeek={(t) => seekTo(t)}
                onNoteClick={handleNoteClick}
              />

              <PlaybackControls
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                progress={currentTime}
                duration={duration}
                onSeek={handleSeek}
                onSkipBack={handleSkipBack}
                onSkipForward={handleSkipForward}
              />
            </div>
          )}
        </main>

        <footer className="mt-24 text-center py-8 border-t border-zinc-900/50">
          <p className="text-zinc-600 text-xs tracking-wider">
            © {new Date().getFullYear()} GUITAR TAB AI
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
