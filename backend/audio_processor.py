"""
Audio -> guitar tab transcription pipeline.

  1. Decode any input (mp3/wav/m4a/webm/mp4...) with ffmpeg.
  2. Optionally isolate the guitar with Demucs (htdemucs_6s) so vocals, drums
     and bass don't pollute the transcription of a full song.
  3. Polyphonic note detection with Spotify's basic-pitch (handles chords).
  4. Clean up the notes (merge re-triggered sustains, drop overtone ghosts).
  5. Beat-track the mix and snap notes onto a 16th-note grid in 4/4.
  6. Choose playable string/fret positions for the whole piece with a
     Viterbi search that minimises hand movement and finger stretch.
"""
import logging
import os
import subprocess
import threading

import librosa
import numpy as np
import soundfile as sf

log = logging.getLogger(__name__)

SR = 22050  # basic-pitch's native sample rate
MIX_SR = 44100  # Demucs' native sample rate
MAX_DURATION_S = 12 * 60

# Standard tuning as MIDI note numbers, low E (index 0) -> high e (index 5)
OPEN_STRINGS = [40, 45, 50, 55, 59, 64]
MAX_FRET = 22  # counted from the nut
MAX_SPAN = 4  # widest fret stretch allowed within one chord shape
MAX_CAPO = 12

# Presets, strings listed low -> high as MIDI note numbers
TUNINGS = {
    'standard': ('Standard', OPEN_STRINGS),
    'drop_d': ('Drop D', [38, 45, 50, 55, 59, 64]),
    'half_down': ('Half step down', [39, 44, 49, 54, 58, 63]),
    'full_down': ('Whole step down', [38, 43, 48, 53, 57, 62]),
    'drop_c_sharp': ('Drop C#', [37, 44, 49, 54, 58, 63]),
    'drop_c': ('Drop C', [36, 43, 48, 53, 57, 62]),
    'open_g': ('Open G', [38, 43, 50, 55, 59, 62]),
    'open_d': ('Open D', [38, 45, 50, 54, 57, 62]),
    'open_e': ('Open E', [40, 47, 52, 56, 59, 64]),
    'dadgad': ('DADGAD', [38, 45, 50, 55, 57, 62]),
}
SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
MIXED_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

SLOTS_PER_BEAT = 4  # 16th-note grid
BEATS_PER_MEASURE = 4
SLOTS_PER_MEASURE = SLOTS_PER_BEAT * BEATS_PER_MEASURE

# basic-pitch model output layout
BP_FPS = 22050 / 256  # nominal only: basic-pitch's real frame times drift (see _frame_times)
BP_MIDI_OFFSET = 21
CONTOUR_BINS_PER_SEMITONE = 3

# Slide detection (see detect_slides)
SLIDE_MAX_INTERVAL = 12  # semitones
SLIDE_MAX_GAP = 0.12  # s between the end of one note and the start of the next
SLIDE_MAX_OVERLAP = 0.08
SLIDE_LOOKBACK = 0.3  # s of contour examined before the target note starts
SLIDE_LOOKAHEAD = 0.1
SLIDE_MIN_SALIENCE = 0.1
SLIDE_MID_RATIO = 0.8  # in-between pitch must be this loud relative to both endpoints
SLIDE_MIN_FRAMES = 3  # ~35 ms of audible glide
SLIDE_MIN_SPAN = 0.75  # fraction of the in-between pitch range the glide must cross
SLIDE_MIN_CORR = 0.9  # how steadily it must move toward the target
SLIDE_STRING_PENALTY = 4.0  # fingering cost of splitting a slide across two strings

_model_lock = threading.Lock()
_bp_model = None
_demucs_model = None


class ProcessingError(Exception):
    pass


# ---------------------------------------------------------------------------
# Tuning & capo
# ---------------------------------------------------------------------------

def _string_names(strings):
    """Spell open-string names the way guitarists write them: a tuning rooted on
    Eb/Ab/Bb uses flats (Eb Ab Db Gb Bb Eb), one rooted on C#/F# uses sharps."""
    root = strings[0] % 12
    table = FLAT_NAMES if root in (3, 8, 10) else SHARP_NAMES if root in (1, 6) else MIXED_NAMES
    return [table[m % 12] for m in strings]


