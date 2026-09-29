// In-browser guitar synthesizer that plays a transcribed tab.
//
// Each note is a Karplus-Strong plucked string (a burst of noise circulating
// in a short delay line that loses energy each pass, which sounds remarkably
// like a real string). Playback uses a look-ahead scheduler so speed changes,
// seeking and bar looping stay sample-accurate.

export const TONES = {
  acoustic: { label: 'Acoustic (steel)', brightness: 0.65, sustain: 3.2, pick: 0.13, cutoff: 7500, body: true },
  nylon: { label: 'Classical (nylon)', brightness: 0.35, sustain: 2.6, pick: 0.22, cutoff: 3500, body: true },
  electric: { label: 'Electric (clean)', brightness: 0.5, sustain: 4.5, pick: 0.1, cutoff: 5000 },
  overdrive: { label: 'Electric (overdrive)', brightness: 0.55, sustain: 5.0, pick: 0.1, cutoff: 3800, drive: 14 },
};

const STANDARD = [40, 45, 50, 55, 59, 64];
const LOOKAHEAD_S = 0.15; // how far ahead notes are scheduled
const TICK_MS = 25;
const STRUM_S = 0.009; // gap between strings when a chord is strummed
const GLIDE_S = 0.08; // duration of a slide
const MAX_RING_S = 6;

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

