"""
Read guitar tablature shown in a video.

  1. find_staves(gray)   - groups of six evenly spaced horizontal lines
  2. find_glyphs(...)    - blobs sitting on a string line (fret numbers)
  3. read_digits(...)    - classify each blob with a small digit model trained
                           on synthetic renders (see digit_model.py)
  4. read_frame(...)     - one frame -> staves -> columns of (string, fret)
  5. read_video(...)     - sample frames, read them, stitch pages/scrolling into
                           one ordered sequence of tab columns with time windows

Both polarities are handled (dark tab on light, light tab on dark). Everything
is local OpenCV + scikit-learn; no paid services.
"""
import logging
from dataclasses import dataclass, field

import cv2
import numpy as np

log = logging.getLogger(__name__)

MIN_SPACING = 6  # px between string lines
MAX_SPACING_FRACTION = 0.03  # of frame width; wider sets of lines are e.g. a real guitar's strings
SPACING_TOLERANCE = 0.18  # max relative deviation of line gaps within one staff
MIN_STAFF_WIDTH = 0.25  # fraction of frame width a staff must span


@dataclass
class Staff:
    ys: list  # y of each string line, top (high e) to bottom (low E)
    x0: int
    x1: int
    spacing: float
    dark_on_light: bool
    bars: list = field(default_factory=list)  # x of bar lines


def _foreground(gray, dark_on_light):
    """Binary mask of ink strokes for the given polarity."""
    mode = cv2.THRESH_BINARY_INV if dark_on_light else cv2.THRESH_BINARY
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, mode, 21, 10 if dark_on_light else -10)


