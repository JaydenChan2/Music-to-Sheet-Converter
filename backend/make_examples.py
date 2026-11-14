"""
Build the "Try an example" songs shown in the Studio.

Each example is transcribed once here with the real pipeline; the result and its
files are written to frontend/public/examples/<id>/ so the website can show them
instantly, with no backend (e.g. while a free server is asleep).

Audio: GuitarSet (Xi et al., ISMIR 2018), CC BY 4.0 - needs the benchmark cache
(see README). The lesson example uses macOS `say` for the teacher's voice.

    .venv/bin/python make_examples.py
"""
import json
import os
import shutil
import subprocess
import tempfile

import audio_processor as ap
import benchmark_guitarset as bg
import benchmark_tabvideo as btv

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'frontend', 'public', 'examples')
AUDIO = os.path.join(bg.DATA, 'audio_mono-mic')
CREDIT = 'Audio: GuitarSet (Xi, Bittner, Pauwels, Ye & Bello, ISMIR 2018), CC BY 4.0.'
FILES = {'original': 'original.mp3', 'midi': 'transcription.mid', 'text': 'tab.txt', 'tab_frame': 'tabframe.jpg'}

LESSON_LINES = [
    "Hey, welcome back. Today we're learning a strumming pattern in E.",
    "We're in standard tuning, and you won't need a capo for this one.",
    "The chords are an E major, an A major, and a B7. Listen first, then play along.",
]

EXAMPLES = [
    {'id': 'jazz-solo', 'title': 'Jazz solo', 'mode': 'song',
     'blurb': 'A single-note jazz line: melody, timing and fingering.', 'clip': '02_Jazz1-200-B_solo'},
    {'id': 'rock-rhythm', 'title': 'Rock rhythm', 'mode': 'song',
     'blurb': 'Strummed rock chords in C#: chord shapes on the grid.', 'clip': '01_Rock1-90-C#_comp'},
    {'id': 'guitar-lesson', 'title': 'Guitar lesson', 'mode': 'tutorial',
     'blurb': 'A teacher talks first: tutorial mode picks up the tuning and chords.', 'clip': '05_SS1-68-E_comp'},
    {'id': 'tab-video', 'title': 'Tab video', 'mode': 'tab',
     'blurb': 'The tab is on screen: strings and frets come from the picture.', 'clip': '03_Jazz2-110-Bb_comp'},
]


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def build_lesson(clip_wav, work):
    """Teacher's voice (macOS `say`), a short pause, then the guitar clip."""
    speech = os.path.join(work, 'speech.aiff')
    run(['say', '-o', speech, ' '.join(LESSON_LINES)])
    out = os.path.join(work, 'lesson.wav')
    run(['ffmpeg', '-y', '-v', 'error', '-i', speech, '-i', clip_wav, '-filter_complex',
         '[0:a]aresample=44100,aformat=channel_layouts=mono,apad=pad_dur=1[a];'
         '[1:a]aresample=44100,aformat=channel_layouts=mono[b];[a][b]concat=n=2:v=0:a=1', out])
    return out


def build_tab_video(clip_wav, clip, work):
    """The tab a play-along video would show, drawn from GuitarSet's string/fret annotations."""
    notes = btv.tab_notes(bg.load_reference(bg.DATA, clip))
    duration = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of',
                                     'csv=p=0', clip_wav], capture_output=True, text=True).stdout)
    silent = os.path.join(work, 'tab_silent.mp4')
    btv.render_video(notes, duration, silent, 'Helvetica')
    video = os.path.join(work, 'tab.mp4')
    run(['ffmpeg', '-y', '-v', 'error', '-i', silent, '-i', clip_wav, '-c:v', 'copy', '-c:a', 'aac', '-shortest', video])
    return video


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    index = []
    for ex in EXAMPLES:
        work = tempfile.mkdtemp()
        try:
            clip_wav = os.path.join(AUDIO, ex['clip'] + '_mic.wav')
            source, video = clip_wav, None
            if ex['mode'] == 'tutorial':
                source = build_lesson(clip_wav, work)
            if ex['mode'] == 'tab':
                video = source = build_tab_video(clip_wav, ex['clip'], work)
            job = os.path.join(work, 'job')
            os.makedirs(job)
            result = ap.transcribe(source, job, separate=False, tuning=ap.resolve_tuning('standard', 0),
                                   video_type=ex['mode'], video_path=video)
            dest = os.path.join(OUT, ex['id'])
            os.makedirs(dest)
            result['files'] = {}
            for key, name in FILES.items():
                if os.path.exists(os.path.join(job, name)):
                    shutil.copy(os.path.join(job, name), os.path.join(dest, name))
                    result['files'][key] = f"/examples/{ex['id']}/{name}"
            with open(os.path.join(dest, 'result.json'), 'w') as f:
                json.dump(result, f, separators=(',', ':'))
            index.append({**{k: ex[k] for k in ('id', 'title', 'mode', 'blurb')},
                          'source': f"GuitarSet {ex['clip']}", 'notes': result['note_count'],
                          'check': result['verification']['overall']})
            print(f"{ex['id']}: {result['note_count']} notes, check {result['verification']['overall']:.0%}")
        finally:
            shutil.rmtree(work, ignore_errors=True)
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump({'credit': CREDIT, 'examples': index}, f, indent=1)


if __name__ == '__main__':
    main()
