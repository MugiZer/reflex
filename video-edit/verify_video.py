from pathlib import Path
import json
import subprocess
import cv2
import numpy as np
import imageio_ffmpeg

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'edit-manifest.json').read_text(encoding='utf-8'))
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
source = cv2.VideoCapture(manifest['source'])
output = cv2.VideoCapture(manifest['output'])
assert source.isOpened() and output.isOpened()
assert output.get(cv2.CAP_PROP_FRAME_WIDTH) == 1920
assert output.get(cv2.CAP_PROP_FRAME_HEIGHT) == 1080
assert abs(source.get(cv2.CAP_PROP_FRAME_COUNT) - output.get(cv2.CAP_PROP_FRAME_COUNT)) <= 1

def frame(cap, seconds):
    cap.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
    ok, image = cap.read()
    assert ok, seconds
    return image

def difference(a, b):
    return float(np.mean(np.abs(a.astype(np.float32) - b.astype(np.float32))))

checks = []
thumbnails = []
for item in manifest['placements']:
    target = cv2.imread(str(root.parent / 'assets' / item['asset']))
    target = cv2.resize(target, (1920, 1080), interpolation=cv2.INTER_LANCZOS4)
    for seconds in [item['start_seconds'] + 0.1, item['end_seconds_exclusive'] - 0.1]:
        actual = frame(output, seconds)
        error = difference(actual, target)
        assert error < 8, (seconds, error)
        checks.append({'time_seconds': seconds, 'asset': item['asset'], 'mean_pixel_error': round(error, 3)})
    thumbnails.append(cv2.resize(actual, (640, 360)))

for seconds in [5, 23.9, 74.1, 85]:
    expected = cv2.flip(frame(source, seconds), 1)
    actual = frame(output, seconds)
    error = difference(actual, expected)
    assert error < 12, ('mirror', seconds, error)
    checks.append({'time_seconds': seconds, 'source_mirrored': True, 'mean_pixel_error': round(error, 3)})

def audio_hash(filename):
    result = subprocess.run([ffmpeg, '-v', 'error', '-i', filename, '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-'], capture_output=True, text=True, check=True)
    return result.stdout.strip()

original_audio = audio_hash(manifest['source'])
edited_audio = audio_hash(manifest['output'])
assert original_audio == edited_audio
report = {'resolution': '1920x1080', 'frames': int(output.get(cv2.CAP_PROP_FRAME_COUNT)), 'fps': output.get(cv2.CAP_PROP_FPS), 'original_audio_bit_identical': True, 'audio_hash': edited_audio, 'visual_checks': checks}
(root / 'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
cv2.imwrite(str(root / 'edited-diagrams-preview.jpg'), cv2.vconcat([cv2.hconcat(thumbnails[i:i + 2]) for i in range(0, 6, 2)]))
cv2.imwrite(str(root / 'mirrored-preview.jpg'), cv2.resize(frame(output, 5), (1280, 720)))
source.release()
output.release()
print(json.dumps(report, indent=2))
