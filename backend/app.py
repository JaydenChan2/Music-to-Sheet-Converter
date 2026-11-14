import logging
import os
import shutil
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

from audio_processor import (MAX_CAPO, MAX_DURATION_S, ProcessingError, resolve_range, resolve_tuning,
                             separation_available, transcribe, tuning_presets)
from sources import download_audio, download_video, has_video, validate_url
from tutorial import fetch_captions, speech_available

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
log = logging.getLogger('app')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JOBS_DIR = os.environ.get('JOBS_DIR', os.path.join(BASE_DIR, 'jobs'))
os.makedirs(JOBS_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {'mp3', 'wav', 'm4a', 'mp4', 'flac', 'ogg', 'aac', 'webm', 'aiff', 'aif', 'opus', 'mov'}
SERVED_FILES = {'original.mp3', 'transcription.mid', 'tab.txt', 'tabframe.jpg'}
VIDEO_TYPES = {'song', 'tutorial', 'tab'}

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_UPLOAD_MB', 200)) * 1024 * 1024

# Settings for hosting publicly; all off by default for local use.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get('ALLOWED_ORIGINS', '*').split(',') if o.strip()]
RATE_LIMIT_PER_HOUR = int(os.environ.get('RATE_LIMIT_PER_HOUR', 0))  # jobs per visitor per hour (0 = no limit)
MAX_QUEUED = int(os.environ.get('MAX_QUEUED', 0))  # refuse new jobs while this many are waiting (0 = no limit)
JOB_TTL_HOURS = float(os.environ.get('JOB_TTL_HOURS', 0))  # delete jobs older than this (0 = keep)
CORS(app, origins=ALLOWED_ORIGINS)

# The ML models are memory-heavy, so jobs run one at a time.
executor = ThreadPoolExecutor(max_workers=1)
jobs = {}
jobs_lock = threading.Lock()
recent_requests = {}  # visitor -> [timestamps of jobs created]


def _visitor():
    # behind a hosting proxy the real client is the first X-Forwarded-For entry
    forwarded = request.headers.get('X-Forwarded-For', '')
    return forwarded.split(',')[0].strip() or request.remote_addr or 'unknown'


def _over_limits():
    """An error message if this request should be turned away, else None."""
    now = time.time()
    if RATE_LIMIT_PER_HOUR:
        stamps = [t for t in recent_requests.get(_visitor(), []) if now - t < 3600]
        recent_requests[_visitor()] = stamps
        if len(stamps) >= RATE_LIMIT_PER_HOUR:
            return f"That's {RATE_LIMIT_PER_HOUR} songs this hour - the free server needs a break. Try the examples meanwhile."
    if MAX_QUEUED:
        with jobs_lock:
            waiting = sum(1 for j in jobs.values() if j['status'] == 'running')
        if waiting >= MAX_QUEUED:
            return "The server is busy with other songs right now. Try again in a minute."
    return None


def _cleanup_loop():
    """Delete finished jobs (and their files) older than JOB_TTL_HOURS."""
    while True:
        cutoff = time.time() - JOB_TTL_HOURS * 3600
        with jobs_lock:
            old = [k for k, j in jobs.items() if j['status'] != 'running' and j.get('_created', 0) < cutoff]
            for k in old:
                jobs.pop(k)
        for name in os.listdir(JOBS_DIR):
            path = os.path.join(JOBS_DIR, name)
            if name not in jobs and os.path.isdir(path) and os.path.getmtime(path) < cutoff:
                shutil.rmtree(path, ignore_errors=True)
        time.sleep(600)


if JOB_TTL_HOURS:
    threading.Thread(target=_cleanup_loop, daemon=True).start()


def update_job(job_id, **fields):
    with jobs_lock:
        jobs[job_id].update(fields)


def job_view(job):
    return {k: v for k, v in job.items() if not k.startswith('_')}


def _read_text(path):
    try:
        with open(path, encoding='utf-8') as f:
            return f.read()
    except OSError:
        return None


def run_job(job_id):
    job = jobs[job_id]
    job_dir = job['_dir']
    started = time.time()
    try:
        source = job['_source']
        if job['_url']:
            update_job(job_id, stage='downloading', progress=0.02)
            source, title = download_audio(job['_url'], job_dir, has_range=job['_range'] != (0.0, None))
            update_job(job_id, title=title)

        video_path = None
        if job['video_type'] == 'tab':
            update_job(job_id, stage='downloading', progress=0.03)
            video_path = download_video(job['_url'], job_dir) if job['_url'] else source
            if not video_path or not has_video(video_path):
                raise ProcessingError("Tabs on screen needs a video with the tab in it; this file has no picture.")

        captions = None
        if job['video_type'] == 'tutorial' and job['_url']:
            update_job(job_id, stage='listening', progress=0.04)
            captions = fetch_captions(job['_url'], job_dir)

        def progress(stage, frac):
            update_job(job_id, stage=stage, progress=frac)

        result = transcribe(source, job_dir, separate=job['separate'], tuning=job['_tuning'], progress=progress,
                            video_type=job['video_type'], captions=captions,
                            start=job['_range'][0], end=job['_range'][1], video_path=video_path,
                            description=_read_text(os.path.join(job_dir, 'description.txt')))
        base = f"/api/jobs/{job_id}/files"
        result['files'] = {
            'original': f"{base}/original.mp3",
            'midi': f"{base}/transcription.mid",
            'text': f"{base}/tab.txt",
        }
        if (result.get('video_tab') or {}).get('frame_image'):
            result['files']['tab_frame'] = f"{base}/tabframe.jpg"
        update_job(job_id, status='done', stage='done', progress=1.0, result=result)
        log.info("Job %s finished in %.1fs (%d notes)", job_id, time.time() - started, result['note_count'])
    except ProcessingError as e:
        update_job(job_id, status='error', error=str(e))
    except Exception as e:
        traceback.print_exc()
        update_job(job_id, status='error', error=f"Unexpected error: {e}")


@app.route('/')
def home():
    return "Backend is running!"


@app.route('/api/health')
def health():
    return jsonify({
        'ok': True,
        'separation_available': separation_available(),
        'speech_available': speech_available(),
        'video_types': sorted(VIDEO_TYPES),
        'tunings': tuning_presets(),
        'max_capo': MAX_CAPO,
        'max_duration': MAX_DURATION_S,
    })


@app.route('/api/jobs', methods=['POST'])
def create_job():
    refusal = _over_limits()
    if refusal:
        return jsonify({'error': refusal}), 429
    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(JOBS_DIR, job_id)
    url, source, title = None, None, None

    # Uploads send multipart form fields, links send JSON; options are read from either.
    options = request.form if 'file' in request.files else (request.get_json(silent=True) or {})
    try:
        tuning = resolve_tuning(options.get('tuning', 'standard'), options.get('capo', 0), options.get('custom_tuning'))
        clip_range = resolve_range(options.get('start'), options.get('end'))
    except ProcessingError as e:
        return jsonify({'error': str(e)}), 400
    video_type = options.get('video_type', 'song') or 'song'
    if video_type not in VIDEO_TYPES:
        return jsonify({'error': f"Unknown video type '{video_type}'."}), 400

    if 'file' in request.files:
        file = request.files['file']
        name = secure_filename(file.filename or '')
        ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
        if ext not in ALLOWED_EXTENSIONS:
            return jsonify({'error': f"Unsupported file type '.{ext}'."}), 400
        os.makedirs(job_dir)
        source = os.path.join(job_dir, f"source.{ext}")
        file.save(source)
        title = file.filename
        separate = options.get('separate', 'true') == 'true'
    else:
        try:
            url = validate_url(options.get('url', ''))
        except ProcessingError as e:
            return jsonify({'error': str(e)}), 400
        os.makedirs(job_dir)
        title = url
        separate = bool(options.get('separate', True))

    with jobs_lock:
        jobs[job_id] = {
            'id': job_id, 'status': 'running', 'stage': 'queued', 'progress': 0.0,
            'title': title, 'separate': separate and separation_available(), 'error': None, 'result': None,
            'tuning': tuning['name'], 'capo': tuning['capo'], 'video_type': video_type,
            '_dir': job_dir, '_source': source, '_url': url, '_tuning': tuning, '_range': clip_range,
            '_created': time.time(),
        }
    if RATE_LIMIT_PER_HOUR:
        recent_requests.setdefault(_visitor(), []).append(time.time())  # only accepted jobs count
    executor.submit(run_job, job_id)
    return jsonify(job_view(jobs[job_id])), 202


@app.route('/api/jobs/<job_id>')
def get_job(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    with jobs_lock:
        return jsonify(job_view(job))


@app.route('/api/jobs/<job_id>/files/<name>')
def job_file(job_id, name):
    job = jobs.get(job_id)
    if not job or name not in SERVED_FILES:
        abort(404)
    return send_from_directory(job['_dir'], name, as_attachment=name.endswith(('.mid', '.txt')))


if __name__ == '__main__':
    # Port 5000 is taken by AirPlay Receiver on macOS, so default to 5001.
    port = int(os.environ.get('PORT', 5001))
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)
