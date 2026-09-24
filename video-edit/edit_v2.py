from pathlib import Path
import json
import subprocess
import cv2
import imageio_ffmpeg

root = Path(__file__).resolve().parent
source = Path(r'C:\Users\moham\Downloads\reflex demo.mp4')
output = source.with_name('reflex demo - retimed diagrams and webcam.mp4')
assets = root / 'v2-frames'
cap = cv2.VideoCapture(str(source))
source_duration = cap.get(cv2.CAP_PROP_FRAME_COUNT) / cap.get(cv2.CAP_PROP_FPS)
cap.release()
hold = 4.0
placements = [
    ('01-matched-comparison', 31.3, 39.4),
    ('02-execution-path', 39.4, 50.4),
    ('03-evidence-ranking', 50.4, 60.5),
    ('04-measurement-selection', 60.5, 68.8),
    ('05-controlled-verification', 68.8, 80.3),
    ('06-real-t4-result', 80.3, source_duration + hold),
]
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [ffmpeg, '-hide_banner', '-nostdin', '-n', '-i', str(source)]
for stem, _, _ in placements:
    cmd += ['-i', str(assets / (stem + '.png'))]
filters = [
    '[0:v]hflip,split=2[full][camera]',
    f'[full]tpad=stop_mode=clone:stop_duration={hold}[base0]',
    f'[camera]crop=1344:756:288:162,scale=400:225:flags=lanczos,setsar=1,pad=404:229:2:2:color=0x778b97,format=rgba,fade=t=out:st={source_duration - 0.35}:d=0.35:alpha=1[webcam]',
]
for i, (_, start, end) in enumerate(placements, 1):
    filters += [
        f'[{i}:v]setsar=1[card{i}]',
        f"[base{i-1}][card{i}]overlay=0:0:enable='gte(t,{start})':eof_action=repeat:repeatlast=1[base{i}]",
    ]
filters += ["[base6][webcam]overlay=1476:815:enable='gte(t,31.3)':eof_action=pass:repeatlast=0[final]"]
cmd += [
    '-filter_complex_threads', '2', '-filter_complex', ';'.join(filters),
    '-map', '[final]', '-map', '0:a:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-threads', '4',
    '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-c:a', 'copy',
    '-movflags', '+faststart', '-progress', str(root / 'progress-v2.txt'),
    '-nostats', str(output),
]
manifest = {
    'source': str(source), 'output': str(output), 'source_duration': source_duration,
    'final_reading_hold_seconds': hold,
    'timing_basis': 'Word timestamps from local transcription of the actual video',
    'mirror': 'Source footage mirrored horizontally; diagrams unmirrored',
    'webcam': {'source_crop': [288, 162, 1344, 756], 'output_rect': [1476, 815, 404, 229], 'visible_from': 31.3, 'fade_out_seconds': 0.35},
    'audio': 'Original AAC packets copied; ending reading hold is silent',
    'placements': [{'asset': name + '.png', 'start_seconds': start, 'end_seconds_exclusive': end} for name, start, end in placements],
}
(root / 'edit-manifest-v2.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
with (root / 'render-v2.log').open('w', encoding='utf-8') as log:
    result = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT)
if result.returncode:
    raise RuntimeError((root / 'render-v2.log').read_text(encoding='utf-8')[-5000:])
print(f'Export complete: {output}\nSize: {output.stat().st_size:,} bytes')
