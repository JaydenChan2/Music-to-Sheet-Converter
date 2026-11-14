"""Load (and download) every model once, at image build time."""
import logging

logging.basicConfig(level=logging.INFO)

import audio_processor as ap  # noqa: E402
import digit_model  # noqa: E402
import tutorial  # noqa: E402

ap._get_basic_pitch()
print('basic-pitch ready')
if ap.separation_available():
    ap._get_demucs()
    print('Demucs ready')
if tutorial.speech_available():
    from faster_whisper import WhisperModel
    WhisperModel(tutorial.WHISPER_MODEL, device='cpu', compute_type='int8')
    print('Whisper ready')
digit_model.get_model()
print('digit reader ready')
