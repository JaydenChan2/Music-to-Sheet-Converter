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

import librosa
import numpy as np
import scipy.signal

# Standard tuning frequencies (E2 to E4)
# Strings: 0=E2, 1=A2, 2=D3, 3=G3, 4=B3, 5=E4 (High E)
STRING_FREQUENCIES = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63]

def process_audio(file_path):
    """
    Process audio file to extract pitch and rhythm, then generate guitar tabs.
    """
    try:
        # 1. Load Audio
        # Use a consistent sample rate
        y, sr = librosa.load(file_path, sr=22050)
        
        # 2. Onset Detection (Note start times)
        # backtrack=True helps find the precise start of the note
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, backtrack=True)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        
        # 3. Pitch Tracking (pYIN)
        # E2 (82Hz) to E6 (1318Hz)
        f0, voiced_flag, voiced_probs = librosa.pyin(
            y, 
            fmin=librosa.note_to_hz('E2'), 
            fmax=librosa.note_to_hz('E6'),
            sr=sr,
            frame_length=2048,
            hop_length=512
        )
        
        times = librosa.times_like(f0, sr=sr, hop_length=512)
        
        # 4. Generate Tab Data
        # We need to map segments between onsets to pitches
        tabs = generate_tabs(y, sr, onset_frames, onset_times, f0, times, voiced_flag)
        
        return {
            "status": "success",
            "duration": librosa.get_duration(y=y, sr=sr),
            "tempo": extract_tempo(y, sr),
            "tabs": tabs
        }
        
    except Exception as e:
        print(f"Error processing audio: {e}")
        return {"status": "error", "message": str(e)}

def extract_tempo(y, sr):
    try:
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        return float(tempo)
    except:
        return 120.0

def frequency_to_fret(frequency):
    """
    Convert frequency to (string_index, fret_number).
    Returns tuple (string_idx, fret) or None if out of range.
    """
    if frequency <= 0 or np.isnan(frequency):
        return None
        
    candidates = []
    
    # Check each string
    for string_idx, open_freq in enumerate(STRING_FREQUENCIES):
        # f = f0 * 2^(n/12) -> n = 12 * log2(f/f0)
        try:
            fret = 12 * np.log2(frequency / open_freq)
            fret_rounded = int(round(fret))
            
            # Check if this is a valid fret (0 to 24)
            # Also allow a small tolerance for "almost" valid notes? 
            # The rounding handles the tolerance.
            
            # We also check if the frequency is close enough to the theoretical fret frequency
            # theoretical_freq = open_freq * (2 ** (fret_rounded / 12))
            # diff = abs(frequency - theoretical_freq)
            
            if 0 <= fret_rounded <= 24:
                candidates.append({
                    'string': string_idx,
                    'fret': fret_rounded,
                    'diff': abs(fret - fret_rounded) # How close we are to the exact center of the note
                })
        except:
            continue
            
    if not candidates:
        return None
        
    # Heuristics for selection:
    # 1. Prefer lower frets (0-5)
    # 2. Prefer closer match to pitch
    
    # Sort by fret number first, then difference?
    # Actually, minimizing fret number is usually best for "easy" tabs.
    candidates.sort(key=lambda x: (x['fret'], x['diff']))
    
    best = candidates[0]
    return (best['string'], best['fret'])

def generate_tabs(y, sr, onset_frames, onset_times, f0, times, voiced_flag):
    """
    Convert pitch data into tab structure.
    Returns a list of time-stamped note events.
    Structure: [ { "time": 0.5, "notes": { "0": 3 } }, ... ]
    """
    tabs = []
    
    # Iterate through segments defined by onsets
    # If no onsets, just process frames? Better to use segments.
    # Add end time to onsets to handle the last segment
    segment_boundaries = list(onset_frames)
    segment_boundaries.append(len(f0)) # Last frame
    
    for i in range(len(segment_boundaries) - 1):
        start_frame = segment_boundaries[i]
        end_frame = segment_boundaries[i+1]
        
        # Extract f0 chunk for this segment
        # f0 indices align with frames
        segment_f0 = f0[start_frame:end_frame]
        
        # Filter out unvoiced or NaN parts
        valid_f0 = segment_f0[~np.isnan(segment_f0)]
        
        if len(valid_f0) == 0:
            continue
            
        # visual check: if the segment is mostly unvoiced, skip?
        # For now, take median of valid pitches
        median_pitch = np.median(valid_f0)
        
        # Convert to fret
        fret_info = frequency_to_fret(median_pitch)
        
        if fret_info:
            string_idx, fret_val = fret_info
            
            # Determine start time of this note
            # onset_times[i] gives time of start_frame
            # But we might want slightly finer grain or just use onset time
            
            if i < len(onset_times):
                t = onset_times[i]
            else:
                t = librosa.frames_to_time(start_frame, sr=sr)
            
            # In guitar tabs, we might have multiple notes (chords), but pYIN is monophonic.
            # We output a single note for this time.
            
            # Reformat string index to match visualizer: 
            # In our visualizer, strings are [e, B, G, D, A, E] (Top to Bottom visually)
            # STRING_FREQUENCIES is [E2, A2, D3, G3, B3, E4] (Low to High pitch)
            # Implementation map:
            # 0 (E2) -> Visual Index 5 (E)
            # 1 (A2) -> Visual Index 4 (A)
            # 2 (D3) -> Visual Index 3 (D)
            # 3 (G3) -> Visual Index 2 (G)
            # 4 (B3) -> Visual Index 1 (B)
            # 5 (E4) -> Visual Index 0 (e)
            
            visual_string_idx = 5 - string_idx
            
            tabs.append({
                "time": float(t),
                "notes": {
                    str(visual_string_idx): fret_val
                }
            })
            
    return tabs
