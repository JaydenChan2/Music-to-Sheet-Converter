import librosa
import numpy as np
import scipy.signal

# Standard tuning frequencies (E2 to E4)
# Strings: 0=E2, 1=A2, 2=D3, 3=G3, 4=B3, 5=E4 (High E)
STRING_FREQUENCIES = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63]

# Minimum gap between onsets (in seconds) to prevent note shattering
MIN_ONSET_GAP = 0.05

# Minimum voiced probability to accept a pitch detection
MIN_VOICED_PROB = 0.3


def process_audio(file_path):
    """
    Process audio file to extract pitch and rhythm, then generate guitar tabs.
    """
    try:
        # 1. Load Audio
        y, sr = librosa.load(file_path, sr=22050)
        
        # 2. Onset Detection (Note start times)
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, backtrack=True)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        
        # 2b. Merge onsets that are too close together
        onset_times, onset_frames = merge_close_onsets(onset_times, onset_frames)
        
        # 3. Pitch Tracking (pYIN)
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
        tabs = generate_tabs(y, sr, onset_frames, onset_times, f0, times, voiced_flag, voiced_probs)
        
        # 5. Synthesize Audio from Tabs
        duration = librosa.get_duration(y=y, sr=sr)
        y_synth = synthesize_tabs(tabs, duration, sr=22050)
        
        # Save to outputs directory
        import os
        import scipy.io.wavfile as wavfile
        synth_filename = f"synth_{os.path.basename(file_path)}.wav"
        synth_filepath = os.path.join('outputs', synth_filename)
        os.makedirs('outputs', exist_ok=True)
        # Convert to 16-bit PCM for wavfile
        wavfile.write(synth_filepath, 22050, np.int16(y_synth * 32767))
        
        synth_url = f"http://127.0.0.1:5000/api/audio/{synth_filename}"
        
        return {
            "status": "success",
            "duration": duration,
            "tempo": extract_tempo(y, sr),
            "tabs": tabs,
            "synth_url": synth_url
        }
        
    except Exception as e:
        print(f"Error processing audio: {e}")
        return {"status": "error", "message": str(e)}


def merge_close_onsets(onset_times, onset_frames):
    """Merge onsets that are closer than MIN_ONSET_GAP seconds."""
    if len(onset_times) < 2:
        return onset_times, onset_frames
    
    merged_times = [onset_times[0]]
    merged_frames = [onset_frames[0]]
    
    for i in range(1, len(onset_times)):
        if onset_times[i] - merged_times[-1] >= MIN_ONSET_GAP:
            merged_times.append(onset_times[i])
            merged_frames.append(onset_frames[i])
    
    return np.array(merged_times), np.array(merged_frames)


def synthesize_tabs(tabs, duration, sr=22050):
    """Synthesize a simple audio representation of the tabs for playback."""
    # Add 1 second of padding for the final notes to decay
    y_synth = np.zeros(int(duration * sr) + sr)
    
    # 0=e(E4), 1=B3, 2=G3, 3=D3, 4=A2, 5=E2
    string_open_freqs = {
        0: 329.63,
        1: 246.94,
        2: 196.00,
        3: 146.83,
        4: 110.00,
        5: 82.41
    }
    
    for note_event in tabs:
        t = note_event['time']
        notes = note_event.get('notes', {})
        for str_idx, fret in notes.items():
            str_idx = int(str_idx)
            freq = string_open_freqs[str_idx] * (2 ** (fret / 12))
            
            # Note duration and envelope parameters
            note_dur = 2.0
            t_samples = np.arange(int(note_dur * sr)) / sr
            
            # ADSR simple envelope: 10ms attack, exponential decay
            attack_time = 0.01
            decay_rate = 4.0
            
            attack_samples = int(attack_time * sr)
            env = np.ones_like(t_samples)
            if attack_samples > 0:
                env[:attack_samples] = np.linspace(0, 1, attack_samples)
            env[attack_samples:] = np.exp(-decay_rate * (t_samples[attack_samples:] - attack_time))
            
            # Basic FM-like plucked tone using sine and odd harmonics
            tone = np.sin(2 * np.pi * freq * t_samples) + \
                   0.3 * np.sin(2 * np.pi * 2 * freq * t_samples) + \
                   0.1 * np.sin(2 * np.pi * 3 * freq * t_samples)
                   
            tone = tone * env * 0.4
            
            start_sample = int(t * sr)
            end_sample = start_sample + len(tone)
            
            if end_sample <= len(y_synth):
                y_synth[start_sample:end_sample] += tone
            else:
                overlap = len(y_synth) - start_sample
                y_synth[start_sample:] += tone[:overlap]
                
    # Normalize to prevent clipping
    max_val = np.max(np.abs(y_synth))
    if max_val > 0:
        y_synth = y_synth / max_val * 0.8
        
    return y_synth