def _line_mask(gray, dark_on_light):
    """Thin horizontal lines, including faint grey ones.

    A black-hat / top-hat with a short vertical kernel picks out anything thinner
    than a few pixels that is darker (lighter) than just above and below it, so
    pale staff lines on white still register. Small gaps (digits knocked out of
    the line) are bridged before keeping only long horizontal runs.
    """
    h, w = gray.shape
    op = cv2.MORPH_BLACKHAT if dark_on_light else cv2.MORPH_TOPHAT
    thin = cv2.morphologyEx(gray, op, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 9)))
    _, b = cv2.threshold(thin, 12, 255, cv2.THRESH_BINARY)
    b = cv2.morphologyEx(b, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (max(9, w // 50), 1)))
    return cv2.morphologyEx(b, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, w // 14), 1)))


def _line_candidates(lines, width):
    """Horizontal line segments -> list of (y, x0, x1, thickness)."""
    rows = np.nonzero(lines.sum(1) > 255 * width * MIN_STAFF_WIDTH * 0.8)[0]
    out = []
    for group in np.split(rows, np.nonzero(np.diff(rows) > 1)[0] + 1):
        if not len(group):
            continue
        band = lines[group[0]:group[-1] + 1]
        cols = np.nonzero(band.max(0))[0]
        out.append((float(group.mean()), int(cols.min()), int(cols.max()), len(group)))
    return out


def _group_staves(cands, width):
    """Pick sets of six evenly spaced lines. Other candidates may sit in between
    (e.g. rows of stacked chord digits look like short lines), so each staff is
    built by stepping from a top line at a fixed spacing and taking the longest
    candidate near each expected position."""
    ys = np.array([c[0] for c in cands])
    spans = np.array([c[2] - c[1] for c in cands])
    found = []
    for i in range(len(cands)):
        for j in range(i + 1, len(cands)):
            spacing = ys[j] - ys[i]
            if spacing > MAX_SPACING_FRACTION * width:
                break
            if spacing < MIN_SPACING:
                continue
            chain = [i, j]
            for k in range(2, 6):
                near = np.nonzero(np.abs(ys - (ys[i] + k * spacing)) <= SPACING_TOLERANCE * spacing)[0]
                if not len(near):
                    break
                chain.append(int(near[np.argmax(spans[near])]))
            if len(chain) < 6:
                continue
            group = [cands[c] for c in chain]
            x0, x1 = int(np.median([g[1] for g in group])), int(np.median([g[2] for g in group]))
            # drawn staff lines start and end together; a real guitar's strings, seen at
            # an angle, break into segments that don't
            if max(abs(g[1] - x0) for g in group) > 3 * spacing or max(abs(g[2] - x1) for g in group) > 3 * spacing:
                continue
            if x1 - x0 < MIN_STAFF_WIDTH * width:
                continue
            line_ys = [g[0] for g in group]
            fit = np.polyfit(range(6), line_ys, 1)
            if np.abs(np.polyval(fit, range(6)) - line_ys).max() > SPACING_TOLERANCE * fit[0]:
                continue
            found.append((float(spans[chain].sum()), line_ys, x0, x1, float(fit[0])))
    # strongest staves first; drop any that overlap an already chosen one
    chosen = []
    for score, line_ys, x0, x1, spacing in sorted(found, key=lambda f: -f[0]):
        if all(line_ys[-1] < c[0][0] - spacing or line_ys[0] > c[0][-1] + spacing for c in chosen):
            chosen.append((line_ys, x0, x1, spacing))
    return sorted(chosen, key=lambda c: c[0][0])


def find_staves(gray):
    """Return (staves, line mask) for the polarity that yields the best staves."""
    h, w = gray.shape
    best = ([], None)
    for dark_on_light in (True, False):
        fg = _foreground(gray, dark_on_light)
        mask = _line_mask(gray, dark_on_light)
        cands = _line_candidates(mask, w)
        staves = [Staff(ys, x0, x1, sp, dark_on_light) for ys, x0, x1, sp in _group_staves(cands, w)]
        if len(staves) > len(best[0]):
            best = (staves, (fg, mask))
    return best


def _runs_past_staff(gray, staff, x, sp):
    """True if a vertical line at x continues well above AND below the staff."""
    h = gray.shape[0]
    op = cv2.MORPH_BLACKHAT if staff.dark_on_light else cv2.MORPH_TOPHAT
    x0, x1 = max(0, x - 6), min(gray.shape[1], x + 7)

    def present(y0, y1):
        y0, y1 = max(0, int(y0)), min(h, int(y1))
        if y1 - y0 < 3:
            return False
        strip = cv2.morphologyEx(gray[y0:y1, x0:x1], op, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 1)))
        return bool(((strip > 20).mean(0) > 0.8).any())  # an unbroken thin vertical stroke
    above = present(staff.ys[0] - 1.6 * sp, staff.ys[0] - 0.4 * sp)
    below = present(staff.ys[-1] + 0.4 * sp, staff.ys[-1] + 1.6 * sp)
    return above and below


def find_bars(staff, fg, saturation=None, gray=None):
    """x positions of vertical lines spanning the whole staff.

    Play-along cursors are vertical lines too, but coloured; bar lines are drawn
    in the staff's own (grey-scale) ink, so lines with saturated colour are skipped.
    """
    top, bottom = int(staff.ys[0]), int(staff.ys[-1])
    region = fg[top:bottom + 1, staff.x0:staff.x1 + 1]
    if region.size == 0:
        return []
    if gray is not None:
        # thin vertical strokes darker (lighter) than either side - catches faint,
        # anti-aliased bar lines that the general ink threshold breaks up
        g = gray[top:bottom + 1, staff.x0:staff.x1 + 1]
        op = cv2.MORPH_BLACKHAT if staff.dark_on_light else cv2.MORPH_TOPHAT
        thin = cv2.morphologyEx(g, op, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 1)))
        _, region = cv2.threshold(thin, 25, 255, cv2.THRESH_BINARY)
        region = cv2.morphologyEx(region, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 5)))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(3, int((bottom - top) * 0.92))))
    vertical = cv2.morphologyEx(region, cv2.MORPH_OPEN, kernel)
    cols = np.nonzero(vertical.max(0))[0]
    bars = []
    sp = staff.spacing
    for g in np.split(cols, np.nonzero(np.diff(cols) > 2)[0] + 1):
        if not len(g):
            continue
        x = int(g.mean()) + staff.x0
        if gray is not None and _runs_past_staff(gray, staff, x, sp):
            continue  # runs through the whole strip above and below: a play-along cursor
        if saturation is not None:
            column = saturation[top:bottom + 1, max(0, x - 1):x + 2]
            line_px = column[vertical[:, max(0, g[0] - 1):g[-1] + 2].max(1) > 0] if column.size else column
            if line_px.size and np.median(line_px) > 60:
                continue  # coloured: a cursor, not a bar line
        bars.append(x)
    return bars


@dataclass
class Glyph:
    string: int  # 0 = top line (high e)
    x0: int
    x1: int
    y0: int
    y1: int
    parts: list = field(default_factory=list)  # (x0, x1, y0, y1) of each connected component
    text: str = ''
    score: float = 0.0


