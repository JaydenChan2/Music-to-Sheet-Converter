"""
Benchmark tabs-on-screen mode with known answers.

GuitarSet annotates every note's string and fret, so we can draw the tab a
play-along video would show (page-flip style: one staff, 4 bars of 2 s per
8-second page, bar numbers, digits knocked out of the lines, H.264-encoded) and
play it over the real recording. Then:

  * reader accuracy  - of the notes drawn, how many does tabvision.read_video
                       read back with the right string and fret?
  * tab accuracy     - final tab vs. annotations (mir_eval onset match), and of
                       matched notes how many sit on the exact string and fret;
                       compared with audio-only song mode on the same clips.

    .venv/bin/python benchmark_tabvideo.py [--clips 12] [--font Helvetica]
"""
import argparse
import glob
import os
import shutil
import subprocess
import tempfile
from concurrent.futures import ProcessPoolExecutor

import mir_eval
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import audio_processor as ap
import benchmark_guitarset as bg
import tabvision

W, H = 1280, 720
PAGE_S = 8.0
BARS_PER_PAGE = 4
STAFF_TOP, SPACING = 540, 22
X0, X1 = 60, 1240
FONTS = {'Helvetica': ('/System/Library/Fonts/Helvetica.ttc', 0),
         'Times': ('/System/Library/Fonts/Times.ttc', 0),
         'Menlo': ('/System/Library/Fonts/Menlo.ttc', 0)}
STANDARD = [40, 45, 50, 55, 59, 64]


def tab_notes(ref, chord_window=0.06):
    """Reference (onset, offset, midi, string) -> (column time, string, fret); strings 0 = low E.

    Strummed chord notes start a few ms apart; tab software draws them as one
    column, so notes within chord_window of a column's first note share its x."""
    out, column = [], None
    for onset, _, midi, string in sorted(ref):
        fret = int(round(midi)) - STANDARD[string]
        if not 0 <= fret <= 24:
            continue
        if column is None or onset - column > chord_window:
            column = onset
        if any(t == column and s == string for t, s, _ in out):
            continue  # one note per string per column
        out.append((column, string, fret))
    return out


def render_page(notes, page, font):
    img = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, STAFF_TOP - 70], fill=70)  # stand-in for the camera picture
    ys = [STAFF_TOP + i * SPACING for i in range(6)]
    for y in ys:
        d.line([(X0, y), (X1, y)], fill=40, width=1)
    bar_w = (X1 - X0) / BARS_PER_PAGE
    for b in range(BARS_PER_PAGE + 1):
        x = round(X0 + b * bar_w)
        d.line([(x, ys[0]), (x, ys[-1])], fill=40, width=2)
        if b < BARS_PER_PAGE:
            d.text((x + 2, ys[0] - 24), str(page * BARS_PER_PAGE + b + 1), font=font, fill=90)
    t0 = page * PAGE_S
    for onset, string, fret in notes:
        if not t0 <= onset < t0 + PAGE_S:
            continue
        x = X0 + 12 + (onset - t0) / PAGE_S * (X1 - X0 - 24)
        y = ys[5 - string]  # top line = high e
        text = str(fret)
        box = d.textbbox((0, 0), text, font=font)
        w, h = box[2] - box[0], box[3] - box[1]
        d.rectangle([x - w / 2 - 2, y - h / 2 - 1, x + w / 2 + 2, y + h / 2 + 1], fill=255)
        d.text((x - w / 2 - box[0], y - h / 2 - box[1]), text, font=font, fill=0)
    return np.array(img)


def render_video(notes, duration, path, font_name):
    font = ImageFont.truetype(*FONTS[font_name][:1], size=17, index=FONTS[font_name][1])
    fps = 10
    pages = [render_page(notes, p, font) for p in range(int(np.ceil(duration / PAGE_S)))]
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{W}x{H}', '-r', str(fps),
           '-i', '-', '-c:v', 'libx264', '-crf', '28', '-pix_fmt', 'yuv420p', path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(int(duration * fps)):
        proc.stdin.write(pages[min(int(i / fps / PAGE_S), len(pages) - 1)].tobytes())
    proc.stdin.close()
    proc.wait()


