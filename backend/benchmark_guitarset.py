"""
Accuracy benchmark on GuitarSet (Xi et al., ISMIR 2018), mono microphone audio.

    .venv/bin/python benchmark_guitarset.py              # val sweep, then one test run
    .venv/bin/python benchmark_guitarset.py --jobs 6     # more parallel workers

Data: GuitarSet 1.1.0 from Zenodo (record 3371780): annotation.zip and
audio_mono-mic.zip, unzipped into .benchmark_cache/guitarset/. Annotations are
per-string note_midi tracks recorded with a hexaphonic pickup and corrected by
hand, so they give pitch, timing *and* string for every note.

Protocol:
  * 360 recordings -> fixed-seed random split: 20 validation, 60 test clips.
  * Every clip runs through the real pipeline, ap.transcribe(separate=False):
    basic-pitch -> beat grid / 16th quantisation -> Viterbi fingering.
  * The onset threshold is chosen on the validation clips only (by mean
    onset-only F1 of the tab output); the test clips are scored once with it.

Metrics (mir_eval.transcription, standard tolerances):
  * onset-only F1: pitch within 50 cents, onset within 50 ms
  * onset+offset F1: as above, plus offset within max(50 ms, 20% of duration)
  * fingering: of the notes matched onset-only, how many are on the annotated
    string (same pitch + same string = same fret) vs. a different string
Scored on the final tab output (what the user sees, quantised to the grid),
plus basic-pitch's notes before quantisation as a diagnostic.
"""
import argparse
import glob
import json
import os
import tempfile
from concurrent.futures import ProcessPoolExecutor

import librosa
import mir_eval
import numpy as np

import audio_processor as ap

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '.benchmark_cache', 'guitarset')
THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]


def track_ids(data):
    return sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(data, 'annotation', '*.jams')))


def split(ids, seed, n_val, n_test):
    order = np.random.default_rng(seed).permutation(len(ids))
    return [ids[i] for i in order[:n_val]], [ids[i] for i in order[n_val:n_val + n_test]]


def load_reference(data, tid):
    """Annotated notes as (onset, offset, midi, string) with string 0 = low E."""
    with open(os.path.join(data, 'annotation', tid + '.jams')) as f:
        jam = json.load(f)
    notes = []
    for ann in jam['annotations']:
        if ann['namespace'] != 'note_midi':
            continue
        string = int(ann['annotation_metadata']['data_source'])
        for obs in ann['data']:
            if obs['duration'] > 0:
                notes.append((obs['time'], obs['time'] + obs['duration'], float(obs['value']), string))
    return sorted(notes)


def run_clip(task):
    """Transcribe one clip at one threshold, caching the result as JSON."""
    data, tid, th = task
    out = os.path.join(data, 'runs', f'th{th}', tid + '.json')
    if os.path.exists(out):
        return out
    original = ap.detect_notes
    raw = []

    def patched(path, **kw):
        notes = original(path, onset_threshold=th, **kw)
        raw.extend((n['start'], n['end'], int(n['pitch'])) for n in notes)
        return notes

    ap.detect_notes = patched
    try:
        with tempfile.TemporaryDirectory() as job:
            result = ap.transcribe(os.path.join(data, 'audio_mono-mic', tid + '_mic.wav'), job, separate=False)
    finally:
        ap.detect_notes = original
    tab = [(t['time'], t['time'] + max(t['duration'], 1e-3), ap.OPEN_STRINGS[5 - int(s)] + fret, 5 - int(s))
           for t in result['tabs'] for s, fret in t['notes'].items()]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        json.dump({'tab': sorted(tab), 'raw': sorted(raw), 'tempo': result['tempo']}, f)
    return out


def _arrays(notes):
    if not notes:
        return np.zeros((0, 2)), np.zeros(0)
    a = np.array([n[:3] for n in notes], dtype=float)
    return a[:, :2], librosa.midi_to_hz(a[:, 2])