def find_glyphs(staff, fg, line_mask):
    """Blobs sitting on a string line: candidate fret numbers (possibly 2 digits)."""
    s = staff.spacing
    top = max(0, int(staff.ys[0] - s * 0.7))
    bottom = min(fg.shape[0], int(staff.ys[-1] + s * 0.7))
    x0, x1 = staff.x0, staff.x1
    if bottom - top < 3 or x1 - x0 < 3:
        return []
    ink = fg[top:bottom, x0:x1].copy()
    # Erase the string lines, but only where nothing is drawn just above and
    # below: digits written straight over a line keep their strokes.
    band = cv2.dilate(line_mask[top:bottom, x0:x1], cv2.getStructuringElement(cv2.MORPH_RECT, (1, 3))) > 0
    reach = max(2, int(round(s * 0.18)))
    inked = ink > 0
    above = np.zeros_like(inked)
    below = np.zeros_like(inked)
    above[reach:] = inked[:-reach]
    below[:-reach] = inked[reach:]
    ink[band & ~(above & below)] = 0
    for bx in staff.bars:
        ink[:, max(0, bx - x0 - 2):bx - x0 + 3] = 0
    # Erasing a line cuts glyphs whose stroke crosses it diagonally (2, 5, 7...).
    # Rejoin two pieces only if they overlap horizontally and the gap between
    # them is where a string line was erased; digits stacked on neighbouring
    # strings have their gap *between* lines, so they stay apart.
    n, _, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    boxes = [list(stats[i, :4]) for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= 2]
    line_rows = [ly - top for ly in staff.ys]
    parent = list(range(len(boxes)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    order = sorted(range(len(boxes)), key=lambda i: boxes[i][1])
    for ai in order:
        ax, ay, aw, ah = boxes[ai]
        for bi in order:
            bx, by, bw, bh = boxes[bi]
            gap = by - (ay + ah)
            if bi == ai or not 0 <= gap <= 5:
                continue
            overlap = min(ax + aw, bx + bw) - max(ax, bx)
            if overlap < 0.3 * min(aw, bw):
                continue
            if any(ay + ah - 2 <= ly <= by + 2 for ly in line_rows):
                parent[find(bi)] = find(ai)
    groups = {}
    for i in range(len(boxes)):
        groups.setdefault(find(i), []).append(boxes[i])

    glyphs = []
    for members in groups.values():
        x = min(m[0] for m in members)
        y = min(m[1] for m in members)
        w = max(m[0] + m[2] for m in members) - x
        h = max(m[1] + m[3] for m in members) - y
        if not (0.4 * s <= h <= 1.25 * s and w <= 1.1 * s):
            continue
        cy = top + y + h / 2
        string = int(np.argmin([abs(cy - ly) for ly in staff.ys]))
        if abs(cy - staff.ys[string]) > 0.32 * s:
            continue  # not centred on a string: rhythm marks, text, stems
        box = (x0 + x, x0 + x + w, top + y, top + y + h)
        glyphs.append(Glyph(string, *box, parts=[box]))
    glyphs.sort(key=lambda g: (g.string, g.x0))
    # join neighbouring digits on the same string ("1" + "2" -> "12")
    merged = []
    for g in glyphs:
        if merged and merged[-1].string == g.string and g.x0 - merged[-1].x1 <= 0.22 * s:
            m = merged[-1]
            merged[-1] = Glyph(m.string, m.x0, max(m.x1, g.x1), min(m.y0, g.y0), max(m.y1, g.y1), m.parts + g.parts)
        else:
            merged.append(g)
    return merged


def read_glyphs(glyphs, ink):
    """Classify each glyph's digits; keeps only glyphs that read as a fret number (or x).

    Neighbouring digits were joined into one number when close together. If the
    joined reading can't be a fret (over 24, or a first digit other than 1/2 -
    e.g. a dense "1-4-4-4" run), it is split back into separate notes."""
    from digit_model import classify
    crops = [ink[y0:y1, x0:x1] for g in glyphs for x0, x1, y0, y1 in g.parts]
    labels = iter(classify(crops))
    out = []
    for g in glyphs:
        read = [next(labels) for _ in g.parts]
        chars = [c for c, _ in read]
        if len(chars) > 1 and ('other' in chars or chars[0] not in '12' or 'x' in chars
                               or not ''.join(chars).isdigit() or int(''.join(chars)) > 24):
            pieces = [(Glyph(g.string, *part, parts=[part]), [r]) for part, r in zip(g.parts, read)]
        else:
            pieces = [(g, read)]
        for piece, r in pieces:
            cs = [c for c, _ in r]
            if 'other' in cs:
                continue
            text = ''.join(cs)
            if text != 'x' and (not text.isdigit() or int(text) > 24):
                continue  # no guitar has that fret: a misread or not a fret number
            piece.text, piece.score = text, float(min(p for _, p in r))
            out.append(piece)
    return out


def annotate(frame_bgr):
    """The frame with what was read drawn on it: staff lines, bar lines, digits."""
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    saturation = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)[:, :, 1]
    staves, masks = find_staves(gray)
    if not staves:
        return frame_bgr
    fg, line_mask = masks
    keep, glyphs = [], []
    for st in staves:
        st.bars = find_bars(st, fg, saturation, gray)
        if st.bars:
            keep.append(st)
            glyphs.append(read_glyphs(find_glyphs(st, fg, line_mask), fg))
    out = frame_bgr.copy()
    for st, gl in zip(keep, glyphs):
        for y in st.ys:
            cv2.line(out, (st.x0, int(round(y))), (st.x1, int(round(y))), (12, 89, 232), 1)
        for bx in st.bars:
            cv2.line(out, (bx, int(st.ys[0])), (bx, int(st.ys[-1])), (12, 89, 232), 2)
        for g in gl:
            cv2.rectangle(out, (g.x0 - 1, g.y0 - 1), (g.x1 + 1, g.y1 + 1), (12, 89, 232), 1)
    return out


def debug_draw(frame_bgr, staves, glyphs_per_staff, labels=None):
    out = frame_bgr.copy()
    for st, glyphs in zip(staves, glyphs_per_staff):
        for y in st.ys:
            cv2.line(out, (st.x0, int(y)), (st.x1, int(y)), (0, 200, 0), 1)
        for bx in st.bars:
            cv2.line(out, (bx, int(st.ys[0])), (bx, int(st.ys[-1])), (255, 120, 0), 2)
        for k, g in enumerate(glyphs):
            cv2.rectangle(out, (g.x0, g.y0), (g.x1, g.y1), (0, 0, 255), 1)
            if g.text:
                cv2.putText(out, g.text, (g.x0, int(g.y1 + st.spacing * 0.9)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 255), 1)
    return out


# ---------------------------------------------------------------------------
# Frames -> measures
# ---------------------------------------------------------------------------

@dataclass
class Measure:
    number: int  # printed bar number, or -1 when the video doesn't show one
    columns: list  # [(relative x 0..1 within the bar, {string: fret_text})]
    complete: bool  # both ends visible (not cut off by the frame edge)
    first_on_staff: bool = False
    box: tuple = None  # (x0, x1, staff top) in the frame


def _bar_number(staff, bar_x, fg):
    """Read a bar number printed just above the staff at a bar line, if any."""
    s = staff.spacing
    top = int(staff.ys[0] - 1.9 * s)
    bottom = int(staff.ys[0] - 0.15 * s)
    left, right = max(0, int(bar_x - 1.8 * s)), min(fg.shape[1], int(bar_x + 2.2 * s))
    if top < 0:
        return None
    region = fg[top:bottom, left:right]
    n, _, stats, _ = cv2.connectedComponentsWithStats(region, connectivity=8)
    parts = [stats[i, :4] for i in range(1, n)
             if 0.3 * s <= stats[i, 3] <= 1.1 * s and stats[i, 2] <= 0.9 * s and stats[i, 4] >= 4]
    if not parts:
        return None
    parts.sort(key=lambda p: p[0])
    # group into runs of adjacent digits, then keep the run closest to the bar line
    runs = [[parts[0]]]
    for p in parts[1:]:
        prev = runs[-1][-1]
        if p[0] - (prev[0] + prev[2]) <= 0.35 * s and abs(p[1] - prev[1]) <= 0.25 * s:
            runs[-1].append(p)
        else:
            runs.append([p])
    bar_rel = bar_x - left

    def distance(run):
        a, b = run[0][0], run[-1][0] + run[-1][2]
        return 0 if a <= bar_rel <= b else min(abs(a - bar_rel), abs(b - bar_rel))
    run = min(runs, key=distance)
    if distance(run) > 1.0 * s:
        return None
    from digit_model import classify
    read = classify([region[y:y + h, x:x + w] for x, y, w, h in run])
    if any(c not in '0123456789' for c, _ in read) or min(p for _, p in read) < 0.5:
        return None
    return int(''.join(c for c, _ in read))


def read_frame(frame_bgr):
    """One frame -> list of Measures in reading order (top staff first, left to right)."""
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    saturation = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)[:, :, 1]
    staves, masks = find_staves(gray)
    if not staves:
        return []
    fg, line_mask = masks
    w = gray.shape[1]
    measures = []
    for st in staves:
        st.bars = find_bars(st, fg, saturation, gray)
        if not st.bars:
            continue  # six lines without bar lines: not a tab staff (e.g. a real guitar's strings)
        glyphs = read_glyphs(find_glyphs(st, fg, line_mask), fg)
        # columns: glyphs at the same x on different strings are one chord
        glyphs.sort(key=lambda g: (g.x0 + g.x1) / 2)
        columns = []
        for g in glyphs:
            cx = (g.x0 + g.x1) / 2
            if columns and abs(cx - columns[-1][0]) <= 0.45 * st.spacing and g.string not in columns[-1][1]:
                columns[-1][1][g.string] = g.text
                columns[-1][0] = (columns[-1][0] + cx) / 2
            else:
                columns.append([cx, {g.string: g.text}])
        # split into bars; the staff's own ends count as boundaries unless cut by the frame
        edges = sorted(set([st.x0] + st.bars + [st.x1]))
        numbers = {bx: _bar_number(st, bx, fg) for bx in st.bars}
        for a, b in zip(edges[:-1], edges[1:]):
            if b - a < 1.5 * st.spacing:
                continue  # double bar lines / repeat signs
            cols = [(round((cx - a) / (b - a), 3), notes) for cx, notes in columns if a < cx < b]
            cut = (a == st.x0 and a <= 0.01 * w and a not in st.bars) or (b == st.x1 and b >= 0.99 * w and b not in st.bars)
            number = numbers.get(a)
            measures.append(Measure(number if number is not None else -1, cols, not cut))
            measures[-1].box = (int(a), int(b), int(st.ys[0]))
            measures[-1].first_on_staff = a == edges[0] or (a == st.bars[0] and edges[0] == st.x0 and st.bars[0] - st.x0 < 1.5 * st.spacing)
    # Trust printed bar numbers only when they agree with each other (n, n+1, ...)
    # or when a single one sits at the start of a line, where tab software prints them.
    read = [(i, m.number) for i, m in enumerate(measures) if m.number >= 0]
    consistent = len(read) >= 2 and all(n - read[0][1] == i - read[0][0] for i, n in read)
    single_at_start = len(read) == 1 and getattr(measures[read[0][0]], 'first_on_staff', False)
    if not (consistent or single_at_start):
        for m in measures:
            m.number = -1
    # bar numbers are often printed only at the start of each line: count on from them
    last = None
    for m in measures:
        if m.number >= 0:
            last = m.number
        elif last is not None:
            last += 1
            m.number = last
    return measures


