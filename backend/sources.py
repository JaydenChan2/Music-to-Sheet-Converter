"""Fetch audio from a link (YouTube, SoundCloud, Bandcamp, direct .mp3 URLs, ...)."""
import os
from urllib.parse import urlparse

from audio_processor import MAX_DURATION_S, ProcessingError


def validate_url(url):
    parsed = urlparse(url.strip())
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise ProcessingError("Please enter a valid http(s) link.")
    return url.strip()


def download_audio(url, dest_dir):
    """Download the best audio stream for url into dest_dir. Returns (path, title)."""
    import yt_dlp

    def too_long(info, *, incomplete):
        duration = info.get('duration')
        if duration and duration > MAX_DURATION_S:
            return f"Track is longer than {MAX_DURATION_S // 60} minutes."
        return None

    opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(dest_dir, 'source.%(ext)s'),
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'match_filter': too_long,
        'max_filesize': 200 * 1024 * 1024,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info.get('_type') == 'playlist':
                raise ProcessingError("Playlists aren't supported; link a single track.")
            path = ydl.prepare_filename(info)
    except yt_dlp.utils.DownloadError as e:
        msg = str(e).replace('ERROR: ', '')
        raise ProcessingError(f"Couldn't download that link: {msg[:300]}")

    if not os.path.exists(path):
        raise ProcessingError("Download finished but no audio file was produced.")
    return path, info.get('title') or 'Linked track'
