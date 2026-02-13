import librosa
import numpy as np
import scipy.signal

# Standard tuning frequencies (E2 to E4)
STANDARD_TUNING = {
    'E2': 82.41,
    'A2': 110.00,
    'D3': 146.83,
    'G3': 196.00,
    'B3': 246.94,
    'E4': 329.63
}

STRING_FREQUENCIES = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63]

def process_audio(file_path):
    """
    Process audio file to extract pitch and rhythm, then generate guitar tabs.
    """
    try:
        # 1. Load Audio
        y, sr = librosa.load(file_path, sr=22050)
        
        # 2. Onset Detection (Note start times)
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        
        # 3. Pitch Tracking (pYIN)
        # E2 (82Hz) to E6 (1318Hz)
        f0, voiced_flag, voiced_probs = librosa.pyin(
            y, 
            fmin=librosa.note_to_hz('E2'), 
            fmax=librosa.note_to_hz('E6'),
            sr=sr
        )
        
        # 4. Generate Tab Data
        tabs = generate_tabs(f0, voiced_flag, onset_frames, sr)
        
        return {
            "status": "success",
            "duration": librosa.get_duration(y=y, sr=sr),
            "tempo": extract_tempo(y, sr),
            "tabs": tabs
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}

def extract_tempo(y, sr):
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return float(tempo)

def frequency_to_fret(frequency):
    """
    Convert frequency to (string_index, fret_number).
    Returns tuple (string_idx, fret) or None if out of range.
    """
    if frequency <= 0:
        return None
        
    # Logic to be implemented: find best matching string/fret
    # straightforward approach: minimize fret number and distance to open string
    
    best_string = -1
    best_fret = -1
    min_dist = float('inf')
    
    for i, open_freq in enumerate(STRING_FREQUENCIES):
        # f = f0 * 2^(n/12) -> n = 12 * log2(f/f0)
        fret = 12 * np.log2(frequency / open_freq)
        fret_rounded = int(round(fret))
        
        if 0 <= fret_rounded <= 24:
            # Check if this valid fret is "better" (e.g. lower fret is usually preferred)
            # For now, just taking the first valid one or implementing simple heuristic
            return (i, fret_rounded)
            
    return None

def generate_tabs(f0, voiced_flag, onset_frames, sr):
    """
    Convert pitch data into tab structure.
    """
    tabs = []
    # Placeholder logic
    return tabs