# ---------------------------------------------------------------------------
# Video -> one tab
# ---------------------------------------------------------------------------

FPS = 2.0
ANALYSIS_WIDTH = 1280
COLUMN_TOLERANCE = 0.035  # relative x within a bar that counts as the same column
MIN_SUPPORT = 0.4  # a column must appear in this share of a bar's sightings


def frames(video_path, start=0.0, length=None, fps=FPS):
    """Yield (time, BGR frame) sampled from the video via ffmpeg."""
    import subprocess
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                            'stream=width,height', '-of', 'csv=p=0', video_path],
                           capture_output=True, text=True)
    if probe.returncode or not probe.stdout.strip():
        return
    w, h = (int(v) for v in probe.stdout.strip().split(',')[:2])
    out_w = ANALYSIS_WIDTH
    out_h = int(round(h * out_w / w / 2) * 2)
    cmd = ['ffmpeg', '-v', 'error', '-ss', f'{start:.3f}', '-i', video_path]
    if length:
        cmd += ['-t', f'{length:.3f}']
    cmd += ['-vf', f'fps={fps},scale={out_w}:{out_h}', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-']
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    size = out_w * out_h * 3
    i = 0
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield i / fps, np.frombuffer(buf, np.uint8).reshape(out_h, out_w, 3)
            i += 1
    finally:
        proc.kill()


def _vote(sightings):
    """Merge several readings of one bar into one, by majority per column and string."""
    clusters = []  # [rel_x, [notes dicts]]
    for cols in sightings:
        for rel, notes in cols:
            for c in clusters:
                if abs(c[0] - rel) <= COLUMN_TOLERANCE:
                    c[1].append(notes)
                    c[0] = (c[0] * (len(c[1]) - 1) + rel) / len(c[1])
                    break
            else:
                clusters.append([rel, [notes]])
    out = []
    for rel, seen in sorted(clusters):
        if len(seen) < MIN_SUPPORT * len(sightings):
            continue
        notes = {}
        for string in {st for n in seen for st in n}:
            votes = [n[string] for n in seen if string in n]
            if len(votes) < MIN_SUPPORT * len(seen):
                continue
            values, counts = np.unique(votes, return_counts=True)
            notes[string] = (str(values[counts.argmax()]), float(counts.max() / len(seen)))
        if notes:
            out.append((rel, notes))
    return out


def _signature(measure):
    return tuple(tuple(sorted(n.items())) for _, n in measure.columns)


def _similar(a, b):
    sa, sb = set(_signature(a)), set(_signature(b))
    return len(sa & sb) / max(1, len(sa | sb))


def _notes_bag(measure):
    from collections import Counter
    return Counter((st, f) for _, notes in measure.columns for st, f in notes.items())


def _bag_similarity(a, b):
    """Overlap of two bars' notes, ignoring positions - robust to a misread digit or two."""
    ba, bb = _notes_bag(a), _notes_bag(b)
    inter = sum((ba & bb).values())
    return inter / max(1, max(sum(ba.values()), sum(bb.values())))


def layout_of(measures):
    """Where the bars sit: lets a static page be recognised frame after frame."""
    return tuple(getattr(m, 'box', None) for m in measures)


def _same_layout(a, b, tol=6):
    if a is None or b is None or len(a) != len(b) or None in a or None in b:
        return False
    return all(abs(p - q) <= tol for x, y in zip(a, b) for p, q in zip(x, y))


def _voted_number(entry):
    nums = [n for n in entry.get('numbers', []) if n >= 0]
    if not nums:
        return -1
    values, counts = np.unique(nums, return_counts=True)
    return int(values[counts.argmax()]) if counts.max() >= max(2, 0.4 * len(entry['numbers'])) else -1


def _page_keys(measures, layout, last_page, sightings):
    """Identify bars on a frame without bar numbers, relative to the previous page.

    Same layout and similar content -> the same page (bars keep their identity).
    Otherwise look for a shift that lines most bars up with the previous page
    (scrolling); bars that don't line up are new. None means a new page.
    """
    prev_layout, prev_keys = last_page
    if not prev_keys:
        return None
    protos = [sightings[k]['proto'] for k in prev_keys]
    if _same_layout(layout, prev_layout) and \
            np.mean([_bag_similarity(m, p) for m, p in zip(measures, protos)]) >= 0.5:
        # same layout and similar notes - unless the bar numbers say the page turned
        # (a riff repeated on the next page looks identical)
        now = [m.number for m in measures if m.number >= 0]
        before = [_voted_number(sightings[k]) for k in prev_keys]
        before = [n for n in before if n >= 0]
        if len(now) >= 2 and len(before) >= 2 and np.median(now) - np.median(before) >= len(measures) - 0.5:
            return None
        return list(prev_keys)
    best = None
    for shift in range(-len(measures) + 1, len(protos)):
        pairs = [(i, i + shift) for i in range(len(measures)) if 0 <= i + shift < len(protos)]
        if not pairs:
            continue
        sims = [_bag_similarity(measures[i], protos[j]) for i, j in pairs]
        good = sum(x >= 0.6 for x in sims)
        if good >= max(1, 0.6 * len(pairs)) and (best is None or good > best[0]):
            best = (good, shift)
    if best is None:
        return None
    shift = best[1]
    keys = []
    for i in range(len(measures)):
        j = i + shift
        keys.append(prev_keys[j] if 0 <= j < len(protos) else None)
    return keys


def read_video(video_path, start=0.0, length=None, progress=lambda f: None, debug_frame_path=None):
    """Read the tab shown in a video. Returns a dict with the ordered bars:

    {'bars': [{'number', 'start', 'end', 'columns': [(rel_x, {string: (fret, agreement)})]}],
     'frames_read', 'frames_with_tab', 'numbered'}
    Times are relative to `start`.
    """
    sightings = {}  # key -> {'cols': [...], 'first': t, 'last': t, 'number': n}
    order = []  # keys in order of first appearance
    prev_small, prev_measures = None, []
    frames_read = frames_with_tab = 0
    last_page = (None, [])
    page_counter = 0
    best_debug = (0, None)
    total = length or 1
    for t, frame in frames(video_path, start, length):
        frames_read += 1
        progress(min(1.0, t / total))
        small = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (160, 90))
        if prev_small is not None and np.abs(small.astype(int) - prev_small).mean() < 1.0:
            measures = prev_measures  # nothing changed on screen: reuse the reading
        else:
            measures = read_frame(frame)
        prev_small, prev_measures = small.astype(int), measures
        frame_layout = [m for m in measures if m.complete and m.columns]
        complete = [m for m in measures if m.complete and m.columns]
        if not complete:
            continue
        frames_with_tab += 1
        if debug_frame_path and len(complete) > best_debug[0]:
            best_debug = (len(complete), frame.copy())
        keys = _page_keys(complete, layout_of(frame_layout), last_page, sightings)
        if keys is None:
            page_counter += 1
            keys = [('p', page_counter, i) for i in range(len(complete))]
        if any(k is None for k in keys):
            page_counter += 1
            keys = [k if k is not None else ('p', page_counter, i) for i, k in enumerate(keys)]
        last_page = (layout_of(frame_layout), keys)
        for key, m in zip(keys, complete):
            if key not in sightings:
                sightings[key] = {'cols': [], 'first': t, 'last': t, 'number': m.number, 'proto': m}
                order.append(key)
            entry = sightings[key]
            entry['cols'].append(m.columns)
            entry['last'] = t
            entry.setdefault('numbers', []).append(m.number)
    progress(1.0)

    if debug_frame_path and best_debug[1] is not None:
        cv2.imwrite(debug_frame_path, annotate(best_debug[1]), [cv2.IMWRITE_JPEG_QUALITY, 85])

    # Playing order is the order bars first appear on screen. Printed bar numbers
    # (majority of their readings) are kept for display and to spot a page shown twice.
    bars, seen_numbers = [], {}
    for k in order:
        e = sightings[k]
        cols = _vote(e['cols'])
        if not cols:
            continue
        number = _voted_number(e)
        bar = {'number': number, 'start': e['first'], 'end': e['last'] + 1 / FPS,
               'columns': cols, 'sightings': len(e['cols'])}
        if number >= 0 and number in seen_numbers:
            # the same printed bar again (e.g. scrolled back into view): merge readings
            prev = seen_numbers[number]
            prev['columns'] = _vote([[(r, {s: f for s, (f, _) in n.items()}) for r, n in prev['columns']]] * prev['sightings']
                                    + e['cols'])
            prev['sightings'] += len(e['cols'])
            prev['end'] = max(prev['end'], bar['end'])
            continue
        if number >= 0:
            seen_numbers[number] = bar
        bars.append(bar)
    numbered = sum(b['number'] >= 0 for b in bars) >= 0.5 * max(1, len(bars))
    return {'bars': bars, 'frames_read': frames_read, 'frames_with_tab': frames_with_tab, 'numbered': numbered}


