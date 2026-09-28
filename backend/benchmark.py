"""
Accuracy benchmark for the transcription pipeline.

    .venv/bin/python benchmark.py            # run with current settings
    .venv/bin/python benchmark.py --sweep    # try several onset thresholds

Cases:
  * scale   - a real classical guitar playing E major, E2 -> E5 -> E2
              (CC-licensed recording from Wikimedia Commons, downloaded once)
  * synth-* - Karplus-Strong guitar clips with exact ground truth

Reports note precision / recall / F1. A detected note counts as correct when
its pitch matches and its onset is within 60 ms (synthetic cases), or by
in-order sequence alignment (scale case, where exact timings are unknown).
"""
import argparse
import os
import tempfile

import librosa
import numpy as np
import soundfile as sf

import audio_processor as ap
from sources import download_audio

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.benchmark_cache')
SCALE_URL = 'https://commons.wikimedia.org/wiki/File:Classical_guitar_scale.ogg'
E_MAJOR = [0, 2, 4, 5, 7, 9, 11]


def karplus_strong(midi, dur, sr=ap.SR, seed=0):
    rng = np.random.default_rng(seed + midi)
    period = int(round(sr / librosa.midi_to_hz(midi)))
    buf = rng.uniform(-1, 1, period)
    out = np.empty(int(dur * sr))
    for i in range(len(out)):
        j = i % period
        out[i] = buf[j]
        buf[j] = 0.996 * 0.5 * (buf[j] + buf[(i + 1) % period])
    return out


def render(events, total, sr=ap.SR):
    y = np.zeros(int(total * sr))
    for t, pitches, dur in events:
        for k, p in enumerate(pitches):
            start = int((t + 0.012 * k) * sr)  # slight strum
            tone = karplus_strong(p, dur)
            y[start:start + len(tone)] += tone[:len(y) - start]
    return y / (np.abs(y).max() * 1.2)


def synthetic_cases():
    beat = 0.5
    melody = [(i * beat / 2, [p], beat / 2) for i, p in enumerate([52, 55, 57, 59, 62, 64, 62, 59, 57, 55, 52, 50, 52])]
    chords = [
        (0.0, [40, 47, 52, 56, 59, 64], 1.0),  # E
        (1.0, [45, 52, 57, 61, 64], 1.0),  # A
        (2.0, [50, 57, 62, 66], 1.0),  # D
        (3.0, [43, 47, 50, 55, 59, 67], 1.0),  # G
    ]
    arpeggio = [(i * 0.25, [p], 1.0) for i, p in enumerate([45, 52, 57, 60, 64, 60, 57, 52] * 2)]
    return {
        'synth-melody': (melody, 7.5),
        'synth-chords': (chords, 5.0),
        'synth-arpeggio': (arpeggio, 5.5),
    }


def detected_notes(tabs):
    notes = []
    for t in tabs:
        for s, fret in t['notes'].items():
            notes.append((t['time'], ap.OPEN_STRINGS[5 - int(s)] + fret))
    return sorted(notes)


def score_timed(detected, truth, tol=0.06):
    used, hits = set(), 0
    for t, p in detected:
        for i, (tt, tp) in enumerate(truth):
            if i not in used and tp == p and abs(tt - t) <= tol:
                used.add(i)
                hits += 1
                break
    return hits


def score_sequence(detected, truth):
    a, b = [p for _, p in detected], truth
    dp = np.zeros((len(a) + 1, len(b) + 1), dtype=int)
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            dp[i, j] = dp[i - 1, j - 1] + 1 if a[i - 1] == b[j - 1] else max(dp[i - 1, j], dp[i, j - 1])
    return int(dp[-1, -1])


def report(name, hits, n_det, n_true):
    p = hits / n_det if n_det else 0
    r = hits / n_true if n_true else 0
    f = 2 * p * r / (p + r) if p + r else 0
    print(f"  {name:16s} precision {p:5.1%}  recall {r:5.1%}  F1 {f:5.1%}   ({hits}/{n_true} found, {n_det - hits} extra)")
    return f


def run(onset_threshold, workdir):
    original = ap.detect_notes
    ap.detect_notes = lambda path: original(path, onset_threshold=onset_threshold)
    scores = []
    try:
        os.makedirs(CACHE, exist_ok=True)
        scale_src = next((os.path.join(CACHE, f) for f in os.listdir(CACHE) if f.startswith('source.')), None)
        if not scale_src:
            scale_src, _ = download_audio(SCALE_URL, CACHE)
        up = [40 + 12 * o + d for o in range(3) for d in E_MAJOR] + [76]
        truth = up + up[-2::-1]
        job = os.path.join(workdir, 'scale')
        os.makedirs(job, exist_ok=True)
        det = detected_notes(ap.transcribe(scale_src, job, separate=False)['tabs'])
        scores.append(report('scale (real)', score_sequence(det, truth), len(det), len(truth)))

        for name, (events, total) in synthetic_cases().items():
            job = os.path.join(workdir, name)
            os.makedirs(job, exist_ok=True)
            path = os.path.join(job, 'input.wav')
            sf.write(path, render(events, total), ap.SR)
            truth = [(t + 0.012 * k, p) for t, ps, _ in events for k, p in enumerate(ps)]
            result = ap.transcribe(path, job, separate=False)
            # quantisation moves onsets by up to half a 16th note
            tol = max(0.06, 60 / result['tempo'] / ap.SLOTS_PER_BEAT / 2 + 0.02)
            det = detected_notes(result['tabs'])
            scores.append(report(name, score_timed(det, truth, tol), len(det), len(truth)))
    finally:
        ap.detect_notes = original
    print(f"  {'mean F1':16s} {np.mean(scores):.1%}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sweep', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        for th in ([0.5, 0.6, 0.7, 0.8] if args.sweep else [0.7]):
            print(f"onset_threshold={th}")
            run(th, tmp)
