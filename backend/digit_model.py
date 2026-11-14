"""
A small fret-number classifier, trained on synthetic renders - no labelled data.

Digits 0-9 (plus 'x' for dead notes) are drawn in every available system font at
varied sizes, weights, offsets, blur and noise, then pushed through the same
adaptive threshold that tabvision applies to video frames. An 'other' class
(letters and symbols that also appear on tab staves: h p b r / \\ ( ) ~ . etc.)
teaches the model to reject non-digits. Trained once, then cached on disk.
"""
import glob
import logging
import os
import pickle
import random

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

log = logging.getLogger(__name__)

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache', 'digit_model_v2.pkl')
# The trained, benchmarked model ships with the code (fonts differ between machines,
# so retraining elsewhere would give a different, untested model).
BUNDLED = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'digit_model_v2.pkl.gz')
CLASSES = list('0123456789x') + ['other']
# letters/symbols seen on tab staves; lookalikes of digits (o, b, g, q, l, |) are left out
OTHER_CHARS = list('hprstvwTAPMHNaecmnu()/\\~.-=*>^<+?') + ['//', '~~', 'PM', 'h', 'p']
SAMPLES_PER_CLASS_PER_FONT = 14
MAX_FONT_FACES = 120  # random subset keeps training to a minute or two
BOX_W, BOX_H = 16, 22

FONT_DIRS = ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts',
             '/usr/share/fonts', '/usr/local/share/fonts']
SKIP = ('emoji', 'braille', 'symbol', 'dingbat', 'lastresort', 'keyboard', 'hiragino', 'heiti', 'kohinoor',
        'noto', 'geeza', 'decotype', 'aquakana', 'cjk', 'sfarabic', 'sfhebrew', 'sfgeorgian', 'sfarmenian',
        'sfindia', 'sfcamera', 'thonburi', 'muktamahee', 'webdings', 'wingdings', 'ヒラギノ')

_model = None


def _fonts():
    paths = []
    for d in FONT_DIRS:
        paths += glob.glob(os.path.join(d, '**', '*.tt[fc]'), recursive=True)
        paths += glob.glob(os.path.join(d, '**', '*.otf'), recursive=True)
    fonts = []
    for p in sorted(set(paths)):
        if any(k in os.path.basename(p).lower() for k in SKIP):
            continue
        for index in range(4 if p.endswith('.ttc') else 1):  # regular/bold/italic faces in collections
            try:
                font = ImageFont.truetype(p, 24, index=index)
                masks = [bytes(font.getmask(d)) for d in '0178']
                if len(set(masks)) == 4 and all(any(m) for m in masks):  # real, distinct digit glyphs
                    fonts.append((p, index))
            except Exception:
                break
    return fonts


def normalise(binary_crop):
    """Ink-on-black crop -> fixed-size float vector (aspect preserved, centred)."""
    ys, xs = np.nonzero(binary_crop)
    if not len(ys):
        return np.zeros(BOX_W * BOX_H + 36, dtype=np.float32)
    crop = binary_crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.float32) / 255
    h, w = crop.shape
    scale = min((BOX_W - 2) / w, (BOX_H - 2) / h)
    resized = cv2.resize(crop, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_AREA)
    box = np.zeros((BOX_H, BOX_W), dtype=np.float32)
    oy, ox = (BOX_H - resized.shape[0]) // 2, (BOX_W - resized.shape[1]) // 2
    box[oy:oy + resized.shape[0], ox:ox + resized.shape[1]] = resized
    # shape cues the pixels alone blur away: aspect ratio, ink density, row/column profiles
    extra = [w / h, crop.mean()] + list(cv2.resize(box.mean(1, keepdims=True), (1, 17)).ravel()) + \
            list(cv2.resize(box.mean(0, keepdims=True), (17, 1)).ravel())
    return np.concatenate([box.ravel(), np.array(extra, dtype=np.float32)])