def extract_tempo(y, sr):
    try:
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        return float(tempo)
    except:
        return 120.0


def frequency_to_fret(frequency, prev_string=None):
    """
    Convert frequency to (string_index, fret_number).
    Returns tuple (string_idx, fret) or None if out of range.
    
    If prev_string is provided, prefer the same string when frets are close.
    """
    if frequency <= 0 or np.isnan(frequency):
        return None
        
    candidates = []
    
    for string_idx, open_freq in enumerate(STRING_FREQUENCIES):
        try:
            fret = 12 * np.log2(frequency / open_freq)
            fret_rounded = int(round(fret))
            
            if 0 <= fret_rounded <= 24:
                # Measure how far the detected pitch is from the theoretical fret pitch
                theoretical_freq = open_freq * (2 ** (fret_rounded / 12))
                cent_diff = abs(1200 * np.log2(frequency / theoretical_freq))
                
                candidates.append({
                    'string': string_idx,
                    'fret': fret_rounded,
                    'diff': abs(fret - fret_rounded),
                    'cent_diff': cent_diff
                })
        except:
            continue
            
    if not candidates:
        return None
    
    # Filter out candidates with > 50 cent deviation
    good_candidates = [c for c in candidates if c['cent_diff'] < 50]
    if not good_candidates:
        good_candidates = candidates
    
    # Prefer same string as previous note if frets are close
    if prev_string is not None:
        same_string = [c for c in good_candidates if c['string'] == prev_string and c['fret'] <= 12]
        if same_string:
            same_string.sort(key=lambda x: x['fret'])
            return (same_string[0]['string'], same_string[0]['fret'])
    
    # Sort: prefer lower frets, then closer pitch match
    good_candidates.sort(key=lambda x: (x['fret'], x['diff']))
    
    best = good_candidates[0]
    return (best['string'], best['fret'])


def generate_tabs(y, sr, onset_frames, onset_times, f0, times, voiced_flag, voiced_probs):
    """
    Convert pitch data into tab structure.
    Returns a list of time-stamped note events.
    Structure: [ { "time": 0.5, "notes": { "0": 3 } }, ... ]
    
    Unvoiced segments produce a rest entry: { "time": ..., "notes": {} }
    """
    tabs = []
    prev_string = None
    
    segment_boundaries = list(onset_frames)
    segment_boundaries.append(len(f0))  # Last frame
    
    for i in range(len(segment_boundaries) - 1):
        start_frame = segment_boundaries[i]
        end_frame = segment_boundaries[i+1]
        
        # Extract f0 chunk for this segment
        segment_f0 = f0[start_frame:end_frame]
        segment_probs = voiced_probs[start_frame:end_frame] if voiced_probs is not None else None
        
        # Filter out unvoiced or NaN parts with confidence threshold
        if segment_probs is not None:
            valid_mask = (~np.isnan(segment_f0)) & (segment_probs >= MIN_VOICED_PROB)
        else:
            valid_mask = ~np.isnan(segment_f0)
        
        valid_f0 = segment_f0[valid_mask]
        
        # Determine start time
        if i < len(onset_times):
            t = onset_times[i]
        else:
            t = librosa.frames_to_time(start_frame, sr=sr)
        
        if len(valid_f0) == 0:
            # Rest — no confident pitch detected
            tabs.append({
                "time": float(t),
                "notes": {}
            })
            continue
            
        # Take median of valid pitches
        median_pitch = np.median(valid_f0)
        
        # Convert to fret
        fret_info = frequency_to_fret(median_pitch, prev_string)
        
        if fret_info:
            string_idx, fret_val = fret_info
            prev_string = string_idx
            
            # Remap: STRING_FREQUENCIES[0]=E2 -> visual index 5 (bottom)
            visual_string_idx = 5 - string_idx
            
            tabs.append({
                "time": float(t),
                "notes": {
                    str(visual_string_idx): fret_val
                }
            })
        else:
            # Could not map to a fret — treat as rest
            tabs.append({
                "time": float(t),
                "notes": {}
            })
            
    return tabs
