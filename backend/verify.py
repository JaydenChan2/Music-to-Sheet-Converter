"""
Verify and refine a finished tab against the audio it came from.

For every note in the tab, look back at the recording around that moment and
measure how well the audio supports it:

  * pitch evidence  - energy at the note (plus overtones) vs. the semitones
                      either side; a stronger neighbour means a wrong pitch
  * presence        - how loud the note is relative to everything else sounding
  * attack          - does energy at that pitch actually rise at the onset?
  * octave check    - a much stronger note an octave below suggests an overtone
  * timing          - how far the note moved to snap onto the grid
  * detector amp    - basic-pitch's own amplitude for the note

A logistic model (fitted on GuitarSet validation clips, see benchmark_verify.py)
turns these into P(note is right). Refinement uses the same evidence to move
notes onto a clearly stronger neighbouring semitone and to drop near-certain
ghosts; fingerings are then re-chosen for the whole piece.
"""
import logging

import librosa
import numpy as np

log = logging.getLogger(__name__)

SLOTS_PER_MEASURE = 16  # matches audio_processor (4/4 on a 16th-note grid)
HOP = 256
BINS_PER_SEMITONE = 3
MIDI_LO, MIDI_HI = 28, 100  # analysis range incl. neighbours and overtones
HARMONIC_WEIGHTS = ((0, 1.0), (12, 0.5), (19, 0.33), (24, 0.25))
WINDOW_S = 0.25  # how much of each note is examined after its onset
PRE_S = 0.06  # look-back for the attack check

FEATURES = ['distinct', 'presence', 'attack', 'octave_below', 'timing', 'amp', 'chord_size', 'height']

# Logistic model P(correct) = sigmoid(BIAS + sum(w * standardised feature)).
# Fitted on the 20 GuitarSet validation clips by benchmark_verify.py --fit.
MODEL = {  # cross-validated AUC 0.842 on 3009 validation notes
    'mean': [1.3027, -4.2753, 0.7181, -2.1714, 0.0308, 0.6325, 2.0794, 0.4408],
    'scale': [0.5982, 5.6736, 0.7013, 1.099, 0.0184, 0.1295, 1.1261, 0.1988],
    'weights': [0.0366, -0.0024, 0.3074, -0.1589, -1.0844, 1.0529, 0.4332, -0.0179],
    'bias': 1.2287,
}

# Refinement thresholds, chosen on the validation clips (benchmark_verify.py --tune).
REPITCH_RATIO = None  # move to a neighbour semitone when it's this many times stronger (None = off;
                      # it gave no gain on GuitarSet, where off-pitch audio is handled by the retune step)
DROP_BELOW = 0.4  # drop notes with P(correct) below this (validation F1 69.7% -> 72.3%; 0.45 peaked
                 # at 72.4%, but real songs differ from GuitarSet so this stays a little conservative)

# Flag thresholds, chosen on validation: notes under 0.6 are right only ~55-60% of the
# time; bars averaging under 0.7 (~8% of bars) have ~60% of notes right vs ~84% elsewhere.
UNSURE_NOTE = 0.6
UNSURE_BAR = 0.7


class Evidence:
    """Per-semitone harmonic salience of the analysed signal over time."""

    def __init__(self, y, sr):
        fmin = librosa.midi_to_hz(MIDI_LO - 1 / BINS_PER_SEMITONE)
        n_bins = (MIDI_HI - MIDI_LO + 1) * BINS_PER_SEMITONE
        C = np.abs(librosa.cqt(y, sr=sr, hop_length=HOP, fmin=fmin, n_bins=n_bins,
                               bins_per_octave=12 * BINS_PER_SEMITONE))
        # one row per semitone: the strongest of its three bins (tolerates slight detuning)
        semis = C.reshape(MIDI_HI - MIDI_LO + 1, BINS_PER_SEMITONE, -1).max(axis=1)
        harm = np.zeros_like(semis)
        for interval, weight in HARMONIC_WEIGHTS:
            harm[: semis.shape[0] - interval] += weight * semis[interval:]
        self.semis, self.harm = semis, harm
        self.frame_max = semis.max(axis=0) + 1e-9
        self.sr = sr
        self.n_frames = semis.shape[1]

    def frames(self, t0, t1):
        a = int(np.clip(np.floor(t0 * self.sr / HOP), 0, self.n_frames - 1))
        b = int(np.clip(np.ceil(t1 * self.sr / HOP), a + 1, self.n_frames))
        return slice(a, b)

    def h(self, midi, sl):
        i = midi - MIDI_LO
        if i < 0 or i >= self.harm.shape[0]:
            return 1e-9
        return float(self.harm[i, sl].mean()) + 1e-9

    def s(self, midi, sl):
        i = midi - MIDI_LO
        if i < 0 or i >= self.semis.shape[0]:
            return 1e-9
        return float(self.semis[i, sl].mean()) + 1e-9