function firstIndexAtOrAfter(items, t) {
  let lo = 0, hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].time < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function driveCurve(amount) {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

// Render one plucked note into an AudioBuffer. Returns { buffer, rate } where
// rate is the playbackRate that corrects the delay line's integer-length tuning.
function renderPluck(ctx, midi, tone) {
  const sr = ctx.sampleRate;
  const freq = midiToHz(midi);
  // Each pass averages a sample with the *next* one, so the loop is period - 0.5 samples long.
  const period = Math.max(2, Math.floor(sr / freq + 0.5));
  const actualFreq = sr / (period - 0.5);
  const t60 = tone.sustain * Math.pow(110 / freq, 0.35); // low strings ring longer
  const length = Math.ceil(sr * Math.min(t60, MAX_RING_S));
  const lossPerPeriod = Math.pow(0.001, 1 / (t60 * actualFreq));

  // Excitation: low-passed noise (brightness), then a comb filter for where the string is picked.
  const noise = new Float32Array(period);
  let lp = 0;
  for (let i = 0; i < period; i++) {
    lp += tone.brightness * (Math.random() * 2 - 1 - lp);
    noise[i] = lp;
  }
  const pickDelay = Math.max(1, Math.round(period * tone.pick));
  const line = new Float32Array(period);
  let mean = 0;
  for (let i = 0; i < period; i++) {
    line[i] = noise[i] - noise[(i - pickDelay + period) % period];
    mean += line[i] / period;
  }
  let peak = 1e-6;
  for (let i = 0; i < period; i++) {
    line[i] -= mean;
    peak = Math.max(peak, Math.abs(line[i]));
  }

  const buffer = ctx.createBuffer(1, length, sr);
  const out = buffer.getChannelData(0);
  let idx = 0;
  for (let i = 0; i < length; i++) {
    const next = idx + 1 === period ? 0 : idx + 1;
    const v = line[idx];
    out[i] = v / peak;
    line[idx] = lossPerPeriod * 0.5 * (v + line[next]);
    idx = next;
  }
  return { buffer, rate: freq / actualFreq };
}

export class TabSynth {
  constructor() {
    this.ctx = null;
    this.tone = 'acoustic';
    this.speed = 1;
    this.volume = 0.8;
    this.metronome = false;
    this.loop = null; // { start, end } in song seconds
    this.playing = false;
    this.position = 0;
    this.notes = [];
    this.beats = [];
    this.end = 0;
    this.cache = new Map();
    this.voices = new Set();
    this.stringVoices = [];
    this.onEnd = null;
  }

  // ---- setup ---------------------------------------------------------------

  load(result) {
    this.stop();
    this.position = 0;
    const open = result.tuning?.open_strings || STANDARD;
    const lastPitch = [];
    const notes = [];
    for (const tab of result.tabs) {
      // Strum low string -> high string
      const entries = Object.entries(tab.notes)
        .map(([visual, fret]) => ({ visual, string: 5 - Number(visual), fret }))
        .sort((a, b) => a.string - b.string);
      const strum = entries.length >= 3;
      entries.forEach(({ visual, string, fret }, k) => {
        const midi = open[string] + fret;
        notes.push({
          time: tab.time + (strum ? k * STRUM_S : 0),
          duration: Math.max(tab.duration, 0.12),
          string,
          midi,
          slideFrom: tab.slides?.[visual] && lastPitch[string] !== undefined ? lastPitch[string] : null,
          velocity: tab.velocities?.[visual] ?? 0.7,
        });
        lastPitch[string] = midi;
      });
    }
    notes.sort((a, b) => a.time - b.time);
    this.notes = notes;

    const beats = [];
    for (const m of result.measures) {
      for (let k = 0; k < 4; k++) {
        const time = m.start + (k * (m.end - m.start)) / 4;
        if (time >= 0) beats.push({ time, accent: k === 0 });
      }
    }
    this.beats = beats;
    const lastNote = notes.reduce((t, n) => Math.max(t, n.time + n.duration), 0);
    this.end = Math.max(lastNote + 0.8, result.duration || 0);
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(this.ctx.destination);
      this.buildToneChain();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  buildToneChain() {
    // Voices already playing keep their old chain; new notes use the new one.
    const ctx = this.ctx;
    const tone = TONES[this.tone];
    const input = ctx.createGain();
    let node = input;
    if (tone.drive) {
      const pre = ctx.createGain();
      pre.gain.value = tone.drive;
      const shaper = ctx.createWaveShaper();
      shaper.curve = driveCurve(2.5);
      shaper.oversample = '4x';
      const post = ctx.createGain();
      post.gain.value = 0.35;
      node.connect(pre).connect(shaper).connect(post);
      node = post;
    }
    if (tone.body) {
      // A little low-mid warmth, like a guitar body resonance.
      const body = ctx.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 180;
      body.Q.value = 1.1;
      body.gain.value = 5;
      node.connect(body);
      node = body;
    }
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = tone.cutoff;
    node.connect(filter).connect(this.master);
    this.input = input;
  }

  pluck(midi) {
    const key = `${this.tone}:${midi}`;
    if (!this.cache.has(key)) this.cache.set(key, renderPluck(this.ctx, midi, TONES[this.tone]));
    return this.cache.get(key);
  }

  // ---- settings ------------------------------------------------------------

  setTone(tone) {
    if (!TONES[tone] || tone === this.tone) return;
    this.tone = tone;
    if (this.ctx) this.buildToneChain();
  }

  setVolume(volume) {
    this.volume = volume;
    if (this.master) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  setSpeed(speed) {
    if (this.playing) {
      this.anchorSong = this.currentTime();
      this.anchorCtx = this.ctx.currentTime;
    }
    this.speed = speed;
  }

  setMetronome(on) {
    this.metronome = on;
  }

  setLoop(loop) {
    this.loop = loop;
    if (loop && this.playing) {
      const t = this.currentTime();
      if (t < loop.start || t >= loop.end) this.seek(loop.start);
    }
  }

  // ---- transport -----------------------------------------------------------

  currentTime() {
    if (!this.playing) return this.position;
    return Math.max(0, this.anchorSong + (this.ctx.currentTime - this.anchorCtx) * this.speed);
  }

  play(from = this.position) {
    this.ensureContext();
    if (this.playing) return;
    // Render every pitch up front so the first bars don't stutter.
    new Set(this.notes.map((n) => n.midi)).forEach((m) => this.pluck(m));
    if (this.loop && (from < this.loop.start || from >= this.loop.end)) from = this.loop.start;
    if (from >= this.end) from = 0;
    this.playing = true;
    this.anchorAt(from, this.ctx.currentTime + 0.05);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  pause() {
    if (!this.playing) return;
    this.position = this.currentTime();
    this.stop();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.playing) this.silence(this.ctx.currentTime);
    this.playing = false;
  }

  seek(time) {
    const t = Math.max(0, Math.min(time, this.end));
    if (this.playing) {
      this.silence(this.ctx.currentTime);
      this.anchorAt(t, this.ctx.currentTime + 0.03);
    } else {
      this.position = t;
    }
  }

  // Play a single note right now (clicking a fret in the tab).
  audition(midi, string) {
    this.ensureContext();
    this.scheduleNote({ midi, string, duration: 0.8, velocity: 0.8, slideFrom: null }, this.ctx.currentTime + 0.01, 1);
  }

  // ---- scheduling ----------------------------------------------------------

  anchorAt(songTime, ctxTime) {
    this.anchorSong = songTime;
    this.anchorCtx = ctxTime;
    this.nextNote = firstIndexAtOrAfter(this.notes, songTime);
    this.nextBeat = firstIndexAtOrAfter(this.beats, songTime);
  }

  ctxTimeFor(songTime) {
    return this.anchorCtx + (songTime - this.anchorSong) / this.speed;
  }

  tick() {
    const ctx = this.ctx;
    let horizon = this.anchorSong + (ctx.currentTime + LOOKAHEAD_S - this.anchorCtx) * this.speed;
    if (this.loop && horizon >= this.loop.end) {
      this.scheduleUntil(this.loop.end);
      const wrapAt = this.ctxTimeFor(this.loop.end);
      this.silence(wrapAt);
      this.anchorAt(this.loop.start, wrapAt);
      horizon = this.anchorSong + (ctx.currentTime + LOOKAHEAD_S - this.anchorCtx) * this.speed;
    }
    this.scheduleUntil(horizon);

    if (!this.loop && this.currentTime() >= this.end) {
      this.stop();
      this.position = 0;
      this.onEnd?.();
    }
  }

  scheduleUntil(songTime) {
    const ctxNow = this.ctx.currentTime;
    while (this.nextNote < this.notes.length && this.notes[this.nextNote].time < songTime) {
      const note = this.notes[this.nextNote++];
      this.scheduleNote(note, Math.max(ctxNow, this.ctxTimeFor(note.time)), this.speed);
    }
    while (this.nextBeat < this.beats.length && this.beats[this.nextBeat].time < songTime) {
      const beat = this.beats[this.nextBeat++];
      if (this.metronome) this.click(Math.max(ctxNow, this.ctxTimeFor(beat.time)), beat.accent);
    }
  }

  scheduleNote(note, when, speed) {
    const ctx = this.ctx;
    const { buffer, rate } = this.pluck(note.midi);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    const level = 0.35 * (0.3 + 0.7 * note.velocity);

    if (note.slideFrom !== null && note.slideFrom !== undefined) {
      // Slide: start at the old pitch and glide, without a fresh pluck.
      src.playbackRate.setValueAtTime(rate * 2 ** ((note.slideFrom - note.midi) / 12), when);
      src.playbackRate.linearRampToValueAtTime(rate, when + GLIDE_S / speed);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(level * 0.8, when + 0.015);
    } else {
      src.playbackRate.value = rate;
      gain.gain.setValueAtTime(level, when);
    }

    // One note per string: a new note mutes whatever that string was playing.
    const previous = this.stringVoices[note.string];
    if (previous) this.release(previous, when);

    src.connect(gain).connect(this.input);
    src.start(when);
    const voice = { src, gain };
    this.voices.add(voice);
    this.stringVoices[note.string] = voice;
    src.onended = () => {
      this.voices.delete(voice);
      if (this.stringVoices[note.string] === voice) this.stringVoices[note.string] = null;
    };
    // Let it ring a little past its written length, then damp it.
    this.release(voice, when + Math.min(note.duration / speed + 1.0, buffer.duration / rate), 0.12);
  }

  release(voice, at, fade = 0.015) {
    const g = voice.gain.gain;
    g.cancelScheduledValues(at);
    g.setTargetAtTime(0, at, fade);
    try {
      voice.src.stop(at + fade * 8);
    } catch {
      // already stopped
    }
  }

  silence(at) {
    this.voices.forEach((v) => this.release(v, at));
    this.stringVoices = [];
  }

  click(when, accent) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1175;
    gain.gain.setValueAtTime(accent ? 0.35 : 0.22, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    osc.connect(gain).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.06);
  }
}
