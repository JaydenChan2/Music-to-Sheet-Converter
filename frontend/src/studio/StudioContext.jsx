// All transcription + playback state lives here, above the router, so a job
// keeps running (and its result stays loaded) while you browse other pages.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StudioContext } from './studio';
import { TabSynth } from '../synth';
import { createJobFromFile, createJobFromUrl, getHealth, waitForJob } from '../api';


const DEFAULT_OPTIONS = { videoType: 'song', separate: true, tuning: 'standard', capo: 0, customTuning: '' };
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

export function StudioProvider({ children }) {
  const [title, setTitle] = useState(null);
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState(() => loadSaved(OPTIONS_KEY, DEFAULT_OPTIONS));
  const [tunings, setTunings] = useState([{ id: 'standard', name: 'Standard', notes: 'E A D G B E' }]);
  const [maxCapo, setMaxCapo] = useState(12);
  const [maxDuration, setMaxDuration] = useState(720);
  const [separationAvailable, setSeparationAvailable] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [backendUp, setBackendUp] = useState(null);
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
        setBackendUp(true);
        setSeparationAvailable(h.separation_available);
        setSpeechAvailable(!!h.speech_available);
        if (h.tunings) setTunings(h.tunings);
        if (h.max_capo) setMaxCapo(h.max_capo);
        if (h.max_duration) setMaxDuration(h.max_duration);
      })
      .catch(() => {
        setBackendUp(false);
        setError("Can't reach the backend. Start it with: cd backend && .venv/bin/python app.py");
      });
    return () => synth.stop();
  }, [synth]);

  const setOption = (key, value) => {
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

  const startJob = async (label, create, fromLink) => {
    resetPlayback();
    setTitle(label);
    setResult(null);
    setError(null);
    setJob({ status: 'running', stage: 'queued', progress: 0, video_type: options.videoType, from_link: fromLink });
    try {
      const created = await create();
      const finished = await waitForJob(created.id, (j) => {
        setJob({ ...j, from_link: fromLink });
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

  const rangeLabel = (r) => (r?.start || r?.end ? ` (${r.start || '0:00'}–${r.end || 'end'})` : '');
  const transcribeFile = (file, range) =>
    startJob(file.name + rangeLabel(range), () => createJobFromFile(file, { ...options, ...range }), false);
  const transcribeUrl = (url, range) =>
    startJob(url + rangeLabel(range), () => createJobFromUrl(url, { ...options, ...range }), true);

  const startPlaying = (mode = playback.mode) => {
    if (mode === 'synth') {
      synth.play();
      setIsPlaying(true);
    } else if (audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((err) => {
        if (err.name !== 'AbortError') console.error('Playback error:', err);
      });
    }
  };

  const stopPlaying = () => {
    synth.pause();
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const seekTo = (seconds, mode = playback.mode) => {
    const t = Math.max(0, Math.min(duration || seconds, seconds));
    if (mode === 'synth') synth.seek(t);
    else if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const reset = () => {
    resetPlayback();
    setJob(null);
    setResult(null);
    setTitle(null);
    setError(null);
  };

  const setPlaybackOption = (key, value) => {
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

  const toggleLoop = () => {
    if (loopBar !== null) {
      setLoopBar(null);
      return;
    }
    const index = result.measures.findIndex((m) => currentTime >= m.start && currentTime < m.end);
    setLoopBar(Math.max(0, index));
  };

  const auditionNote = (visualString, fret) => {
    const string = 5 - visualString;
    const open = result.tuning?.open_strings || [40, 45, 50, 55, 59, 64];
    synth.audition(open[string] + fret, string);
  };

  const currentBar = result ? result.measures.findIndex((m) => currentTime >= m.start && currentTime < m.end) : -1;

  const value = {
    // job
    title, job, result, error, setError, isProcessing, transcribeFile, transcribeUrl, reset,
    // setup
    options, setOption, tunings, maxCapo, maxDuration, separationAvailable, speechAvailable, backendUp,
    // playback
    playback, setPlaybackOption, isPlaying, currentTime, duration, loopBar, currentBar,
    togglePlay: () => (isPlaying ? stopPlaying() : startPlaying()),
    stopPlaying,
    seekTo,
    seekFraction: (f) => duration && seekTo(f * duration),
    skip: (s) => seekTo(position() + s),
    toggleLoop,
    auditionNote,
  };

  return (
    <StudioContext.Provider value={value}>
      <audio
        ref={audioRef}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (!audio) return;
          setAudioDuration(audio.duration);
          audio.playbackRate = playback.speed; // reset by load()
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        preload="auto"
      />
      {children}
    </StudioContext.Provider>
  );
}
