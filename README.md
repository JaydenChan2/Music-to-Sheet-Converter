# 🎵 Music to Sheet Converter

> **Transform your audio files into accurate sheet music and guitar tabs in seconds.**

[![React](https://img.shields.io/badge/React-19-blue?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-Fast-purple?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Flask](https://img.shields.io/badge/Flask-Backend-black?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Python](https://img.shields.io/badge/Python-3.8%2B-yellow?logo=python&logoColor=white)](https://www.python.org/)

A powerful full-stack application that leverages advanced signal processing to analyze audio files (MP3, WAV) and convert them into readable musical notation. Whether you're a musician looking to transcribe a solo or a student studying composition, this tool simplifies the process.

---

## ✨ Features

- **🚀 Fast Audio Processing**: Upload and process audio files quickly using our optimized backend.
- **🎸 Guitar Tab Generation**: Automatically generates guitar tablature from audio input.
- **🎼 Sheet Music Conversion**: (In Development) Convert melodies into standard sheet music notation.
- **🎨 Modern UI**: Built with a beautiful, responsive interface using React and TailwindCSS.
- **🔗 Song Links**: Paste a YouTube / SoundCloud / Bandcamp / direct audio link.
- **📤 Export Options**: Download your transcriptions as MIDI or Text tab files.

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: React 19 + Vite
- **Styling**: TailwindCSS
- **Icons**: Lucide React
- **Animations**: Framer Motion

### **Backend**
- **Framework**: Flask (Python)
- **Audio Processing**: basic-pitch (neural transcription), Demucs (source separation), Librosa, yt-dlp, ffmpeg
- **Server**: Gunicorn (Production ready)

---

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites

Ensure you have the following installed:
- [Python 3.8+](https://www.python.org/downloads/) 🐍
- [Node.js 18+](https://nodejs.org/) 🟢
- [npm](https://www.npmjs.com/) 📦

### 1️⃣ Backend Setup

Requires **Python 3.10 or 3.11** (basic-pitch doesn't support 3.12+) and **ffmpeg**.

```bash
brew install ffmpeg          # macOS (Linux: apt install ffmpeg)
cd backend

# Create a virtual environment (uv shown; `python3.11 -m venv .venv` also works)
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements.txt

# Run the server
.venv/bin/python app.py
```
> The backend starts on `http://127.0.0.1:5001` (port 5000 is taken by AirPlay Receiver on macOS). Override with `PORT=...`.
> The first job downloads the Demucs model (~80 MB) and is slower than later ones.

### 2️⃣ Frontend Setup

Open a new terminal, navigate to the `frontend` directory, and start the React app.

```bash
cd frontend
npm install
npm run dev
```
> The frontend is at `http://localhost:5173` and proxies `/api` to the backend. If the backend runs elsewhere, start Vite with `VITE_BACKEND_URL=http://host:port npm run dev`.

---

## 📖 Usage

1.  **Start Services**: backend via `.venv/bin/python app.py`, frontend via `npm run dev`.
2.  **Access App**: Open `http://localhost:5173` in your browser.
3.  **Set up your guitar**: pick the tuning used in the recording (Standard, Drop D, half/whole step down, Drop C/C#, Open G/D/E, DADGAD, or a custom one like `D A D G B E`) and the capo fret, if any. With a capo, frets are written relative to the capo. Your choice is remembered.
4.  **Add a song**: drop an audio file (MP3, WAV, M4A, FLAC, OGG, MP4...) or paste a link (YouTube, SoundCloud, Bandcamp, direct audio URL).
5.  **Isolate guitar** (on by default) separates the guitar from vocals, drums and bass first. Leave it on for full songs; turn it off for solo guitar recordings to save time.
6.  **View Results**: the tab is laid out in 4/4 bars on a 16th-note grid; the current bar highlights during playback and clicking a bar jumps there. Slides are marked `/` (up) and `\` (down), e.g. `3/5`. Switch to **Synth** to hear the tab played by a built-in guitar synthesizer (acoustic, nylon, clean or overdriven electric), slow it down to 50-75%, loop a bar, turn on a metronome, or click any fret number to hear that note. Download it as **TXT** or **MIDI** (open the MIDI in MuseScore for standard notation).

### How it works

| Step | Tool |
|---|---|
| Download links | yt-dlp |
| Decode any format | ffmpeg |
| Guitar isolation | Demucs `htdemucs_6s` |
| Polyphonic note detection | Spotify basic-pitch |
| Tempo / beat grid | librosa beat tracking |
| String & fret choice | Viterbi search minimising hand movement and stretch |
| Tab playback | Karplus-Strong plucked-string synthesis in the browser (Web Audio API) |
| Slide detection | basic-pitch pitch contour: a slide sweeps through the frets in between; a re-pick or hammer-on jumps |

---

## 📊 Evaluation

The pipeline is evaluated on [GuitarSet](https://guitarset.weebly.com/) (Xi et al., ISMIR 2018), a dataset of 360 solo acoustic guitar recordings. Its note annotations were recorded with a hexaphonic pickup and corrected by hand, so every note has a pitch, onset, offset **and string**.

**Setup**
- **Audio:** the mono microphone recordings (not the hexaphonic pickup), GuitarSet 1.1.0 from [Zenodo](https://zenodo.org/records/3371780).
- **Split:** random with a fixed seed (0): 20 validation clips (3,400 notes) and 60 test clips (11,280 notes). The test clips are half accompaniment, half solo, and cover all 6 players.
- **Pipeline:** the app's real pipeline, `transcribe(separate=False)`: basic-pitch, then beat grid / 16th-note quantisation, then Viterbi fingering. Demucs is off.
- **Tuning:** the only tuned setting is basic-pitch's onset threshold. It was picked on the validation clips (0.6), then the test set was scored once with it.
- **Metrics:** [`mir_eval.transcription`](https://craffel.github.io/mir_eval/) at standard tolerances: pitch within 50 cents, onset within 50 ms, offset within max(50 ms, 20% of the note's length). Fingering is scored on notes whose pitch and onset match: is the note on the annotated string and fret?

**Results: test set, 60 clips, 11,280 reference notes**

| Metric | Score |
|---|---|
| Note onset F1 (mean per clip) | **71.3%** (precision 73.6%, recall 71.1%) |
| Note onset F1 (pooled over all notes) | 66.8% |
| Note onset + offset F1 (mean per clip) | 39.5% |
| Exact string & fret, of the 6,906 correctly detected notes | **55.2%** |
| Right pitch but a different string, of the same notes | 44.8% |

For reference, basic-pitch's raw notes before they are snapped to the 16th-note grid score 79.2% onset F1. Quantising to a readable tab costs about 8 points.

**Limitations**
- **basic-pitch was probably trained on GuitarSet**, so some of these recordings may have been in its training data, which would inflate the note F1. The fingering score comes from this project's own Viterbi step and is not affected. A cleaner test would use only basic-pitch's GuitarSet test split, or a dataset it never saw (e.g. IDMT-SMT-Guitar).
- **Solo, clean studio audio, with Demucs off.** Real songs with a band behind the guitar will likely score lower, and this benchmark doesn't measure that.
- **Fingering is graded against one player's choice.** A "different string" is often still playable, so 55.2% understates how usable the tabs are.
- **Offsets are coarse by design.** The app gives every note in a chord the same grid-snapped length, so treat onset + offset F1 as a rough floor.
- **The split is random, not by player.** Validation and test share players and chord progressions. Only one setting was tuned, so the effect should be small.
- **Only 60 of the 340 non-validation clips are scored.** Pass `--n-test 340` for a tighter estimate.

**Reproduce**

```bash
cd backend
mkdir -p .benchmark_cache/guitarset && cd .benchmark_cache/guitarset
curl -L -o annotation.zip     https://zenodo.org/api/records/3371780/files/annotation.zip/content
curl -L -o audio_mono-mic.zip https://zenodo.org/api/records/3371780/files/audio_mono-mic.zip/content
unzip -q annotation.zip -d annotation && unzip -q audio_mono-mic.zip -d audio_mono-mic
cd ../.. && .venv/bin/python benchmark_guitarset.py     # ~5 min; outputs are cached
```

`benchmark.py` is a small smoke test (one real scale recording plus synthetic clips, including slide detection), useful for quick checks while developing:

```bash
cd backend && .venv/bin/python benchmark.py          # add --sweep to compare onset thresholds
```

---