def parse_custom_tuning(text):
    """Parse six note names, low -> high, e.g. "D A D G B E" or "C2 G2 C3 F3 A3 D4".

    Notes without an octave get the octave closest to the matching string in
    standard tuning.
    """
    tokens = [t for t in text.replace(',', ' ').split() if t]
    if len(tokens) != 6:
        raise ProcessingError("A custom tuning needs exactly 6 notes, lowest string first (e.g. D A D G B E).")
    strings = []
    for token, reference in zip(tokens, OPEN_STRINGS):
        name = token.strip().replace('♯', '#').replace('♭', 'b')
        name = name[0].upper() + name[1:]
        try:
            if name[-1].isdigit():
                midi = int(librosa.note_to_midi(name))
            else:
                pc = int(librosa.note_to_midi(name + '4')) % 12
                midi = min((pc + 12 * o for o in range(1, 8)), key=lambda m: abs(m - reference))
        except Exception:
            raise ProcessingError(f"'{token}' isn't a note name. Use letters like E, F#, Bb.")
        if abs(midi - reference) > 12:
            raise ProcessingError(f"'{token}' is too far from a normal guitar string pitch.")
        strings.append(midi)
    return strings


def resolve_tuning(tuning='standard', capo=0, custom=None):
    """Validate the user's tuning/capo choice and return a tuning dict used by the pipeline."""
    try:
        capo = int(capo or 0)
    except (TypeError, ValueError):
        raise ProcessingError("Capo must be a fret number.")
    if not 0 <= capo <= MAX_CAPO:
        raise ProcessingError(f"Capo must be between 0 and {MAX_CAPO}.")

    if tuning == 'custom':
        name, strings = 'Custom', parse_custom_tuning(custom or '')
    elif tuning in TUNINGS:
        name, strings = TUNINGS[tuning]
    else:
        raise ProcessingError(f"Unknown tuning '{tuning}'.")

    # With a capo, frets are written relative to the capo (0 = capo'd string).
    sounding = [m + capo for m in strings]
    names = _string_names(strings)
    labels = names[:-1] + [names[-1].lower()]  # lowercase high string, like the classic "e"
    return {
        'id': tuning,
        'name': name,
        'capo': capo,
        'strings': list(strings),  # open strings without capo, low -> high
        'open_strings': sounding,  # what each string sounds at fret 0 of the tab
        'max_fret': MAX_FRET - capo,
        'low': min(sounding),
        'high': max(sounding) + MAX_FRET - capo,
        'labels': labels[::-1],  # high -> low, as displayed top to bottom
        'notes': ' '.join(names),
    }


def tuning_presets():
    return [{'id': k, 'name': n, 'notes': ' '.join(_string_names(v))} for k, (n, v) in TUNINGS.items()]


# ---------------------------------------------------------------------------
# Model loading (cached, loaded lazily on first use)
# ---------------------------------------------------------------------------

def _get_basic_pitch():
    global _bp_model
    with _model_lock:
        if _bp_model is None:
            from basic_pitch import ICASSP_2022_MODEL_PATH
            from basic_pitch.inference import Model
            _bp_model = Model(ICASSP_2022_MODEL_PATH)
    return _bp_model


def separation_available():
    try:
        import demucs  # noqa: F401
        import torch  # noqa: F401
        return True
    except ImportError:
        return False


