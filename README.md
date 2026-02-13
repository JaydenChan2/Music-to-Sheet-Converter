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
- **📤 Export Options**: (Coming Soon) Download your transcriptions as PDF, MIDI, or Text files.

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: React 19 + Vite
- **Styling**: TailwindCSS
- **Icons**: Lucide React
- **Animations**: Framer Motion

### **Backend**
- **Framework**: Flask (Python)
- **Audio Processing**: Librosa, NumPy, SciPy
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

Navigate to the `backend` directory and install Python dependencies.

```bash
cd backend

# Create a virtual environment
python3 -m venv .venv

# Activate the virtual environment
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Run the server
python3 app.py
```
> The backend will start on `http://127.0.0.1:5000` 🌐

### 2️⃣ Frontend Setup

Open a new terminal, navigate to the `frontend` directory, and start the React app.

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
> The frontend will be available at `http://localhost:5173` 💻

---

## 📖 Usage

1.  **Start Services**: ensure the backend is running via `python3 app.py` and the frontend via `npm run dev`.
    > **Tip:** Visit `http://127.0.0.1:5000` to confirm the backend is running.
2.  **Access App**: Open `http://localhost:5173` in your browser.
3.  **Upload Audio**: Click the upload area to select an MP3 or WAV file.
4.  **View Results**: Wait for the processing to finish and view your generated tabs!

---
