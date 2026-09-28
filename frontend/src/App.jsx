import React, { useState, useRef, useEffect } from 'react';
import UploadSection from './components/UploadSection';
import TabViewer from './components/TabViewer';
import PlaybackControls from './components/PlaybackControls';
import { Music4 } from 'lucide-react';
import { createJobFromFile, createJobFromUrl, getHealth, waitForJob } from './api';

const STAGE_LABELS = {
  queued: 'Waiting in queue...',
  downloading: 'Downloading audio from link...',
  decoding: 'Decoding audio...',
  separating: 'Isolating the guitar from the mix...',
  transcribing: 'Detecting notes and chords...',
  arranging: 'Finding the beat and choosing fingerings...',
  rendering: 'Writing tab, MIDI and preview...',
};

function App() {
  const [title, setTitle] = useState(null);
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [separate, setSeparate] = useState(true);
  const [separationAvailable, setSeparationAvailable] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackMode, setPlaybackMode] = useState('original');
  const audioRef = useRef(null);

  const isProcessing = job !== null && job.status === 'running';

  useEffect(() => {
    getHealth()
      .then((h) => setSeparationAvailable(h.separation_available))
      .catch(() => setError("Can't reach the backend. Start it with: cd backend && .venv/bin/python app.py"));
  }, []);

  // Keep the playhead smooth: timeupdate only fires ~4x per second.
  useEffect(() => {
    if (!isPlaying) return;
    let raf;
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const resetPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPlaybackMode('original');
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

  const handleFileSelected = (file) => startJob(file.name, () => createJobFromFile(file, separate));
  const handleUrlSubmitted = (url) => startJob(url, () => createJobFromUrl(url, separate));

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((err) => {
        console.error("Playback error:", err);
      });
    }
  };

  const seekTo = (seconds) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(duration || seconds, seconds));
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleSeek = (fraction) => duration && seekTo(fraction * duration);
  const handleSkipBack = () => audioRef.current && seekTo(audioRef.current.currentTime - 5);
  const handleSkipForward = () => audioRef.current && seekTo(audioRef.current.currentTime + 5);

  const handleUploadNew = () => {
    resetPlayback();
    setJob(null);
    setResult(null);
    setTitle(null);
    setError(null);
  };

  const handleModeSwitch = (mode) => {
    if (mode === playbackMode || !audioRef.current || !result) return;
    const audio = audioRef.current;
    const wasPlaying = isPlaying;
    const position = audio.currentTime;
    audio.pause();
    setIsPlaying(false);
    setPlaybackMode(mode);

    // Keep the same position so you can A/B the transcription against the original.
    audio.src = mode === 'original' ? result.files.original : result.files.synth;
    audio.load();
    audio.addEventListener('loadedmetadata', () => {
      audio.currentTime = Math.min(position, audio.duration || position);
      if (wasPlaying) {
        audio.play().then(() => setIsPlaying(true)).catch((err) => {
          if (err.name !== 'AbortError') console.error("Playback error after switch:", err);
        });
      }
    }, { once: true });
  };

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
              separate={separate}
              onSeparateChange={setSeparate}
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

                <div className="flex items-center bg-zinc-900/40 rounded-lg p-1 border border-zinc-800/50 shrink-0">
                  <button
                    onClick={() => handleModeSwitch('original')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${playbackMode === 'original' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Original
                  </button>
                  <button
                    onClick={() => handleModeSwitch('simulation')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${playbackMode === 'simulation' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Tab Preview
                  </button>
                </div>

                <button
                  onClick={handleUploadNew}
                  className="text-xs font-medium text-zinc-500 hover:text-white transition-colors uppercase tracking-wider shrink-0"
                >
                  New Song
                </button>
              </div>

              <TabViewer result={result} currentTime={currentTime} isPlaying={isPlaying} onSeek={seekTo} />

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