def _render(text, font_path, index, rng):
    """One synthetic glyph, as an ink-on-black crop like tabvision cuts from frames."""
    size = rng.randint(11, 34)
    font = ImageFont.truetype(font_path, size, index=index)
    bg = 235 + rng.randint(-20, 20)
    canvas = Image.new('L', (size * 4, size * 3), bg)
    draw = ImageDraw.Draw(canvas)
    ink = rng.randint(0, 70)
    stroke = 1 if rng.random() < 0.15 else 0
    origin = (size, size // 2)
    draw.text(origin, text, font=font, fill=ink, stroke_width=stroke, stroke_fill=ink)
    x0, y0, x1, y1 = draw.textbbox(origin, text, font=font, stroke_width=stroke)
    img = np.array(canvas)
    if rng.random() < 0.5:  # a string line through the glyph's background, as on tab
        y = rng.randint(y0, max(y0, y1 - 1))
        img[y:y + 1, :] = np.minimum(img[y:y + 1, :], 120 + rng.randint(0, 80))
    if rng.random() < 0.6:
        img = cv2.GaussianBlur(img, (3, 3), rng.uniform(0.3, 1.0))
    img = np.clip(img + np.random.normal(0, rng.uniform(0, 4), img.shape), 0, 255).astype(np.uint8)
    if rng.random() < 0.4:  # video compression softness: down- then up-scale
        f = rng.uniform(0.55, 0.85)
        small = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        img = cv2.resize(small, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
    binary = cv2.adaptiveThreshold(img, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 21, 10)
    lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (size * 2, 1)))
    binary[lines > 0] = 0
    crop = binary[max(0, y0 - 1):y1 + 2, max(0, x0 - 1):x1 + 2]
    # drop specks, as the frame reader's connected-component filter would
    n, labels, stats, _ = cv2.connectedComponentsWithStats(crop, connectivity=8)
    keep = np.isin(labels, [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= max(3, size // 4)])
    return np.where(keep, 255, 0).astype(np.uint8)


def train(seed=0):
    from sklearn.svm import SVC
    rng = random.Random(seed)
    np.random.seed(seed)
    fonts = _fonts()
    fonts = rng.sample(fonts, min(MAX_FONT_FACES, len(fonts)))
    X, y = [], []
    for font_path, index in fonts:
        try:
            batch = []
            for label in CLASSES:
                for _ in range(SAMPLES_PER_CLASS_PER_FONT):
                    text = rng.choice(OTHER_CHARS) if label == 'other' else label
                    batch.append((normalise(_render(text, font_path, index, rng)), label))
        except Exception:  # a few fonts can't render (or lack digits); skip them
            continue
        X += [b[0] for b in batch]
        y += [b[1] for b in batch]
    X, y = np.array(X), np.array(y)
    model = SVC(C=8, gamma='scale').fit(X, y)
    log.info("Digit model trained on %d synthetic glyphs from %d font faces", len(y), len(fonts))
    return model, len(fonts)


def get_model():
    global _model
    if _model is None:
        if os.path.exists(CACHE):
            with open(CACHE, 'rb') as f:
                _model = pickle.load(f)
        elif os.path.exists(BUNDLED):
            import gzip
            with gzip.open(BUNDLED, 'rb') as f:
                _model = pickle.load(f)
        else:
            _model, _ = train()
            os.makedirs(os.path.dirname(CACHE), exist_ok=True)
            with open(CACHE, 'wb') as f:
                pickle.dump(_model, f)
    return _model


def classify(crops):
    """List of ink-on-black crops -> list of (label, probability)."""
    if not crops:
        return []
    model = get_model()
    scores = model.decision_function(np.array([normalise(c) for c in crops]))
    # softmax over one-vs-rest margins: a usable, if uncalibrated, confidence
    e = np.exp(2 * (scores - scores.max(1, keepdims=True)))
    probs = e / e.sum(1, keepdims=True)
    best = probs.argmax(1)
    return [(model.classes_[b], float(p[b])) for b, p in zip(best, probs)]
