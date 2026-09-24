from pathlib import Path
import json
import subprocess
import cv2
import numpy as np
import imageio_ffmpeg

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'edit-manifest-v2.json').read_text(encoding='utf-8'))
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
source = cv2.VideoCapture(manifest['source'])
output = cv2.VideoCapture(manifest['output'])
assert source.isOpened() and output.isOpened()
fps = output.get(cv2.CAP_PROP_FPS)
duration = output.get(cv2.CAP_PROP_FRAME_COUNT) / fps
assert abs(duration - manifest['source_duration'] - 4) < 0.05
assert output.get(cv2.CAP_PROP_FRAME_WIDTH) == 1920
assert output.get(cv2.CAP_PROP_FRAME_HEIGHT) == 1080

def frame(cap, seconds):
    cap.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
    ok, image = cap.read()
    assert ok, seconds
    return image

def error(a, b):
    return float(np.mean(np.abs(a.astype(np.float32) - b.astype(np.float32))))

checks = []
thumbs = []
mask = np.ones((1080, 1920), dtype=bool)
mask[810:1050, 1470:1885] = False
for item in manifest['placements']:
    target = cv2.imread(str(root / 'v2-frames' / item['asset']))
    for seconds in [item['start_seconds'] + 0.1, item['end_seconds_exclusive'] - 0.1]:
        actual = frame(output, seconds)
        difference = error(actual[mask], target[mask])
        assert difference < 8, (seconds, difference)
        checks.append({'time': round(seconds, 3), 'expected_diagram': item['asset'], 'mean_pixel_error': round(difference, 3)})
    midpoint = (item['start_seconds'] + min(item['end_seconds_exclusive'], 91)) / 2
    actual = frame(output, midpoint)
    mirrored = cv2.flip(frame(source, midpoint), 1)
    camera = cv2.resize(mirrored[162:918, 288:1632], (400, 225), interpolation=cv2.INTER_LANCZOS4)
    difference = error(actual[817:1042, 1478:1878], camera)
    assert difference < 12, ('webcam', midpoint, difference)
    checks.append({'time': round(midpoint, 3), 'mirrored_webcam': True, 'mean_pixel_error': round(difference, 3)})
    thumbs.append(cv2.resize(actual, (640, 360)))

for seconds in [5, 31.1]:
    difference = error(frame(output, seconds), cv2.flip(frame(source, seconds), 1))
    assert difference < 12, ('intro', seconds, difference)

final = frame(output, duration - 0.2)
proof = cv2.imread(str(root / 'v2-frames' / '06-real-t4-result.png'))
assert error(final, proof) < 8

def audio_hash(filename):
    return subprocess.run([ffmpeg, '-v', 'error', '-i', filename, '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-'], capture_output=True, text=True, check=True).stdout.strip()

assert audio_hash(manifest['source']) == audio_hash(manifest['output'])
report = {'duration_seconds': duration, 'resolution': '1920x1080', 'fps': fps, 'original_audio_bit_identical': True, 'final_proof_hold_verified': True, 'checks': checks}
(root / 'verification-v2.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
cv2.imwrite(str(root / 'v2-contact-sheet.jpg'), cv2.vconcat([cv2.hconcat(thumbs[i:i+2]) for i in range(0, 6, 2)]))
cv2.imwrite(str(root / 'v2-webcam-preview.jpg'), frame(output, 75))
cv2.imwrite(str(root / 'v2-proof-preview.jpg'), frame(output, 87))
source.release()
output.release()
print(json.dumps(report, indent=2))