def score_clip(ref, est):
    """Hit counts for one clip; est/ref are (onset, offset, midi[, string]) lists."""
    ri, rp = _arrays(ref)
    ei, ep = _arrays(est)
    onset = mir_eval.transcription.match_notes(ri, rp, ei, ep, offset_ratio=None)
    both = mir_eval.transcription.match_notes(ri, rp, ei, ep)
    c = {'ref': len(ref), 'est': len(est), 'onset_hits': len(onset), 'offset_hits': len(both)}
    if not est or len(est[0]) > 3:
        c['same_string'] = sum(ref[r][3] == est[e][3] for r, e in onset)
    return c


def prf(hits, n_est, n_ref):
    p = hits / n_est if n_est else 0.0
    r = hits / n_ref if n_ref else 0.0
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)


def summarise(per_clip, key):
    """Mean of per-clip scores (MIREX style) and pooled over all notes."""
    per = np.array([prf(c[key], c['est'], c['ref']) for c in per_clip])
    pooled = prf(sum(c[key] for c in per_clip), sum(c['est'] for c in per_clip), sum(c['ref'] for c in per_clip))
    return per.mean(axis=0), pooled


def evaluate(data, ids, th, jobs, which='tab'):
    with ProcessPoolExecutor(jobs) as pool:
        paths = list(pool.map(run_clip, [(data, tid, th) for tid in ids]))
    per_clip = []
    for tid, path in zip(ids, paths):
        with open(path) as f:
            est = [tuple(n) for n in json.load(f)[which]]
        per_clip.append(score_clip(load_reference(data, tid), est))
    return per_clip


def print_report(label, per_clip, fingering=True):
    n_ref, n_est = sum(c['ref'] for c in per_clip), sum(c['est'] for c in per_clip)
    print(f"  {label}: {len(per_clip)} clips, {n_ref} reference notes, {n_est} detected")
    for key, name in [('onset_hits', 'onset-only'), ('offset_hits', 'onset+offset')]:
        (p, r, f), (pp, pr, pf) = summarise(per_clip, key)
        print(f"    {name:13s} mean P {p:5.1%} R {r:5.1%} F1 {f:5.1%}   pooled P {pp:5.1%} R {pr:5.1%} F1 {pf:5.1%}")
    if fingering:
        matched = sum(c['onset_hits'] for c in per_clip)
        same = sum(c['same_string'] for c in per_clip)
        print(f"    fingering     of {matched} onset-matched notes: {same / matched:5.1%} exact string+fret, "
              f"{(matched - same) / matched:5.1%} right pitch, different string "
              f"({same / n_ref:5.1%} of all reference notes exact)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default=DATA)
    parser.add_argument('--seed', type=int, default=0)
    parser.add_argument('--n-val', type=int, default=20)
    parser.add_argument('--n-test', type=int, default=60)
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()

    ids = track_ids(args.data)
    if not ids:
        raise SystemExit(f"No GuitarSet annotations in {args.data}/annotation (see module docstring).")
    val, test = split(ids, args.seed, args.n_val, args.n_test)
    print(f"GuitarSet: {len(ids)} recordings; seed {args.seed}: {len(val)} validation, {len(test)} test")

    print("Validation sweep (onset-only F1, tab output)")
    val_scores = {}
    for th in THRESHOLDS:
        (_, _, f), (_, _, pf) = summarise(evaluate(args.data, val, th, args.jobs), 'onset_hits')
        val_scores[th] = f
        print(f"  onset_threshold={th}: mean F1 {f:5.1%}  pooled F1 {pf:5.1%}")
    best = max(THRESHOLDS, key=lambda th: val_scores[th])
    print(f"Chosen on validation: onset_threshold={best}")
    print_report('validation', evaluate(args.data, val, best, args.jobs))

    print(f"Test (scored once, onset_threshold={best})")
    print_report('tab output', evaluate(args.data, test, best, args.jobs))
    print_report('basic-pitch notes before quantisation (diagnostic)',
                 evaluate(args.data, test, best, args.jobs, which='raw'), fingering=False)
    print(f"Test clips: {' '.join(test)}")


if __name__ == '__main__':
    main()
