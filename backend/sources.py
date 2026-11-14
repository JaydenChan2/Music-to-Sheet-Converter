"""Fetch audio from a link (YouTube, SoundCloud, Bandcamp, direct .mp3 URLs, ...)."""
import os
from urllib.parse import urlparse

from audio_processor import MAX_DURATION_S, MAX_SOURCE_S, ProcessingError, clock


def validate_url(url):
    parsed = urlparse(url.strip())
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise ProcessingError("Please enter a valid http(s) link.")
    return url.strip()


def download_audio(url, dest_dir, has_range=False):
    """Download the best audio stream for url into dest_dir. Returns (path, title).

    Without a start/end selection the video must fit the transcription limit; with
    one, the whole audio track is fetched (cheap) and the range is cut out later.
    """
    import yt_dlp

    opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(dest_dir, 'source.%(ext)s'),
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
        'max_filesize': 200 * 1024 * 1024,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            # Look first, download second: checking the length up front gives a
            # clear error instead of yt-dlp silently skipping the download.
            info = ydl.extract_info(url, download=False)
            if info.get('_type') == 'playlist':
                raise ProcessingError("Playlists aren't supported; link a single track.")
            duration = info.get('duration')
            if duration and duration > MAX_SOURCE_S:
                raise ProcessingError(f"This video is {clock(duration)} long; the longest supported is {MAX_SOURCE_S // 3600} hours.")
            if duration and duration > MAX_DURATION_S and not has_range:
                raise ProcessingError(
                    f"This video is {clock(duration)} long; up to {MAX_DURATION_S // 60} minutes can be transcribed "
                    "at once. Set a start and end time to pick the part you want."
                )
            info = ydl.process_ie_result(info, download=True)
            path = ydl.prepare_filename(info)
    except yt_dlp.utils.DownloadError as e:
        msg = str(e).replace('ERROR: ', '')
        raise ProcessingError(f"Couldn't download that link: {msg[:300]}")

    if not os.path.exists(path):
        raise ProcessingError("The download didn't produce an audio file (the file may be over 200 MB, "
                              "or the site blocked the download).")
    return path, info.get('title') or 'Linked track'
