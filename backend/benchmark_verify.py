"""
Fit and evaluate the tab verification step (verify.py) on GuitarSet.

  --fit    run the 20 validation clips, label every tab note right/wrong against
           the hand annotations (mir_eval onset match), fit the logistic
           confidence model and print it for pasting into verify.MODEL
  --tune   grid-search verify.REPITCH_RATIO / DROP_BELOW on the validation clips
  --test   score the 60 test clips once: note F1 with and without refinement,
           how well confidence separates right from wrong notes (AUC), and
           calibration (does "70% sure" mean right ~70% of the time?)

Uses the same data, split and onset threshold (0.6) as benchmark_guitarset.py.
"""
import argparse
import glob
import itertools
import json
import logging
import os
import shutil
import tempfile
from concurrent.futures import ProcessPoolExecutor

import mir_eval
import numpy as np

import audio_processor as ap
import benchmark_guitarset as bg
import verify

ONSET_THRESHOLD = 0.6


_CAPTURED = {}
_ORIGINAL = {}


def _patch_once():
    """Worker processes run many clips; wrap the pipeline functions only once."""
    if _ORIGINAL:
        return
    _ORIGINAL['detect'], _ORIGINAL['score'] = ap.detect_notes, verify.score

    def detect(path, **kw):
        kw['onset_threshold'] = ONSET_THRESHOLD
        return _ORIGINAL['detect'](path, **kw)

    def score(events, evidence, stretch, measures, open_strings):
        _CAPTURED.update(events=events, evidence=evidence, stretch=stretch, open_strings=open_strings)
        return _ORIGINAL['score'](events, evidence, stretch, measures, open_strings)

    ap.detect_notes, verify.score = detect, score


