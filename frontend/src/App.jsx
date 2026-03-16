import React, { useState, useRef, useEffect } from 'react';
import UploadSection from './components/UploadSection';
import TabViewer from './components/TabViewer';
import PlaybackControls from './components/PlaybackControls';
import { Music4 } from 'lucide-react';

function App() {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tabs, setTabs] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);

  // Clean up object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const handleFileSelected = (selectedFile) => {
    console.log("File selected:", selectedFile);

    // Revoke previous URL
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }

    // Create new audio URL
    const url = URL.createObjectURL(selectedFile);
    audioUrlRef.current = url;

    setFile(selectedFile);
    setTabs(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    // Set audio source
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
    }

    uploadFile(selectedFile);
  };

  const uploadFile = async (file) => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:5000/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      console.log("Upload success:", data);

      if (data.filename) {
        await processFile(data.filename);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setIsProcessing(false);
    }
  };

  const processFile = async (filename) => {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename }),
      });
      const data = await response.json();
      if (data.error) {
        console.error("Processing error:", data.error);
        return;
      }
      console.log("Processing success:", data);
      setTabs(data.tabs);
    } catch (error) {
      console.error("Processing request failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Audio event handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Playback controls
  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Playback error:", err);
      });
    }
  };

  const handleSeek = (fraction) => {
    if (!audioRef.current || !duration) return;
    audioRef.current.currentTime = fraction * duration;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleSkipBack = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleSkipForward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 5);
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleUploadNew = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setFile(null);
    setTabs(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
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
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
        preload="metadata"
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-20 flex flex-col min-h-screen">

        {/* Header */}
        <header className="mb-20 text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Music4 size={28} strokeWidth={1.5} className="text-zinc-100" />
            <span className="text-sm font-medium tracking-widest text-zinc-500 uppercase">Guitar Tab AI</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-semibold tracking-tighter text-white text-balance">
            Audio to Tablature.
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto font-light leading-relaxed text-balance">
            Instant, accurate guitar transcription powered by advanced signal processing.
            <span className="block mt-2 text-zinc-500">upload an audio file to get started.</span>
          </p>
        </header>

        <main className="flex-grow w-full max-w-4xl mx-auto">
          {!file && !isProcessing && (
            <UploadSection onFileSelected={handleFileSelected} />
          )}

          {/* Processing Status */}
          {isProcessing && (
            <div className="text-center py-32 space-y-6 animate-in fade-in duration-700">
              <div className="relative w-12 h-12 mx-auto">
                <div className="absolute inset-0 border-2 border-zinc-800 rounded-full"></div>
                <div className="absolute inset-0 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="space-y-1">
                <p className="text-zinc-200 font-medium tracking-tight">Processing Audio</p>
                <p className="text-zinc-500 text-sm">analyzing frequencies...</p>
              </div>
            </div>
          )}

          {/* Results View */}
          {!isProcessing && file && (
            <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-28">
              {/* File Info Bar */}
              <div className="flex items-center justify-between py-4 border-b border-zinc-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-zinc-300 font-medium">{file.name}</span>
                </div>
                <button
                  onClick={handleUploadNew}
                  className="text-xs font-medium text-zinc-500 hover:text-white transition-colors uppercase tracking-wider"
                >
                  Upload New
                </button>
              </div>

              {/* Tab Viewer */}
              <TabViewer tabs={tabs} />

              {/* Playback Controls */}
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