def note_features(ev_time, note, chord_size, ev_audio, stretch):
    """Evidence for one note. Note times are on the original timeline; the
    analysed signal may be time-stretched by the retune step."""
    p = int(note['pitch'])
    t0 = note['start'] / stretch
    t1 = min(note['end'] / stretch, t0 + WINDOW_S)
    win = ev_audio.frames(t0 + 0.01, max(t1, t0 + 0.05))
    pre = ev_audio.frames(t0 - PRE_S, t0)
    here = ev_audio.h(p, win)
    neighbour = max(ev_audio.h(p - 1, win), ev_audio.h(p + 1, win))
    return {
        'distinct': float(np.clip(np.log(here / neighbour), -3, 3)),
        'presence': float(np.clip(20 * np.log10(ev_audio.s(p, win) / ev_audio.frame_max[win].mean()), -60, 0)),
        'attack': float(np.clip(np.log(ev_audio.s(p, win) / ev_audio.s(p, pre)), -3, 3)),
        'octave_below': float(np.clip(np.log(ev_audio.s(p - 12, win) / ev_audio.s(p, win)), -3, 3)),
        'timing': float(min(abs(note['start'] - ev_time), 0.2)),
        'amp': float(note.get('amp', 0.5)),
        'chord_size': float(chord_size),
        'height': (p - 40) / 40,
    }


def confidence(feats):
    x = (np.array([feats[k] for k in FEATURES]) - np.array(MODEL['mean'])) / np.array(MODEL['scale'])
    return float(1 / (1 + np.exp(-(MODEL['bias'] + x @ np.array(MODEL['weights'])))))


def refine(events, ev_audio, stretch, tuning):
    """Correct or drop notes the audio doesn't support.

    Returns (change counts, removed notes). Removed notes keep the string/fret
    they had before refinement, so the user can still see and restore them.
    Fingerings must be re-assigned by the caller afterwards.
    """
    changes = {'repitched': 0, 'removed': 0}
    removed = []
    if REPITCH_RATIO is None and DROP_BELOW is None:
        return changes, removed
    for ev in events:
        if ev.get('video_fingering'):
            continue  # read from the on-screen tab: trust it over the audio evidence
        kept = []
        placed = {tuning['open_strings'][st] + fr: (st, fr) for st, fr in ev.get('fingering', ())}
        pitches = {int(n['pitch']) for n in ev['notes']}
        for n in ev['notes']:
            p = int(n['pitch'])
            if REPITCH_RATIO is not None:
                t0 = n['start'] / stretch
                win = ev_audio.frames(t0 + 0.01, max(min(n['end'] / stretch, t0 + WINDOW_S), t0 + 0.05))
                here = ev_audio.h(p, win)
                best = max((p - 1, p + 1), key=lambda q: ev_audio.h(q, win))
                if (ev_audio.h(best, win) > REPITCH_RATIO * here and best not in pitches
                        and tuning['low'] <= best <= tuning['high']):
                    pitches.discard(p)
                    pitches.add(best)
                    n = {**n, 'pitch': best, 'refined_from': p}
                    n.pop('slide_from', None)
                    changes['repitched'] += 1
            if DROP_BELOW is not None:
                c = confidence(note_features(ev['time'], n, len(ev['notes']), ev_audio, stretch))
                if c < DROP_BELOW:
                    changes['removed'] += 1
                    if int(n['pitch']) in placed:
                        string, fret = placed[int(n['pitch'])]
                        removed.append({'slot': ev['slot'], 'string': string, 'fret': fret, 'confidence': round(c, 2)})
                    continue
            kept.append(n)
        ev['notes'] = kept
    events[:] = [ev for ev in events if ev['notes']]
    return changes, removed


def score(events, ev_audio, stretch, measures, open_strings):
    """Attach per-note confidence and build the report shown to the user."""
    per_measure = {}
    all_conf = []
    for ev in events:
        ev['confidence'] = {}
        by_pitch = {int(n['pitch']): n for n in ev['notes']}
        for string, fret in ev['fingering']:
            n = by_pitch.get(open_strings[string] + fret)
            if n is None:
                continue
            c = confidence(note_features(ev['time'], n, len(ev['notes']), ev_audio, stretch))
            if ev.get('video_fingering'):
                # confirmed by the on-screen tab: as sure as the match itself
                c = max(c, 0.5 + 0.5 * ev.get('video_match', 0.5))
            ev['confidence'][string] = round(c, 2)
            all_conf.append(c)
            per_measure.setdefault(ev['slot'] // SLOTS_PER_MEASURE, []).append(c)

    bars = []
    for m in measures:
        confs = per_measure.get(m['index'], [])
        if not confs:
            continue
        avg = float(np.mean(confs))
        bars.append({'index': m['index'], 'start': m['start'], 'confidence': round(avg, 2),
                     'notes': len(confs), 'unsure_notes': int(sum(c < UNSURE_NOTE for c in confs))})
    overall = float(np.mean(all_conf)) if all_conf else 0.0
    return {
        'overall': round(overall, 2),
        'label': 'high' if overall >= 0.8 else 'medium' if overall >= 0.65 else 'low',
        'unsure_notes': int(sum(c < UNSURE_NOTE for c in all_conf)),
        'total_notes': len(all_conf),
        'bars': bars,
        'flagged_bars': [b['index'] for b in bars if b['confidence'] < UNSURE_BAR],
        'thresholds': {'note': UNSURE_NOTE, 'bar': UNSURE_BAR},
    }