def _get_demucs():
    global _demucs_model
    with _model_lock:
        if _demucs_model is None:
            from demucs.pretrained import get_model
            _demucs_model = get_model('htdemucs_6s')
            _demucs_model.eval()
    return _demucs_model


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def transcribe(source_path, job_dir, separate=True, tuning=None, progress=lambda stage, frac: None):
    """Run the full pipeline. Writes artifacts into job_dir and returns the result dict."""
    tuning = tuning or resolve_tuning()
    progress('decoding', 0.05)
    mix_path = decode_audio(source_path, job_dir)
    mix, _ = librosa.load(mix_path, sr=SR, mono=True)
    duration = len(mix) / SR
    if duration < 0.5 or np.max(np.abs(mix)) < 1e-4:
        raise ProcessingError("The audio is empty or silent.")

    stem_used = 'full mix'
    if separate and separation_available():
        progress('separating', 0.15)
        target, stem_used = isolate_guitar(mix_path)
    else:
        target = mix

    progress('transcribing', 0.6)
    stem_path = os.path.join(job_dir, 'stem.wav')
    sf.write(stem_path, target, SR)
    notes = detect_notes(stem_path, tuning=tuning)

    progress('arranging', 0.85)
    tempo, grid = beat_grid(mix, duration, notes)
    events = quantize(notes, grid)
    events, grid = trim_leading_measures(events, grid)
    assign_fingerings(events, tuning)

    measures = build_measures(events, grid)
    tabs = [
        {
            'time': ev['time'],
            'slot': ev['slot'],
            'measure': ev['slot'] // SLOTS_PER_MEASURE,
            'position': ev['slot'] % SLOTS_PER_MEASURE,
            'duration': ev['duration'],
            'notes': {str(5 - s): f for s, f in ev['fingering']},
            'slides': {str(5 - s): d for s, d in ev.get('slides', {}).items()},
            'velocities': _velocities(ev, tuning['open_strings']),
        }
        for ev in events if ev['fingering']
    ]

    progress('rendering', 0.95)
    write_midi(events, tempo, os.path.join(job_dir, 'transcription.mid'), tuning)
    with open(os.path.join(job_dir, 'tab.txt'), 'w') as f:
        f.write(render_ascii_tab(tabs, len(measures), tempo, tuning))

    return {
        'duration': duration,
        'tempo': round(tempo, 1),
        'time_signature': [BEATS_PER_MEASURE, 4],
        'slots_per_measure': SLOTS_PER_MEASURE,
        'measures': measures,
        'tabs': tabs,
        'note_count': sum(len(t['notes']) for t in tabs),
        'slide_count': sum(len(t['slides']) for t in tabs),
        'stem': stem_used,
        'tuning': {k: tuning[k] for k in ('id', 'name', 'capo', 'labels', 'notes', 'open_strings')},
    }


