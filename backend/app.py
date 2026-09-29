import logging
import os
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

from audio_processor import MAX_CAPO, ProcessingError, resolve_tuning, separation_available, transcribe, tuning_presets
from sources import download_audio, validate_url

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
log = logging.getLogger('app')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JOBS_DIR = os.path.join(BASE_DIR, 'jobs')
os.makedirs(JOBS_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {'mp3', 'wav', 'm4a', 'mp4', 'flac', 'ogg', 'aac', 'webm', 'aiff', 'aif', 'opus', 'mov'}
SERVED_FILES = {'original.mp3', 'transcription.mid', 'tab.txt'}

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024
CORS(app)

# The ML models are memory-heavy, so jobs run one at a time.
executor = ThreadPoolExecutor(max_workers=1)
jobs = {}
jobs_lock = threading.Lock()


def update_job(job_id, **fields):
    with jobs_lock:
        jobs[job_id].update(fields)


def job_view(job):
    return {k: v for k, v in job.items() if not k.startswith('_')}


def run_job(job_id):
    job = jobs[job_id]
    job_dir = job['_dir']
    started = time.time()
    try:
        source = job['_source']
        if job['_url']:
            update_job(job_id, stage='downloading', progress=0.02)
            source, title = download_audio(job['_url'], job_dir)
            update_job(job_id, title=title)

        def progress(stage, frac):
            update_job(job_id, stage=stage, progress=frac)

        result = transcribe(source, job_dir, separate=job['separate'], tuning=job['_tuning'], progress=progress)
        base = f"/api/jobs/{job_id}/files"
        result['files'] = {
            'original': f"{base}/original.mp3",
            'midi': f"{base}/transcription.mid",
            'text': f"{base}/tab.txt",
        }
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
        'tunings': tuning_presets(),
        'max_capo': MAX_CAPO,
    })


@app.route('/api/jobs', methods=['POST'])
def create_job():
    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(JOBS_DIR, job_id)
    url, source, title = None, None, None

    # Uploads send multipart form fields, links send JSON; options are read from either.
    options = request.form if 'file' in request.files else (request.get_json(silent=True) or {})
    try:
        tuning = resolve_tuning(options.get('tuning', 'standard'), options.get('capo', 0), options.get('custom_tuning'))
    except ProcessingError as e:
        return jsonify({'error': str(e)}), 400

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
            'tuning': tuning['name'], 'capo': tuning['capo'],
            '_dir': job_dir, '_source': source, '_url': url, '_tuning': tuning,
        }
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