def reader_accuracy(notes, video_path, duration):
    """Of the drawn notes, the share the frame reader reads back with the right string
    and fret - judged on the middle frame of each page, by position (no bar numbers)."""
    hits = total = 0
    for page in range(int(np.ceil(duration / PAGE_S))):
        t0 = page * PAGE_S
        truth = [(t, s, f) for t, s, f in notes if t0 <= t < t0 + PAGE_S]
        mid = min(t0 + PAGE_S / 2, duration - 0.2)
        frame = next(tabvision.frames(video_path, mid, 0.5), None)
        if frame is None or not truth:
            continue
        read = []
        for m in tabvision.read_frame(frame[1]):
            if not m.box:
                continue
            x0, x1 = m.box[0], m.box[1]
            for rel, cols in m.columns:
                t = t0 + (x0 + rel * (x1 - x0) - X0 - 12) / (X1 - X0 - 24) * PAGE_S
                read += [(t, 5 - int(line), fret) for line, fret in cols.items()]
        total += len(truth)
        hits += sum(any(abs(t - rt) < 0.1 and s == rs and str(f) == rf for rt, rs, rf in read) for t, s, f in truth)
    return hits / max(1, total)


def score(ref, tabs, open_strings):
    est = [(tb['time'], tb['time'] + max(tb['duration'], 0.05), open_strings[5 - int(s)] + f, 5 - int(s))
           for tb in tabs for s, f in tb['notes'].items()]
    if not est:
        return 0.0, 0.0, 0
    ri, rp = bg._arrays(ref)
    ei, ep = bg._arrays(est)
    pairs = mir_eval.transcription.match_notes(ri, rp, ei, ep, offset_ratio=None)
    f1 = 2 * len(pairs) / (len(ref) + len(est))
    exact = sum(ref[r][3] == est[e][3] for r, e in pairs) / max(1, len(pairs))
    return f1, exact, len(pairs)


def run(task):
    data, tid, font = task
    import logging
    logging.disable(logging.WARNING)
    work = tempfile.mkdtemp()
    try:
        audio = glob.glob(os.path.join(data, 'audio_mono-mic', tid + '*'))[0]
        ref = bg.load_reference(data, tid)
        notes = tab_notes(ref)
        duration = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of',
                                         'csv=p=0', audio], capture_output=True, text=True).stdout)
        video = os.path.join(work, 'tab.mp4')
        render_video(notes, duration, video, font)
        out = {}
        for mode in ('song', 'tab'):
            d = os.path.join(work, mode)
            os.makedirs(d)
            r = ap.transcribe(audio, d, separate=False, tuning=ap.resolve_tuning('standard', 0),
                              video_type=mode, video_path=video if mode == 'tab' else None)
            out[mode] = score(ref, r['tabs'], r['tuning']['open_strings'])
            if mode == 'tab':
                out['matched'] = (r['video_tab'] or {}).get('match_rate', 0)
        out['reader'] = reader_accuracy(notes, video, duration)
        return tid, out
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default=bg.DATA)
    parser.add_argument('--clips', type=int, default=12)
    parser.add_argument('--font', default='Helvetica', choices=sorted(FONTS))
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()
    _, test = bg.split(bg.track_ids(args.data), 0, 20, 60)
    clips = test[:args.clips]
    with ProcessPoolExecutor(args.jobs) as pool:
        results = list(pool.map(run, [(args.data, tid, args.font) for tid in clips]))
    print(f"{len(clips)} GuitarSet test clips, tab drawn in {args.font}")
    print(f"{'clip':28s} {'reader':>7s} {'matched':>8s} | {'song F1':>8s} {'exact':>6s} | {'tab F1':>7s} {'exact':>6s}")
    for tid, o in results:
        print(f"{tid:28s} {o['reader']:7.1%} {o['matched']:8.0%} | {o['song'][0]:8.1%} {o['song'][1]:6.1%} | "
              f"{o['tab'][0]:7.1%} {o['tab'][1]:6.1%}")
    mean = lambda f: np.mean([f(o) for _, o in results])
    print(f"{'MEAN':28s} {mean(lambda o: o['reader']):7.1%} {mean(lambda o: o['matched']):8.0%} | "
          f"{mean(lambda o: o['song'][0]):8.1%} {mean(lambda o: o['song'][1]):6.1%} | "
          f"{mean(lambda o: o['tab'][0]):7.1%} {mean(lambda o: o['tab'][1]):6.1%}")


if __name__ == '__main__':
    main()