def _run(task):
    """Transcribe one clip with the given refinement settings; return per-note rows."""
    data, tid, repitch, drop = task
    logging.disable(logging.WARNING)
    verify.REPITCH_RATIO, verify.DROP_BELOW = repitch, drop
    _patch_once()
    captured = _CAPTURED
    captured.clear()
    tmp = tempfile.mkdtemp()
    try:
        src = glob.glob(os.path.join(data, 'audio_mono-mic', tid + '*'))[0]
        ap.transcribe(src, tmp, separate=False, tuning=ap.resolve_tuning('standard', 0))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    rows = []
    for ev in captured['events']:
        by_pitch = {int(n['pitch']): n for n in ev['notes']}
        for string, fret in ev['fingering']:
            pitch = captured['open_strings'][string] + fret
            n = by_pitch.get(pitch)
            if n is None:
                continue
            feats = verify.note_features(ev['time'], n, len(ev['notes']), captured['evidence'], captured['stretch'])
            rows.append({'onset': ev['time'], 'offset': ev['time'] + max(ev['duration'], 0.05), 'pitch': pitch,
                         'bar': ev['slot'] // ap.SLOTS_PER_MEASURE, **feats})

    # label: does this tab note match a reference note (pitch +-50c, onset +-50ms)?
    ref = bg.load_reference(data, tid)
    ri, rp = bg._arrays(ref)
    if rows:
        ei = np.array([[r['onset'], r['offset']] for r in rows])
        ep = np.array([440 * 2 ** ((r['pitch'] - 69) / 12) for r in rows])
        hits = {e for _, e in mir_eval.transcription.match_notes(ri, rp, ei, ep, offset_ratio=None)}
    else:
        hits = set()
    for i, r in enumerate(rows):
        r['correct'] = i in hits
    return {'tid': tid, 'ref': len(ref), 'rows': rows}


def run_all(data, ids, repitch=None, drop=None, jobs=4):
    with ProcessPoolExecutor(jobs) as pool:
        return list(pool.map(_run, [(data, tid, repitch, drop) for tid in ids]))


def f1(clips):
    vals = []
    for c in clips:
        hits = sum(r['correct'] for r in c['rows'])
        vals.append(2 * hits / max(1, c['ref'] + len(c['rows'])))
    return float(np.mean(vals))


def matrix(clips):
    rows = [r for c in clips for r in c['rows']]
    X = np.array([[r[k] for k in verify.FEATURES] for r in rows])
    y = np.array([r['correct'] for r in rows], dtype=int)
    return X, y


def auc(scores, labels):
    from sklearn.metrics import roc_auc_score
    return float(roc_auc_score(labels, scores)) if 0 < labels.sum() < len(labels) else float('nan')


def confidences(clips):
    return np.array([verify.confidence(r) for c in clips for r in c['rows']])


def fit(data, val, jobs):
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_predict
    from sklearn.preprocessing import StandardScaler

    clips = run_all(data, val, jobs=jobs)
    X, y = matrix(clips)
    scaler = StandardScaler().fit(X)
    Xs = scaler.transform(X)
    model = LogisticRegression(C=1.0, max_iter=1000)
    cv = cross_val_predict(model, Xs, y, cv=5, method='predict_proba')[:, 1]
    model.fit(Xs, y)
    print(f"validation: {len(y)} tab notes, {y.mean():.1%} correct; cross-validated AUC {auc(cv, y):.3f}")
    print("per-feature AUC:", {k: round(auc(X[:, i], y), 3) for i, k in enumerate(verify.FEATURES)})
    fitted = {
        'mean': [round(float(v), 4) for v in scaler.mean_],
        'scale': [round(float(v), 4) for v in scaler.scale_],
        'weights': [round(float(v), 4) for v in model.coef_[0]],
        'bias': round(float(model.intercept_[0]), 4),
    }
    print("MODEL =", json.dumps(fitted))


def tune(data, val, jobs):
    base = f1(run_all(data, val, jobs=jobs))
    print(f"validation mean onset F1, no refinement: {base:.2%}")
    best = (base, None, None)
    for repitch, drop in itertools.product([None, 1.5, 2.0, 3.0], [None, 0.1, 0.15, 0.2, 0.3]):
        if repitch is None and drop is None:
            continue
        score = f1(run_all(data, val, repitch, drop, jobs))
        print(f"  repitch={repitch} drop={drop}: {score:.2%}")
        if score > best[0]:
            best = (score, repitch, drop)
    print(f"best on validation: F1 {best[0]:.2%} with REPITCH_RATIO={best[1]} DROP_BELOW={best[2]}")


def test(data, test_ids, jobs):
    chosen = (verify.REPITCH_RATIO, verify.DROP_BELOW)
    plain = run_all(data, test_ids, None, None, jobs)
    refined = run_all(data, test_ids, *chosen, jobs) if any(v is not None for v in chosen) else plain
    print(f"test mean onset F1: without refinement {f1(plain):.2%} | with refinement {chosen}: {f1(refined):.2%}")

    conf = confidences(refined)
    _, y = matrix(refined)
    print(f"note confidence AUC on test: {auc(conf, y):.3f} ({len(y)} notes, {y.mean():.1%} correct)")
    print("calibration (confidence bucket -> share actually correct):")
    for lo, hi in [(0, .3), (.3, .5), (.5, .7), (.7, .85), (.85, 1.01)]:
        m = (conf >= lo) & (conf < hi)
        if m.any():
            print(f"  {lo:.2f}-{min(hi, 1):.2f}: {m.sum():5d} notes, {y[m].mean():5.1%} correct (mean confidence {conf[m].mean():.2f})")

    # whole-tab score vs. actual precision, per clip
    pred = [np.mean([verify.confidence(r) for r in c['rows']]) for c in refined if c['rows']]
    real = [np.mean([r['correct'] for r in c['rows']]) for c in refined if c['rows']]
    print(f"per-clip overall score vs. real precision: correlation {np.corrcoef(pred, real)[0, 1]:.2f}, "
          f"mean abs error {np.mean(np.abs(np.array(pred) - np.array(real))):.1%}")

    # bars: does a flagged bar really contain more mistakes?
    flagged, ok = [], []
    for c in refined:
        bars = {}
        for r in c['rows']:
            bars.setdefault(r['bar'], []).append(r)
        for rs in bars.values():
            precision = np.mean([r['correct'] for r in rs])
            (flagged if np.mean([verify.confidence(r) for r in rs]) < verify.UNSURE_BAR else ok).append(precision)
    print(f"bars flagged unsure: {len(flagged)} with {np.mean(flagged):.1%} of notes right | "
          f"other bars: {len(ok)} with {np.mean(ok):.1%} right")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['fit', 'tune', 'test'])
    parser.add_argument('--data', default=bg.DATA)
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()
    val, test_ids = bg.split(bg.track_ids(args.data), 0, 20, 60)
    {'fit': lambda: fit(args.data, val, args.jobs),
     'tune': lambda: tune(args.data, val, args.jobs),
     'test': lambda: test(args.data, test_ids, args.jobs)}[args.mode]()


if __name__ == '__main__':
    main()
