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
6.  **View Results**: the tab is laid out in 4/4 bars on a 16th-note grid; the current bar highlights during playback and clicking a bar jumps there. Slides are marked `/` (up) and `\` (down), e.g. `3/5`. Switch to **Tab Preview** to hear the transcription, and download it as **TXT** or **MIDI** (open the MIDI in MuseScore for standard notation).

### How it works

| Step | Tool |
|---|---|
| Download links | yt-dlp |
| Decode any format | ffmpeg |
| Guitar isolation | Demucs `htdemucs_6s` |
| Polyphonic note detection | Spotify basic-pitch |
| Tempo / beat grid | librosa beat tracking |
| String & fret choice | Viterbi search minimising hand movement and stretch |
| Slide detection | basic-pitch pitch contour: a slide sweeps through the frets in between; a re-pick or hammer-on jumps |

### Measuring accuracy

```bash
cd backend && .venv/bin/python benchmark.py          # add --sweep to compare onset thresholds
```

---
