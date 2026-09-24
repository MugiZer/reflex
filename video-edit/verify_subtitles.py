from pathlib import Path
import json
import subprocess
import cv2
import numpy as np
from PIL import ImageFont
import imageio_ffmpeg

root = Path(__file__).resolve().parent
downloads = Path(r'C:\Users\moham\Downloads')
source_path = downloads / 'reflex demo - retimed diagrams and webcam.mp4'
final_path = downloads / 'reflex demo - FINAL subtitled.mp4'
cues = json.loads((root / 'subtitle-cues.json').read_text(encoding='utf-8'))
for start, end, text in cues:
    size, width = (42, 1740) if start < 31.3 else (38, 1340)
    font = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', size)
    assert font.getlength(text) < width - 20, text
source = cv2.VideoCapture(str(source_path))
final = cv2.VideoCapture(str(final_path))
assert source.isOpened() and final.isOpened()
assert source.get(cv2.CAP_PROP_FRAME_COUNT) == final.get(cv2.CAP_PROP_FRAME_COUNT)
assert final.get(cv2.CAP_PROP_FRAME_WIDTH) == 1920
assert final.get(cv2.CAP_PROP_FRAME_HEIGHT) == 1080

def frame(cap, seconds):
    cap.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
    ok, result = cap.read()
    assert ok, seconds
    return result

def error(a, b):
    return float(np.mean(np.abs(a.astype(np.float32) - b.astype(np.float32))))

checks = []
for start, end, text in cues:
    seconds = (start + end) / 2
    a, b = frame(source, seconds), frame(final, seconds)
    band = (slice(930, 1030), slice(90, 1830)) if start < 31.3 else (slice(918, 990), slice(80, 1420))
    difference = error(a[band], b[band])
    assert difference > 0.4, (seconds, text, difference)
    assert error(a[:915], b[:915]) < 6, ('diagram changed', seconds)
    if start >= 31.3:
        assert error(a[815:1044, 1476:1880], b[815:1044, 1476:1880]) < 6, ('webcam changed', seconds)
    checks.append({'time': round(seconds, 3), 'caption': text, 'visible': True})

assert error(frame(source, 94), frame(final, 94)) < 6
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
def audio_hash(file):
    return subprocess.run([ffmpeg, '-v', 'error', '-i', str(file), '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-'], capture_output=True, text=True, check=True).stdout.strip()
assert audio_hash(source_path) == audio_hash(final_path)
cv2.imwrite(str(root / 'final-caption-preview.jpg'), frame(final, 76))
cv2.imwrite(str(root / 'final-proof-caption-preview.jpg'), frame(final, 84))
report = {'all_cues_visible': len(checks), 'captions_fit_available_width': True, 'diagram_and_webcam_preserved': True, 'original_audio_bit_identical': True, 'ending_hold_caption_free': True, 'duration_seconds': final.get(cv2.CAP_PROP_FRAME_COUNT) / final.get(cv2.CAP_PROP_FPS), 'checks': checks}
(root / 'verification-subtitles.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
source.release()
final.release()
print(json.dumps({k: v for k, v in report.items() if k != 'checks'}, indent=2))