# ---------------------------------------------------------------------------
# Video tab + audio -> fingerings
# ---------------------------------------------------------------------------

WINDOW_PAD_S = 1.5  # a bar counts as "on screen" this long before/after it was seen
MIN_MATCH = 0.6  # pitch-class agreement needed to adopt a column from the video
KEEP_UNHEARD = 0.7  # keep a shown note nobody heard only if frames agreed on it this strongly


def _column_pitches(notes, open_strings):
    """{tab line: (fret text, agreement)} -> {(string, fret): pitch}; tab line 0 = high e."""
    out = {}
    for line, (fret, _) in notes.items():
        if fret == 'x':
            continue
        string = 5 - int(line)
        out[(string, int(fret))] = open_strings[string] + int(fret)
    return out


def _overlap(heard, shown):
    """How well a column on screen explains the notes heard, by note name (pitch
    class): the detector often hears a note an octave off (e.g. a distorted low D
    as D3), and the on-screen tab supplies the right octave anyway. F1 over pitch
    classes, with a small bonus for exact pitches to break ties."""
    if not heard or not shown:
        return 0.0
    ph, ps = {p % 12 for p in heard}, {p % 12 for p in shown}
    f1 = 2 * len(ph & ps) / (len(ph) + len(ps))
    return f1 + 0.05 * len(heard & shown) / len(heard | shown)


