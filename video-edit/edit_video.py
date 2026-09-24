from pathlib import Path
import json
import subprocess
import imageio_ffmpeg

root = Path(__file__).resolve().parent
source = Path(r'C:\Users\moham\Downloads\reflex demo.mp4')
output = source.with_name('reflex demo - diagrams and mirrored.mp4')
assets = root.parent / 'assets'
placements = [
    ('01-matched-comparison', 24, 30),
    ('02-execution-path', 30, 38),
    ('03-evidence-ranking', 38, 46),
    ('04-measurement-selection', 46, 55),
    ('05-controlled-verification', 55, 64),
    ('06-real-t4-result', 64, 74),
]
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [ffmpeg, '-hide_banner', '-nostdin', '-n', '-i', str(source)]
for stem, _, _ in placements:
    cmd += ['-i', str(assets / (stem + '.png'))]
filters = ['[0:v]hflip[base0]']
for index, (_, start, end) in enumerate(placements, 1):
    filters += [
        f'[{index}:v]scale=1920:1080:flags=lanczos,setsar=1[card{index}]',
        f"[base{index - 1}][card{index}]overlay=0:0:enable='gte(t,{start})*lt(t,{end})':eof_action=repeat:repeatlast=1[base{index}]",
    ]
cmd += [
    '-filter_complex_threads', '2', '-filter_complex', ';'.join(filters),
    '-map', '[base6]', '-map', '0:a:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-threads', '4',
    '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-c:a', 'copy',
    '-movflags', '+faststart', '-progress', str(root / 'progress.txt'),
    '-nostats', str(output),
]
(root / 'edit-manifest.json').write_text(json.dumps({
    'source': str(source), 'output': str(output),
    'mirror': 'Horizontal flip of source video before diagram compositing',
    'audio': 'Original AAC stream copied without re-encoding',
    'placements': [{'asset': name + '.png', 'start_seconds': start, 'end_seconds_exclusive': end} for name, start, end in placements],
    'transitions': 'Exact cuts at the agreed time boundaries',
}, indent=2), encoding='utf-8')
with (root / 'render.log').open('w', encoding='utf-8') as log:
    result = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT)
if result.returncode:
    raise RuntimeError((root / 'render.log').read_text(encoding='utf-8')[-5000:])
print(f'Export complete: {output}\nSize: {output.stat().st_size:,} bytes')