def decode_audio(source_path, job_dir):
    """Normalise any input into a 44.1k stereo wav for analysis and an mp3 for playback."""
    mix_path = os.path.join(job_dir, 'mix.wav')
    cmd = [
        'ffmpeg', '-y', '-v', 'error', '-i', source_path, '-vn', '-t', str(MAX_DURATION_S),
        '-ac', '2', '-ar', str(MIX_SR), mix_path,
        '-ac', '2', '-ar', str(MIX_SR), '-b:a', '160k', os.path.join(job_dir, 'original.mp3'),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except FileNotFoundError:
        raise ProcessingError("ffmpeg is not installed (brew install ffmpeg).")
    except subprocess.CalledProcessError as e:
        raise ProcessingError(f"Could not decode audio: {e.stderr.strip()[-300:]}")
    return mix_path


def isolate_guitar(mix_path):
    """Return (mono signal at SR, stem description) using Demucs 6-stem separation."""
    import torch
    from demucs.apply import apply_model

    model = _get_demucs()
    wav, _ = sf.read(mix_path, dtype='float32', always_2d=True)
    wav = torch.from_numpy(wav.T.copy())
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    wav = (wav - mean) / std

    devices = (['mps'] if torch.backends.mps.is_available() else []) + ['cpu']
    for device in devices:
        try:
            with torch.no_grad():
                out = apply_model(model, wav[None], device=device, split=True, overlap=0.25, progress=False)[0]
            break
        except Exception as e:  # MPS lacks some ops on older torch builds
            if device == devices[-1]:
                raise
            log.warning("Demucs failed on %s (%s); retrying on cpu", device, e)

    out = (out * std + mean).cpu().numpy().mean(axis=1)  # (sources, samples) mono
    stems = dict(zip(model.sources, out))
    rms = {k: float(np.sqrt(np.mean(v ** 2))) for k, v in stems.items()}
    log.info("Stem RMS: %s", {k: round(v, 4) for k, v in rms.items()})

    # If Demucs found real guitar, use it; otherwise fall back to every pitched,
    # non-vocal, non-bass stem (e.g. a piano- or synth-led song).
    if rms['guitar'] >= 0.3 * max(rms['other'], rms['piano'], 1e-6):
        signal, desc = stems['guitar'], 'guitar'
    else:
        signal, desc = stems['guitar'] + stems['other'] + stems['piano'], 'guitar + other instruments'

    return librosa.resample(signal, orig_sr=MIX_SR, target_sr=SR), desc


def detect_notes(stem_path, onset_threshold=0.7, tuning=None):
    tuning = tuning or resolve_tuning()
    from basic_pitch.inference import predict

    model_output, _, note_events = predict(
        stem_path,
        _get_basic_pitch(),
        onset_threshold=onset_threshold,
        frame_threshold=0.3,
        minimum_note_length=80,
        minimum_frequency=librosa.midi_to_hz(tuning['low'] - 0.5),
        maximum_frequency=librosa.midi_to_hz(tuning['high'] + 0.5),
        multiple_pitch_bends=False,
        melodia_trick=True,
    )
    frame_times = _frame_times(model_output['onset'].shape[0])
    notes = clean_notes(note_events, model_output['onset'], tuning['low'], tuning['high'], frame_times)
    detect_slides(notes, model_output['contour'], frame_times)
    return notes


def _frame_times(n_frames):
    """Timestamp of each basic-pitch output frame.

    basic-pitch analyses audio in overlapping ~2 s windows, so its frames are
    not evenly spaced at BP_FPS: they fall ~10 ms further behind per window.
    Converting time -> frame with a flat rate is off by ~1 s three minutes into
    a song, which made real notes look like they had no attack.
    """
    from basic_pitch.note_creation import model_frames_to_time
    return model_frames_to_time(n_frames)


def _frame_at(frame_times, t):
    return int(np.clip(np.searchsorted(frame_times, t), 0, len(frame_times) - 1))


# ---------------------------------------------------------------------------
# Slides
# ---------------------------------------------------------------------------

def _contour_bin(midi):
    # basic-pitch contour: 3 bins per semitone from A0 (MIDI 21); the middle bin is the semitone centre
    return (midi - BP_MIDI_OFFSET) * CONTOUR_BINS_PER_SEMITONE + 1


def glide_features(contour, a, b, frame_times):
    """Describe the pitch movement between note a and the following note b.

    Counts frames where the strongest pitch is strictly *between* the two notes
    (at least SLIDE_MID_RATIO as loud as either endpoint). When one note simply
    stops and another starts (re-pick, hammer-on, legato fingering) the
    endpoints always dominate; during a slide the pitch really passes through
    the frets in between, in order.
    Returns (frames, span, direction_corr).
    """
    b_a, b_b = _contour_bin(a['pitch']), _contour_bin(b['pitch'])
    lo, hi = sorted((b_a, b_b))
    if hi - lo < 6:  # needs at least 2 semitones
        return 0, 0.0, 0.0
    f0 = _frame_at(frame_times, max(a['start'] + 0.05, b['start'] - SLIDE_LOOKBACK))
    f1 = _frame_at(frame_times, b['start'] + SLIDE_LOOKAHEAD)
    if f1 <= f0:
        return 0, 0.0, 0.0

    window = contour[f0:f1]
    mid = window[:, lo + 2:hi - 1]  # skip the bins bordering each endpoint
    ends = np.maximum(window[:, lo - 1:lo + 2].max(axis=1), window[:, hi - 1:hi + 2].max(axis=1))
    peak = mid.max(axis=1)
    gliding = (peak >= SLIDE_MIN_SALIENCE) & (peak >= SLIDE_MID_RATIO * ends)
    frames = np.nonzero(gliding)[0]
    if frames.size == 0:
        return 0, 0.0, 0.0

    pos = mid.argmax(axis=1)[gliding]
    span = (np.ptp(pos) + 1) / mid.shape[1]
    corr = 0.0
    if frames.size >= 2 and np.ptp(pos):
        corr = float(np.corrcoef(frames, pos)[0, 1]) * (1 if b_b > b_a else -1)
    return int(frames.size), float(span), corr


def detect_slides(notes, contour, frame_times):
    """Mark notes reached by sliding: n['slide_from'] = pitch slid from."""
    candidates = []
    for b in notes:
        for a in notes:
            interval = abs(b['pitch'] - a['pitch'])
            legato = -SLIDE_MAX_OVERLAP <= b['start'] - a['end'] <= SLIDE_MAX_GAP
            if a is b or not legato or a['start'] > b['start'] - 0.05 or not 2 <= interval <= SLIDE_MAX_INTERVAL:
                continue
            frames, span, corr = glide_features(contour, a, b, frame_times)
            if frames >= SLIDE_MIN_FRAMES and span >= SLIDE_MIN_SPAN and corr >= SLIDE_MIN_CORR:
                candidates.append((interval, -span, id(a), id(b), a, b))

    # One source per target and vice versa; prefer the smallest interval so a
    # power-chord slide pairs root->root and fifth->fifth, not root->fifth.
    used_a, used_b = set(), set()
    for _, _, ia, ib, a, b in sorted(candidates, key=lambda c: c[:2]):
        if ia in used_a or ib in used_b:
            continue
        used_a.add(ia)
        used_b.add(ib)
        b['slide_from'] = a['pitch']


def clean_notes(note_events, onset_probs, low=OPEN_STRINGS[0], high=OPEN_STRINGS[-1] + MAX_FRET, frame_times=None):
    if frame_times is None:
        frame_times = _frame_times(len(onset_probs))
    notes = [
        {'start': float(s), 'end': float(e), 'pitch': int(p), 'amp': float(a)}
        for s, e, p, a, _ in note_events
        if low <= p <= high
    ]

    def onset_strength(n):
        col = n['pitch'] - BP_MIDI_OFFSET
        frame = _frame_at(frame_times, n['start'])
        lo, hi = max(0, frame - 2), min(len(onset_probs), frame + 3)
        return float(onset_probs[lo:hi, col].max()) if hi > lo else 0.0

    # basic-pitch sometimes splits one sustained note in two; merge a note into
    # its same-pitch predecessor when there's no real attack at the join.
    # A ringing string also tends to "re-trigger" when a neighbouring string is
    # plucked (arpeggios), so a weak re-attack that coincides with a genuinely
    # new pitch is treated as the same note too.
    notes.sort(key=lambda n: (n['pitch'], n['start']))
    prev_of = {}
    for i, n in enumerate(notes):
        if i and notes[i - 1]['pitch'] == n['pitch'] and n['start'] - notes[i - 1]['end'] < 0.06:
            prev_of[i] = i - 1
    fresh_starts = np.array(sorted(n['start'] for i, n in enumerate(notes) if i not in prev_of))

    def coincides_with_new_note(n):
        return fresh_starts.size and np.min(np.abs(fresh_starts - n['start'])) < 0.04

    merged, target = [], {}
    for i, n in enumerate(notes):
        j = prev_of.get(i)
        if j is not None:
            prev = target[j]
            weak = onset_strength(n) < 0.6 or (coincides_with_new_note(n) and n['amp'] < 0.9 * prev['amp'])
            if weak:
                prev['end'] = max(prev['end'], n['end'])
                target[i] = prev
                continue
        merged.append(n)
        target[i] = n

    # Drop overtone ghosts: a quiet note on the 2nd-6th harmonic
    # above a louder note that covers it. Notes struck together with the lower
    # note need to be much quieter to count, since real chords contain octaves.
    kept = []
    for n in merged:
        ghost = any(
            n['pitch'] - m['pitch'] in (12, 19, 24, 28, 31)
            and m['start'] <= n['start'] + 0.03
            and (
                # starts later, while the lower note is ringing
                (n['amp'] < 0.6 * m['amp'] and n['start'] - m['start'] > 0.05 and m['end'] >= n['end'] - 0.05)
                # or starts with it but is quieter and dies first (a real
                # octave in a chord rings as long as the root)
                or (n['amp'] < 0.75 * m['amp'] and n['end'] <= m['end'] + 0.02)
            )
            for m in merged
        )
        if not ghost:
            kept.append(n)

    kept.sort(key=lambda n: (n['start'], n['pitch']))
    return kept


# ---------------------------------------------------------------------------
# Rhythm
# ---------------------------------------------------------------------------

def _extend_beats(beats, ibi, duration):
    beats = list(beats)
    while beats[0] > ibi / SLOTS_PER_BEAT / 2:
        beats.insert(0, beats[0] - ibi)
    while beats[-1] < duration + ibi:
        beats.append(beats[-1] + ibi)
    return beats


def _subdivide(beats):
    grid = []
    for a, b in zip(beats[:-1], beats[1:]):
        grid.extend(np.linspace(a, b, SLOTS_PER_BEAT, endpoint=False))
    grid.append(beats[-1])
    return np.array(grid)


def _snap(times, grid):
    idx = np.clip(np.searchsorted(grid, times), 1, len(grid) - 1)
    left = grid[idx - 1]
    return np.where(np.abs(times - left) <= np.abs(grid[idx] - times), idx - 1, idx)


def beat_grid(mix, duration, notes):
    """Return (tempo_bpm, 16th-note grid times) with slot 0 on a downbeat."""
    tempo, beats = librosa.beat.beat_track(y=mix, sr=SR, units='time')
    tempo = float(np.atleast_1d(tempo)[0])
    if len(beats) < 4 or tempo <= 0:
        tempo = 120.0
        beats = np.arange(0.0, duration, 0.5)
    ibi = float(np.median(np.diff(beats)))
    beats = _extend_beats(beats, ibi, duration)

    # Guess the downbeat: the beat phase where strong, low notes land most.
    if notes:
        grid = _subdivide(beats)
        slots = _snap(np.array([n['start'] for n in notes]), grid)
        weight = np.array([n['amp'] * (1.5 if n['pitch'] < 52 else 1.0) for n in notes])
        on_beat = slots % SLOTS_PER_BEAT == 0
        beat_idx = slots // SLOTS_PER_BEAT
        scores = [weight[on_beat & (beat_idx % BEATS_PER_MEASURE == p)].sum() for p in range(BEATS_PER_MEASURE)]
        phase = int(np.argmax(scores))
        for _ in range((BEATS_PER_MEASURE - phase) % BEATS_PER_MEASURE):
            beats.insert(0, beats[0] - ibi)

    return tempo, _subdivide(beats)


def quantize(notes, grid):
    """Group notes into chord events on the 16th grid."""
    if not notes:
        return []
    starts = _snap(np.array([n['start'] for n in notes]), grid)
    ends = _snap(np.array([n['end'] for n in notes]), grid)

    by_slot = {}
    for n, s, e in zip(notes, starts, ends):
        bucket = by_slot.setdefault(int(s), {})
        dur = max(1, int(e) - int(s))
        if n['pitch'] not in bucket or bucket[n['pitch']]['amp'] < n['amp']:
            bucket[n['pitch']] = {**n, 'dur_slots': dur}

    events = []
    for slot in sorted(by_slot):
        chord = sorted(by_slot[slot].values(), key=lambda n: -n['amp'])[:6]
        dur_slots = max(n['dur_slots'] for n in chord)
        end_slot = min(slot + dur_slots, len(grid) - 1)
        events.append({
            'slot': slot,
            'time': float(grid[slot]),
            'duration': float(grid[end_slot] - grid[slot]),
            'dur_slots': dur_slots,
            'notes': chord,  # sorted loudest first
        })
    return events


def trim_leading_measures(events, grid):
    """Drop whole empty measures before the first note."""
    if not events:
        return events, grid
    shift = (events[0]['slot'] // SLOTS_PER_MEASURE) * SLOTS_PER_MEASURE
    for ev in events:
        ev['slot'] -= shift
    return events, grid[shift:]


# ---------------------------------------------------------------------------
# Fingering: pick string/fret for every note, globally, via Viterbi
# ---------------------------------------------------------------------------

def _candidates(pitches, open_strings, max_fret):
    results = []

    def rec(i, used, assign, lo, hi):
        if i == len(pitches):
            results.append(tuple(assign))
            return
        for s, open_pitch in enumerate(open_strings):
            fret = pitches[i] - open_pitch
            if s in used or not 0 <= fret <= max_fret:
                continue
            nlo, nhi = (min(lo, fret), max(hi, fret)) if fret > 0 else (lo, hi)
            if fret > 0 and nhi - nlo > MAX_SPAN:
                continue
            rec(i + 1, used | {s}, assign + [(s, fret)], nlo, nhi)

    rec(0, frozenset(), [], 99, -1)
    return results


def _hand_position(fingering):
    fretted = [f for _, f in fingering if f > 0]
    return min(fretted) if fretted else None


def _static_cost(fingering):
    fretted = [f for _, f in fingering if f > 0]
    cost = 0.0
    if fretted:
        cost += 0.5 * (max(fretted) - min(fretted))
        cost += 0.08 * max(fretted)
        cost += 0.3 * max(0, max(fretted) - 12)
    if len(fingering) > 1:
        strings = sorted(s for s, _ in fingering)
        cost += 0.7 * ((strings[-1] - strings[0] + 1) - len(strings))  # muted strings inside a chord
    return cost


def _transition_cost(a, b, gap, slides=(), open_strings=OPEN_STRINGS):
    pa, pb = _hand_position(a), _hand_position(b)
    move = abs(pa - pb) if pa is not None and pb is not None else 0.0
    cost = 0.6 * move / (1.0 + 2.0 * gap)  # shifting is easier with more time
    if len(a) == 1 and len(b) == 1:
        cost += 0.15 * abs(a[0][0] - b[0][0])
    if slides:
        # A slide only works if both notes are on the same string; moving
        # along the string is what the slide itself does, so don't charge for it.
        a_strings = {open_strings[s] + f: s for s, f in a}
        b_strings = {open_strings[s] + f: s for s, f in b}
        for from_pitch, to_pitch in slides:
            if from_pitch in a_strings and a_strings[from_pitch] == b_strings.get(to_pitch):
                cost -= 0.6 * move / (1.0 + 2.0 * gap) / len(slides)
            else:
                cost += SLIDE_STRING_PENALTY
    return cost


def assign_fingerings(events, tuning, max_candidates=60):
    """Set ev['fingering'] = tuple of (string_idx, fret) for every event."""
    options = []
    for ev in events:
        chord = list(ev['notes'])
        cands = []
        while chord and not cands:
            cands = _candidates([n['pitch'] for n in chord], tuning['open_strings'], tuning['max_fret'])
            if not cands:
                chord.pop()  # unplayable: drop the quietest note and retry
        ev['notes'] = chord
        cands.sort(key=_static_cost)
        options.append(cands[:max_candidates] or [()])

    if not events:
        return

    costs = [np.array([_static_cost(c) for c in options[0]])]
    back = []
    for i in range(1, len(events)):
        gap = max(0.0, events[i]['time'] - events[i - 1]['time'] - events[i - 1]['duration'])
        static = np.array([_static_cost(c) for c in options[i]])
        slides = [(n['slide_from'], n['pitch']) for n in events[i]['notes'] if 'slide_from' in n]
        trans = np.array([[_transition_cost(a, b, gap, slides, tuning['open_strings']) for a in options[i - 1]]
                          for b in options[i]])
        total = trans + costs[-1][None, :]
        back.append(total.argmin(axis=1))
        costs.append(total.min(axis=1) + static)

    choice = int(costs[-1].argmin())
    for i in range(len(events) - 1, -1, -1):
        events[i]['fingering'] = options[i][choice]
        if i > 0:
            choice = int(back[i - 1][choice])
    link_slides(events, tuning['open_strings'])


def link_slides(events, open_strings):
    """Set ev['slides'] = {string: 'up' | 'down'} where a detected slide ended up
    playable: the source note is on the same string in the previous event."""
    for prev, ev in zip(events, events[1:]):
        ev['slides'] = {}
        prev_frets = dict(prev['fingering'])
        for n in ev['notes']:
            if 'slide_from' not in n:
                continue
            for string, fret in ev['fingering']:
                if open_strings[string] + fret == n['pitch'] and prev_frets.get(string) == n['slide_from'] - open_strings[string]:
                    ev['slides'][string] = 'up' if n['pitch'] > n['slide_from'] else 'down'
    if events:
        events[0]['slides'] = {}


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

def build_measures(events, grid):
    last_slot = max((ev['slot'] + 1 for ev in events), default=SLOTS_PER_MEASURE)
    count = max(1, -(-last_slot // SLOTS_PER_MEASURE))
    count = min(count, (len(grid) - 1) // SLOTS_PER_MEASURE + 1)
    measures = []
    for m in range(count):
        a = m * SLOTS_PER_MEASURE
        b = min((m + 1) * SLOTS_PER_MEASURE, len(grid) - 1)
        measures.append({'index': m, 'start': float(grid[min(a, len(grid) - 1)]), 'end': float(grid[b])})
    return measures


SLIDE_MARKS = {'up': '/', 'down': '\\'}


def render_ascii_tab(tabs, num_measures, tempo, tuning, measures_per_line=4):
    names = tuning['labels']
    label_width = max(len(n) for n in names)
    cells = [[[None] * 6 for _ in range(SLOTS_PER_MEASURE)] for _ in range(num_measures)]
    for t in tabs:
        if t['measure'] < num_measures:
            for s, fret in t['notes'].items():
                cells[t['measure']][t['position']][int(s)] = SLIDE_MARKS.get(t['slides'].get(s), '') + str(fret)

    capo = f"   Capo: fret {tuning['capo']}" if tuning['capo'] else ''
    out = [f"Tempo: ~{round(tempo)} BPM   Time: 4/4   Tuning: {tuning['name']} ({tuning['notes']}){capo}"]
    if any(t['slides'] for t in tabs):
        out.append("/ = slide up   \\ = slide down")
    out.append("")
    for start in range(0, num_measures, measures_per_line):
        rows = [f"{n.ljust(label_width)}|" for n in names]
        for m in range(start, min(start + measures_per_line, num_measures)):
            for slot in cells[m]:
                width = max([len(f) for f in slot if f is not None] + [1]) + 1
                for r in range(6):
                    val = slot[r] or ''
                    rows[r] += val + '-' * (width - len(val))
            rows = [row + '|' for row in rows]
        out.extend(rows)
        out.append('')
    return '\n'.join(out)


def _velocities(ev, open_strings):
    """Per-string loudness 0..1 (visual string index -> amplitude) for playback."""
    amps = {n['pitch']: n['amp'] for n in ev['notes']}
    return {str(5 - s): round(amps.get(open_strings[s] + f, 0.6), 2) for s, f in ev['fingering']}


def write_midi(events, tempo, path, tuning):
    import pretty_midi

    pm = pretty_midi.PrettyMIDI(initial_tempo=tempo)
    guitar = pretty_midi.Instrument(program=25, name='Guitar')
    for ev in events:
        amps = {n['pitch']: n['amp'] for n in ev['notes']}
        for string, fret in ev['fingering']:
            pitch = tuning['open_strings'][string] + fret
            velocity = int(np.clip(40 + amps.get(pitch, 0.5) * 87, 1, 127))
            guitar.notes.append(pretty_midi.Note(
                velocity=velocity, pitch=pitch, start=ev['time'], end=ev['time'] + max(ev['duration'], 0.05)))
    pm.instruments.append(guitar)
    pm.write(path)