def _columns(video):
    """Every column on screen, in reading order: (index, notes, bar start, bar end, bar mid)."""
    out = []
    for bar in video['bars']:
        mid = (bar['start'] + bar['end']) / 2
        for _, notes in bar['columns']:
            out.append((len(out), notes, bar['start'], bar['end'], mid))
    return out


def _visible_columns(video, t, columns=None):
    columns = columns if columns is not None else _columns(video)
    return [(abs(mid - t), notes) for _, notes, a, b, mid in columns
            if a - WINDOW_PAD_S <= t <= b + WINDOW_PAD_S]


def fit_tuning(events, video, tunings, shifts=range(0, 8)):
    """Which tuning (and capo shift) makes the on-screen tab agree best with the
    notes heard? Each candidate is scored by the mean match quality of the
    in-order matching itself. tunings: {id: open strings low->high}.
    Returns (tuning id, shift, mean match score)."""
    sample = events[:: max(1, len(events) // 300)]
    best = (None, 0, -1.0)
    for tid, strings in tunings.items():
        for shift in shifts:
            _, quality = fuse(sample, video, [m + shift for m in strings], apply=False)
            if quality > best[2] + 1e-9:
                best = (tid, shift, quality)
    return best


LOOKAHEAD = 16  # columns to search forward from the last match before resyncing


def fuse(events, video, open_strings, apply=True):
    """Adopt string/fret (and pitch) from the on-screen tab for every audio event a
    column matches. Columns are consumed in reading order: each event takes the
    next matching column after the previous match (repeated single notes can't
    jump around), and only resyncs anywhere on screen when nothing ahead fits.
    Sets ev['video_fingering'] (unless apply=False); returns (number matched,
    mean match score over all events)."""
    columns = _columns(video)
    pitches = [_column_pitches(notes, open_strings) for _, notes, *_ in columns]
    pointer = 0
    matched = 0
    total = 0.0
    for ev in events:
        t = ev['time']
        heard = {int(n['pitch']) for n in ev['notes']}
        visible = [c for c in columns if c[2] - WINDOW_PAD_S <= t <= c[3] + WINDOW_PAD_S]
        if not visible:
            continue
        scored = [(_overlap(heard, set(pitches[c[0]].values())), c) for c in visible]
        ahead = [(sc, c) for sc, c in scored if sc >= MIN_MATCH and pointer <= c[0] < pointer + LOOKAHEAD]
        if ahead:
            score, col = min(ahead, key=lambda x: (x[1][0], -x[0]))  # the next one in order
        else:
            good = [(sc, c) for sc, c in scored if sc >= MIN_MATCH]
            if not good:
                continue
            score, col = max(good, key=lambda x: (x[0], -abs(x[1][4] - t)))
        pointer = col[0] + 1
        total += min(1.0, score)
        matched += 1
        if not apply:
            continue
        # keep shown notes that were heard (by name); keep unheard ones only when the
        # column matched well and the frames agreed on that digit - a misread digit
        # that nobody heard is dropped
        heard_pc = {p % 12 for p in heard}
        shown = []
        for line, (fret, agree) in col[1].items():
            if fret != 'x':
                string = 5 - int(line)
                shown.append((string, int(fret), open_strings[string] + int(fret), agree))
        heard_frets = [f for _, f, p, _ in shown if p % 12 in heard_pc]
        kept = {}
        for string, fret, pitch, agree in shown:
            # Unheard notes (often the fifth of a power chord, or an octave the detector
            # missed) stay when the frames agreed on the digit and it fits the same hand
            # shape as a heard note - a misread "9" beside a 0-2 shape does not.
            in_shape = fret == 0 or any(abs(fret - f) <= 4 for f in heard_frets if f)
            if pitch % 12 in heard_pc or (agree >= KEEP_UNHEARD and heard_frets and in_shape):
                kept[(string, fret)] = (pitch, agree)
        if not kept:
            matched -= 1
            continue
        by_pitch = {int(n['pitch']): n for n in ev['notes']}
        template = next(iter(ev['notes']))
        ev['notes'] = [{**(by_pitch.get(p) or template), 'pitch': p} for p, _ in kept.values()]
        ev['video_fingering'] = tuple(sorted(kept))
        ev['video_match'] = round(min(1.0, score) * min(a for _, a in kept.values()), 2)
    return matched, total / max(1, len(events))
