# 🎸 Guitar Tab AI

> **Turn a recording, a song link, or a video into guitar tab you can read, hear and download.**

[![React](https://img.shields.io/badge/React-19-blue?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-purple?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Flask](https://img.shields.io/badge/Flask-backend-black?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11-yellow?logo=python&logoColor=white)](https://www.python.org/)

**[Features](#-features) · [Quick start](#-quick-start) · [Using the studio](#-using-the-studio) · [How it works](#-how-it-works) · [Accuracy](#-accuracy) · [Deploying](#-deploying)**

---

## ✨ Features

- **Audio to tab** – polyphonic note detection (chords too), placed on a 16th-note grid in 4/4.
- **Playable fingerings** – each note gets the string and fret that keeps your hand still.
- **Three video types**
  - **Song** – any recording or performance.
  - **Tutorial** – picks up the capo, tuning and chords a teacher mentions.
  - **Tabs on screen** – reads the tab shown in a video and uses its strings and frets.
- **Song links** – YouTube, SoundCloud, Bandcamp or a direct audio URL.
- **Any tuning, any capo** – 10 presets or your own.
- **Tab check** – every note is re-checked against the recording, scored, and flagged if unsure.
- **Practice tools** – synth playback, 50–125% speed, loop a bar, metronome, click a fret to hear it.
- **Export** – TXT tab, or MIDI (open it in MuseScore for standard notation).
- **Off-pitch recordings** – lo-fi or slowed recordings are retuned to concert pitch first.
- **Light and dark mode**, and ready-made example songs for each mode.

---

## 🚀 Quick start

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | **3.10 or 3.11** | basic-pitch doesn't support 3.12+ yet |
| Node.js | 18+ | with npm |
| ffmpeg | any recent | `brew install ffmpeg` (macOS) · `apt install ffmpeg` (Linux) |

### 1. Backend

```bash
cd backend
uv venv --python 3.11 .venv                              # or: python3.11 -m venv .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python app.py
```

- Runs on **http://127.0.0.1:5001** (port 5000 is taken by AirPlay on macOS). Change it with `PORT=...`.
- The first job downloads the Demucs model (~80 MB), so it's slower than later ones.

### 2. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

- Open **http://localhost:5173**. Vite forwards `/api` to the backend.
- Backend somewhere else? Start Vite with `VITE_BACKEND_URL=http://host:port npm run dev`.

---

## 🎛 Using the studio

1. **Pick the video type** – Song, Tutorial or Tabs on screen (see below).
2. **Set up your guitar** – tuning and capo. With a capo, frets are written relative to it. Your choice is remembered.
3. **Add a song** – drop an audio or video file, or paste a link.
4. **Optional: pick a part** – set **Start** / **End** (e.g. `4:10`–`6:30`).
5. **Isolate guitar** – on by default. Keep it on for full songs; turn it off for solo guitar to save time.

### Video types

| Type | Use it for | What it adds |
|---|---|---|
| **Song** | Recordings and performances | Transcribes what it hears |
| **Tutorial** | Lessons where someone talks you through it | Reads the captions (or recognises speech locally) and picks up the capo, tuning and chord names the teacher mentions |
| **Tabs on screen** | Play-alongs and lessons that show a tab | Reads the tab in the video; every heard note takes the string and fret of the matching on-screen column (timing still comes from the audio) |

**Settings from words.** A tuning or capo named by a teacher, or in a video's title or description ("Drop D", "Capo 2"), is only applied if you left Tuning / Capo at **Standard / No capo**. Your own choice always wins.

### Limits

| | |
|---|---|
| Length per job | Up to **12 minutes**. For longer videos (e.g. a 30-minute lesson), set a Start/End. |
| Long links without a range | Refused, with a message asking for a range |
| Long uploads without a range | The first 12 minutes are transcribed, with a warning |
| Supported files | MP3, WAV, M4A, FLAC, OGG, AAC, AIFF, OPUS, WebM, MP4, MOV (up to 200 MB) |

### The results page

- **Tab** – bars in 4/4 on a 16th-note grid; slides marked `/` (up) and `\` (down), e.g. `3/5`.
- **Follow along** – the current bar lights up during playback; click a bar to jump there.
- **Synth** – hear the tab as written (acoustic, nylon, clean or overdriven electric).
- **Practice** – 50% / 75% / 100% / 125% speed, loop a bar, metronome, click any fret to hear it.
- **Tab check** – an overall confidence score, bars to double-check, unsure notes outlined. Notes it hid can be shown again.
- **Download** – **TXT** or **MIDI**.

---

## 🔧 How it works

```
link / file ─► decode ─► (isolate guitar) ─► retune if off-pitch ─► detect notes ─► beat grid
            ─► (tutorial: listen to the teacher) ─► choose strings & frets
            ─► (tabs on screen: read the video) ─► tab check ─► tab · MIDI · TXT
```

| Step | Tool |
|---|---|
| Download links | yt-dlp |
| Decode any format | ffmpeg |
| Guitar isolation | Demucs `htdemucs_6s` |
| Off-pitch recordings | Spectral-peak tuning estimate; audio 20+ cents from A440 is resampled onto concert pitch |
| Note detection (polyphonic) | Spotify basic-pitch |
| Slides | basic-pitch pitch contour: a slide sweeps through the frets in between; a re-pick or hammer-on jumps |
| Tempo and beat grid | librosa beat tracking |
| Strings and frets | Viterbi search that minimises hand movement and stretch |
| Tutorial mode | YouTube captions via yt-dlp, otherwise faster-whisper on your machine (`WHISPER_MODEL`, default `base`) |
| Tabs on screen | OpenCV finds the staff and bar lines; a digit reader trained on synthetic fonts reads fret numbers; readings are voted across frames, then matched in order to the heard notes |
| Tab check | Each note is re-checked against the audio; a model fitted on GuitarSet gives it a confidence and hides near-certain ghosts |
| Playback | Karplus-Strong plucked-string synth in the browser (Web Audio API) |

Everything runs locally: no paid APIs. The AI parts are basic-pitch, Demucs and Whisper (neural networks) plus two small models trained here (the tab check and the digit reader).

---

## 📊 Accuracy

Measured on [GuitarSet](https://guitarset.weebly.com/) (Xi et al., ISMIR 2018): 360 solo acoustic recordings, hand-corrected, with the **string** of every note.

| What | Score |
|---|---|
| Note onset F1 (60 test clips) | **71.3%** |
| … with the tab check | **72.9%** |
| Exact string & fret, from audio alone | **55.2%** of correctly detected notes |
| Exact string & fret, with **tabs on screen** | **94.5%** (vs 68.2% audio-only on the same 12 clips) |

<details>
<summary><b>Setup</b></summary>

- **Audio:** the mono microphone recordings (not the hexaphonic pickup), GuitarSet 1.1.0 from [Zenodo](https://zenodo.org/records/3371780).
- **Split:** random, fixed seed 0 → 20 validation clips (3,400 notes) and 60 test clips (11,280 notes). Test clips are half accompaniment, half solo, all 6 players.
- **Pipeline:** the app's real pipeline, `transcribe(separate=False)` (basic-pitch → beat grid / 16th quantisation → Viterbi fingering). Demucs off.
- **Tuned settings:** only basic-pitch's onset threshold, chosen on validation (0.6); the test set was scored once.
- **Metrics:** [`mir_eval.transcription`](https://craffel.github.io/mir_eval/) at standard tolerances: pitch ±50 cents, onset ±50 ms, offset within max(50 ms, 20% of note length). Fingering is scored on notes whose pitch and onset match.

</details>

<details>
<summary><b>Full results (test set, 60 clips)</b></summary>

| Metric | Score |
|---|---|
| Note onset F1, mean per clip | **71.3%** (precision 73.6%, recall 71.1%) |
| Note onset F1, pooled over all notes | 66.8% |
| Note onset + offset F1, mean per clip | 39.5% |
| Exact string & fret, of the 6,906 correctly detected notes | **55.2%** |
| Right pitch, different string | 44.8% |
| basic-pitch's raw notes before the 16th grid (reference) | 79.2% onset F1 – the grid costs ~8 points |

</details>

<details>
<summary><b>Tab check</b> – <code>benchmark_verify.py fit | tune | test</code></summary>

The confidence model is fitted on the validation clips, the refinement threshold is picked there, and the test clips are scored once.

| Metric (test set) | Result |
|---|---|
| Note onset F1 without → with refinement | 71.3% → **72.9%** |
| Overall score vs. real share of right notes, per clip | within 5.4 points on average |

| Confidence shown | Actually right |
|---|---|
| ~44% | 52.5% |
| ~61% | 64.5% |
| ~78% | 80.5% |
| ~93% | 93.3% |

The model is fitted on clean solo guitar. On dense or lo-fi mixes it is less sure and hides more notes, which is why hidden notes can be shown again.

</details>

<details>
<summary><b>Tabs on screen</b> – <code>benchmark_tabvideo.py</code></summary>

The tab a play-along video would show is drawn from GuitarSet's string/fret annotations (page flips, bar numbers, H.264 video) and played over the real recording, so the right answer is known. 12 test clips:

| Metric | Audio only | Tabs on screen |
|---|---|---|
| Exact string & fret, of matched notes | 68.2% | **94.5%** |
| Note onset F1 | 66.4% | 66.5% |
| Drawn notes read back correctly | – | 86.3% (10 of 12 clips: 77–100%) |

The video fixes *where* notes are played, not *which* notes are found. Weak spot: very dense, fast strumming (two rock clips read at 25% and 56%).

</details>

<details>
<summary><b>Limitations</b></summary>

- **basic-pitch was probably trained on GuitarSet**, which may inflate note F1. The fingering score comes from this project's own Viterbi step and isn't affected. A cleaner test would use basic-pitch's GuitarSet test split, or a dataset it never saw (e.g. IDMT-SMT-Guitar).
- **Clean solo studio audio, Demucs off.** Real songs with a band will likely score lower.
- **Fingering is graded against one player's choice.** A "different string" is often still playable, so 55.2% understates usability.
- **Offsets are coarse by design** – chord notes share one grid-snapped length, so onset + offset F1 is a rough floor.
- **The split is random, not by player.** Only one setting was tuned, so the effect should be small.
- **Only 60 of the 340 non-validation clips are scored.** Pass `--n-test 340` for a tighter estimate.
- **Tabs-on-screen numbers come from drawn tab videos**, not real ones.

</details>

<details>
<summary><b>Reproduce</b></summary>

```bash
cd backend
mkdir -p .benchmark_cache/guitarset && cd .benchmark_cache/guitarset
curl -L -o annotation.zip     https://zenodo.org/api/records/3371780/files/annotation.zip/content
curl -L -o audio_mono-mic.zip https://zenodo.org/api/records/3371780/files/audio_mono-mic.zip/content
unzip -q annotation.zip -d annotation && unzip -q audio_mono-mic.zip -d audio_mono-mic
cd ../..

.venv/bin/python benchmark_guitarset.py          # main benchmark (~5 min; cached)
.venv/bin/python benchmark_verify.py test        # tab check
.venv/bin/python benchmark_tabvideo.py --clips 12  # tabs on screen
.venv/bin/python benchmark.py                    # quick smoke test (add --sweep for thresholds)
```

</details>

---

## 🌐 Deploying

Free setup: website on **Vercel**, transcription server on **Hugging Face Spaces** (Docker).
Step-by-step guide: **[deploy/DEPLOY.md](deploy/DEPLOY.md)**.

---

## 🛠 Tech stack

| Part | Built with |
|---|---|
| Frontend | React 19, Vite, React Router, Lucide icons, custom CSS (light/dark) |
| Backend | Flask, Gunicorn |
| Audio & ML | basic-pitch, Demucs, librosa, faster-whisper, scikit-learn |
| Video | OpenCV, ffmpeg, yt-dlp |

## 📁 Project layout

```
backend/
  app.py               API: jobs, files, health, limits
  audio_processor.py   the transcription pipeline
  tutorial.py          tutorial mode (captions / speech → capo, tuning, chords)
  tabvision.py         tabs on screen (read tab from video frames)
  digit_model.py       fret-number reader (trained on synthetic fonts)
  verify.py            tab check (per-note confidence, refinement)
  sources.py           link downloads and URL safety
  benchmark_*.py       accuracy benchmarks
  make_examples.py     builds the studio's example songs
frontend/src/
  pages/               Home, Studio, Features, How it works, Accuracy
  components/          tab viewer, panels, site layout and visuals
  studio/              transcription and playback state
deploy/                deployment guide and scripts
```

## 🙏 Credits

- [basic-pitch](https://github.com/spotify/basic-pitch) (Spotify), [Demucs](https://github.com/facebookresearch/demucs) (Meta), [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- Example audio and benchmark data: [GuitarSet](https://guitarset.weebly.com/) – Xi, Bittner, Pauwels, Ye & Bello, ISMIR 2018 (CC BY 4.0)
