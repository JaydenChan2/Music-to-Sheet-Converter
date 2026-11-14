"""
Tutorial mode: use what the teacher *says* to improve the transcription.

  1. Get timed speech: YouTube captions when the link has them (free, instant),
     otherwise local Whisper (faster-whisper) on the audio with voice detection.
  2. Pull out settings the teacher mentions: capo fret, tuning, chord names.
  3. Optionally mask out notes detected while the teacher is talking (only
     needed when the guitar isn't isolated, since Demucs already removes voice).

Everything runs locally; no paid services.
"""
import json
import logging
import os
import re
from collections import Counter

import librosa
import numpy as np

log = logging.getLogger(__name__)

WHISPER_MODEL = os.environ.get('WHISPER_MODEL', 'base')  # tiny/base/small; bigger = slower, more accurate
WHISPER_SR = 16000
MAX_TRANSCRIPT_SEGMENTS = 600
SPEECH_PAD_S = 0.15

_whisper = None


def speech_available():
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# 1. Timed speech
# ---------------------------------------------------------------------------

def fetch_captions(url, dest_dir):
    """Download English captions (manual preferred, else auto-generated) for a link.

    Returns a list of {start, end, text} or None. Never raises: captions are a bonus.
    """
    try:
        import yt_dlp
        opts = {
            'skip_download': True,
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitleslangs': ['en', 'en-orig', 'en-US', 'en-GB'],
            'subtitlesformat': 'json3/vtt/best',
            'outtmpl': os.path.join(dest_dir, 'captions.%(ext)s'),
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.extract_info(url, download=True)
    except Exception as e:  # rate limits, sites without captions, network trouble...
        log.info("No captions for %s (%s)", url, e)
        return None

    files = sorted(f for f in os.listdir(dest_dir) if f.startswith('captions.'))
    for name in sorted(files, key=lambda f: (not f.endswith('.json3'), f)):
        path = os.path.join(dest_dir, name)
        try:
            segments = _parse_json3(path) if name.endswith('.json3') else _parse_vtt(path) if name.endswith('.vtt') else None
        except Exception as e:
            log.warning("Couldn't parse captions %s: %s", name, e)
            segments = None
        if segments:
            return segments
    return None


def _parse_json3(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    out = []
    for ev in data.get('events', []):
        text = ''.join(s.get('utf8', '') for s in ev.get('segs') or []).replace('\n', ' ').strip()
        if not text:
            continue
        start = ev.get('tStartMs', 0) / 1000
        out.append({'start': start, 'end': start + ev.get('dDurationMs', 0) / 1000, 'text': text})
    return _dedupe(out)


_VTT_TIME = re.compile(r'(\d+):(\d\d):(\d\d)\.(\d+)\s+-->\s+(\d+):(\d\d):(\d\d)\.(\d+)')


def _parse_vtt(path):
    def secs(h, m, s, ms):
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    out, current = [], None
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            m = _VTT_TIME.match(line)
            if m:
                current = {'start': secs(*m.groups()[:4]), 'end': secs(*m.groups()[4:]), 'text': ''}
                out.append(current)
            elif line and current is not None:
                current['text'] = (current['text'] + ' ' + re.sub(r'<[^>]+>', '', line)).strip()
            elif not line:
                current = None
    return _dedupe([s for s in out if s['text']])


def _dedupe(segments):
    """Auto-captions repeat each line as it scrolls; keep only new text."""
    out = []
    for s in segments:
        if out and (s['text'] == out[-1]['text'] or s['text'] in out[-1]['text']):
            out[-1]['end'] = max(out[-1]['end'], s['end'])
            continue
        out.append(s)
    return out


def transcribe_speech(mix_path, progress=lambda frac: None):
    """Local speech-to-text with voice detection, so strummed music isn't 'heard' as words."""
    global _whisper
    from faster_whisper import WhisperModel

    if _whisper is None:
        _whisper = WhisperModel(WHISPER_MODEL, device='cpu', compute_type='int8')
    audio, _ = librosa.load(mix_path, sr=WHISPER_SR, mono=True)
    duration = len(audio) / WHISPER_SR
    segments, info = _whisper.transcribe(
        audio.astype(np.float32),
        vad_filter=True,
        vad_parameters={'min_silence_duration_ms': 500},
        condition_on_previous_text=False,  # stops one hallucination snowballing
        beam_size=1,
        word_timestamps=True,  # segment end times are loose; word times are tight
    )
    out = []
    for seg in segments:
        progress(min(1.0, seg.end / max(duration, 1e-6)))
        if seg.no_speech_prob > 0.6 or seg.avg_logprob < -1.0 or not seg.text.strip():
            continue
        words = [(float(w.start), float(w.end)) for w in (seg.words or [])]
        out.append({'start': float(seg.start), 'end': float(seg.end), 'text': seg.text.strip(),
                    'spans': _merge_spans(words) or [(float(seg.start), float(seg.end))]})
    log.info("Whisper heard %d segments (language %s)", len(out), info.language)
    return out, info.language


# ---------------------------------------------------------------------------
# 2. Settings the teacher mentions
# ---------------------------------------------------------------------------

_NUMBER_WORDS = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8,
    'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12,
    'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5, 'sixth': 6, 'seventh': 7,
    'eighth': 8, 'ninth': 9, 'tenth': 10, 'eleventh': 11, 'twelfth': 12,
}
_NUM = r'(\d{1,2}|' + '|'.join(sorted(_NUMBER_WORDS, key=len, reverse=True)) + r')(?:st|nd|rd|th)?'

_CAPO_PATTERNS = [
    # "capo on the second fret", "capo on 2", "put the capo at fret 3", "capo two"
    re.compile(r'\bcapo\b(?:[\s-]+(?:is|goes|it|up|placed|sits))?(?:[\s-]+(?:on|at|to|onto|up[\s-]+to))?(?:[\s-]+the)?(?:[\s-]+fret)?[\s-]+' + _NUM + r'\b'),
    # "second fret capo", "capo'd at the 4th"
    re.compile(r'\b' + _NUM + r'[\s-]+fret[\s-]+capo\b'),
    re.compile(r"\bcapo(?:'d|ed)[\s-]+(?:on|at)[\s-]+(?:the[\s-]+)?(?:fret[\s-]+)?" + _NUM + r'\b'),
]
_NO_CAPO = re.compile(r'\b(?:no|without[\s-]+(?:a|the)?)[\s-]*capo\b')

# Order matters: more specific phrases first.
_TUNING_PATTERNS = [
    ('drop_c_sharp', re.compile(r'\bdrop[\s-]+c[\s-]*(?:sharp|#)')),
    ('drop_c', re.compile(r'\bdrop[\s-]+c\b')),
    ('drop_d', re.compile(r'\bdrop[\s-]+d\b')),
    ('dadgad', re.compile(r'\bd[\s-]*a[\s-]*d[\s-]*g[\s-]*a[\s-]*d\b')),
    ('open_g', re.compile(r'\b(?:(?:in|to|into)[\s-]+open[\s-]+g\b(?![\s-]+strings?\b)|open[\s-]+g[\s-]+tuning)')),
    ('open_d', re.compile(r'\b(?:(?:in|to|into)[\s-]+open[\s-]+d\b(?![\s-]+strings?\b)|open[\s-]+d[\s-]+tuning)')),
    ('open_e', re.compile(r'\b(?:(?:in|to|into)[\s-]+open[\s-]+e\b(?![\s-]+strings?\b)|open[\s-]+e[\s-]+tuning)')),
    ('half_down', re.compile(r'\b(?:half[\s-]+(?:a[\s-]+)?step[\s-]+down|down[\s-]+(?:a[\s-]+)?half[\s-]+(?:a[\s-]+)?step|e[\s-]*(?:flat|b)[\s-]+(?:standard|tuning))')),
    ('full_down', re.compile(r'\b(?:(?:whole|full)[\s-]+step[\s-]+down|down[\s-]+(?:a[\s-]+)?(?:whole|full)[\s-]+step|d[\s-]+standard)')),
    ('standard', re.compile(r'\bstandard[\s-]+tuning\b')),
]

# Chords are matched on the original casing: speech-to-text capitalises chord
# letters ("a G chord", "A minor"), which separates them from the article "a".
_CHORD = re.compile(
    r'\b([A-G])(\s?(?:#|sharp|flat|b(?=\s|m|7|$)))?'
    r'(\s?(?:minor|major|min|maj|m(?![a-z])))?'
    r'(\s?(?:7th|7|seven|seventh|sus\s?[24]|sus|add\s?9|dim|aug))?'
    r'(\s+chord)?\b'
)


def _to_int(token):
    return int(token) if token.isdigit() else _NUMBER_WORDS.get(token)


def _quote(text, span, width=60):
    a, b = max(0, span[0] - width // 2), min(len(text), span[1] + width // 2)
    return ('…' if a else '') + text[a:b].strip() + ('…' if b < len(text) else '')


def _chord_name(m, text):
    root, acc, quality, ext, word = m.groups()
    acc = (acc or '').strip()
    quality = (quality or '').strip().lower()
    ext = (ext or '').strip().lower().replace(' ', '')
    if not (quality or ext or word):
        return None  # a bare capital letter is too ambiguous
    if root == 'A' and not (acc or quality or ext) and re.search(r'(^|[.!?]\s*)$', text[:m.start()]):
        return None  # "A chord progression..." at the start of a sentence
    name = root + {'sharp': '#', '#': '#', 'flat': 'b', 'b': 'b'}.get(acc, '')
    if quality in ('minor', 'min', 'm'):
        name += 'm'
    elif quality in ('maj',) and ext:
        name += 'maj'
    name += {'seven': '7', 'seventh': '7', '7th': '7'}.get(ext, ext)
    return name


def extract_hints(segments, max_capo=12, tunings=None):
    """Find capo, tuning and chord mentions. Each hint keeps its timestamp and quote."""
    capo_votes, tuning_votes, chords = Counter(), Counter(), []
    first_capo, first_tuning = {}, {}

    for seg in segments:
        text = seg['text']
        low = text.lower()

        found = []
        for pat in _CAPO_PATTERNS:
            for m in pat.finditer(low):
                fret = _to_int(m.group(1))
                if fret is not None and 1 <= fret <= max_capo:
                    found.append((fret, m.span()))
        for m in _NO_CAPO.finditer(low):
            found.append((0, m.span()))
        for fret, span in found:
            capo_votes[fret] += 1
            first_capo.setdefault(fret, {'value': fret, 'at': seg['start'], 'quote': _quote(text, span)})

        for tid, pat in _TUNING_PATTERNS:
            m = pat.search(low)
            if m and (tunings is None or tid in tunings):
                tuning_votes[tid] += 1
                first_tuning.setdefault(tid, {'value': tid, 'at': seg['start'], 'quote': _quote(text, m.span())})
                break  # one tuning per caption line

        for m in _CHORD.finditer(text):
            name = _chord_name(m, text)
            if name:
                chords.append({'name': name, 'at': seg['start']})

    capo = first_capo[capo_votes.most_common(1)[0][0]] if capo_votes else None
    tuning = first_tuning[tuning_votes.most_common(1)[0][0]] if tuning_votes else None

    # One entry per chord, in order of first mention, with how often it came up.
    seen = {}
    for c in chords:
        if c['name'] in seen:
            seen[c['name']]['count'] += 1
        else:
            seen[c['name']] = {**c, 'count': 1}
    return {'capo': capo, 'tuning': tuning, 'chords': list(seen.values())}


# ---------------------------------------------------------------------------
# 3. Masking notes picked up from the teacher's voice
# ---------------------------------------------------------------------------

def _merge_spans(words, max_gap=0.35):
    """Join word timings into continuous stretches of talking."""
    spans = []
    for start, end in sorted(words):
        if spans and start - spans[-1][1] <= max_gap:
            spans[-1] = (spans[-1][0], max(spans[-1][1], end))
        else:
            spans.append((start, end))
    return spans


def drop_notes_during_speech(notes, segments):
    """Remove notes that start while someone is talking. Returns (kept, dropped_count)."""
    word_spans = [sp for s in segments for sp in s.get('spans', [])]
    if not word_spans:
        return notes, 0
    spans = np.array([(a - SPEECH_PAD_S, b + SPEECH_PAD_S) for a, b in word_spans])
    kept = [n for n in notes if not np.any((spans[:, 0] <= n['start']) & (n['start'] <= spans[:, 1]))]
    return kept, len(notes) - len(kept)


def trim_transcript(segments):
    return [{'start': round(s['start'], 2), 'end': round(s['end'], 2), 'text': s['text']}
            for s in segments[:MAX_TRANSCRIPT_SEGMENTS]]
