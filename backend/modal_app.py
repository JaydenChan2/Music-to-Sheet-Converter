import modal

app = modal.App("guitar-tab-api")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("torch", "torchaudio", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install_from_requirements("requirements.txt")
    .add_local_dir(".", "/root/app", copy=True,
                   ignore=[".venv", "venv", ".cache", "__pycache__", "jobs",
                           "uploads", "outputs", ".benchmark_cache",
                           "modal_app.py"])
    .run_commands("cd /root/app && python warmup.py")
    # Settings go last, so changing them later doesn't redo the expensive steps above
    .env({
        "MAX_DURATION_S": "180", "MAX_UPLOAD_MB": "60",
        "RATE_LIMIT_PER_HOUR": "12", "MAX_QUEUED": "3",
        "JOB_TTL_HOURS": "6", "WHISPER_MODEL": "base",
        "ALLOWED_ORIGINS": "https://music-to-sheet-converter.vercel.app",
    })
)

@app.function(image=image, cpu=2, memory=8192,
              max_containers=1, scaledown_window=60, timeout=900)
@modal.concurrent(max_inputs=20)
@modal.wsgi_app()
def web():
    import os, sys
    os.chdir("/root/app")
    sys.path.insert(0, "/root/app")
    from app import app as flask_app
    return flask_app