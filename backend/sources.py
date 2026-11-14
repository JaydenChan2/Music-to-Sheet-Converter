"""Fetch audio from a link (YouTube, SoundCloud, Bandcamp, direct .mp3 URLs, ...)."""
import os
from urllib.parse import urlparse

from audio_processor import MAX_DURATION_S, MAX_SOURCE_S, ProcessingError, clock


def _is_public(host):
    """True if every address the host resolves to is on the public internet."""
    import ipaddress
    import socket
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return True  # let the downloader report unknown hosts in its own words
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split('%')[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


def validate_url(url):
    parsed = urlparse(url.strip())
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise ProcessingError("Please enter a valid http(s) link.")
    # The server fetches this link, so never let it reach its own network
    # (localhost, cloud metadata at 169.254.169.254, private ranges...).
    if os.environ.get('ALLOW_PRIVATE_URLS') != '1' and not _is_public(parsed.hostname or ''):
        raise ProcessingError("That link points to a private network address.")
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
    # keep the title/description: they often state the tuning or capo ("Drop D", "Capo 2")
    with open(os.path.join(dest_dir, 'description.txt'), 'w', encoding='utf-8') as f:
        f.write((info.get('title') or '') + '\n' + (info.get('description') or ''))
    return path, info.get('title') or 'Linked track'


def download_video(url, dest_dir):
    """Download the picture (no audio, at most 720p) for reading on-screen tabs."""
    import yt_dlp
    opts = {
        'format': 'bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]/best[height<=720]',
        'outtmpl': os.path.join(dest_dir, 'video.%(ext)s'),
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
        'max_filesize': 400 * 1024 * 1024,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            path = ydl.prepare_filename(info)
    except yt_dlp.utils.DownloadError as e:
        raise ProcessingError(f"Couldn't download the video picture: {str(e).replace('ERROR: ', '')[:300]}")
    return path if os.path.exists(path) else None


def has_video(path):
    import subprocess
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type',
                          '-of', 'csv=p=0', path], capture_output=True, text=True).stdout
    return 'video' in out
