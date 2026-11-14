# Backend image for Hugging Face Spaces (Docker SDK) or any Docker host.
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces runs containers as user 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /home/user/app

# CPU-only PyTorch first, so demucs doesn't pull the multi-GB CUDA build.
RUN pip install --no-cache-dir --user torch torchaudio --index-url https://download.pytorch.org/whl/cpu
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user . .
# Download / load every model now, so the first visitor doesn't wait for it.
RUN python warmup.py

# Public-hosting settings (override in the Space's "Variables" tab).
ENV PORT=7860 \
    MAX_DURATION_S=180 \
    MAX_UPLOAD_MB=60 \
    RATE_LIMIT_PER_HOUR=12 \
    MAX_QUEUED=3 \
    JOB_TTL_HOURS=6 \
    WHISPER_MODEL=base
EXPOSE 7860

# One process (job state lives in memory), several threads for status polling.
CMD gunicorn --workers 1 --threads 8 --timeout 120 --bind 0.0.0.0:${PORT} app:app
