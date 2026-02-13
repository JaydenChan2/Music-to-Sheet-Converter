# Music to Sheet Converter

A full-stack application to convert audio files into sheet music/tabs.

## Structure

- `backend/`: Flask application for audio processing.
- `frontend/`: React application (Vite) for the user interface.

## Prerequisites

- Python 3.8+
- Node.js 18+
- npm

## Setup

### Backend

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the server:
   ```bash
   python3 app.py
   ```
   The backend runs on `http://127.0.0.1:5000`.

### Frontend

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
   > **Note:** The frontend code is in the root `frontend` directory, not inside `backend/frontend`.

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   The frontend will run on `http://localhost:5173` (by default).

## Usage

1. Start both the backend and frontend servers requirements.
2. Open the frontend URL in your browser.
3. Upload an audio file/generate tabs.
