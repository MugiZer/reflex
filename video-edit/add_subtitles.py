from pathlib import Path
import json
import subprocess
import imageio_ffmpeg

root = Path(__file__).resolve().parent
downloads = Path(r'C:\Users\moham\Downloads')
source = downloads / 'reflex demo - retimed diagrams and webcam.mp4'
output = downloads / 'reflex demo - FINAL subtitled.mp4'
cues = [
    (1.17, 3.98, 'Reflex has some of the fastest inference in the world.'),
    (4.05, 5.57, 'So I wondered:'),
    (5.61, 7.82, 'How do you guys handle hard'),
    (7.83, 10.10, 'inference regressions efficiently?'),
    (10.67, 13.74, "That's hard because you have to disentangle"),
    (13.75, 16.80, 'difficult regressions,'),
    (16.81, 18.42, 'where the slowest-looking component'),
    (18.43, 19.65, "isn't always the root cause."),
    (19.81, 22.05, "I've been working on this for the past three weeks."),
    (22.15, 25.22, 'I used a swarm of agents to screen over 3,000 papers,'),
    (25.23, 27.58, 'then distilled the useful mechanisms'),
    (27.59, 31.24, 'into this inference-regression debugger called Root.'),
    (31.30, 35.28, 'It starts by matching the bad execution'),
    (35.29, 36.48, 'against healthy runs'),
    (36.49, 39.00, 'from the same hardware and software context.'),
    (39.41, 41.40, 'Then it measures what actually changed,'),
    (41.41, 43.33, 'down to individual GPU kernels,'),
    (43.35, 47.36, 'and reconstructs the CPU-to-CUDA-to-GPU'),
    (47.37, 50.14, 'execution path.'),
    (50.49, 52.40, 'Then it combines multiple statistical'),
    (52.41, 55.55, 'and machine-learning models with the execution graph'),
    (55.56, 57.80, 'to narrow down where'),
    (57.81, 60.20, 'the regression actually originated.'),
    (60.51, 63.00, 'If several causes are still plausible,'),
    (63.25, 65.04, 'it chooses the next measurement'),
    (65.05, 66.32, 'that would best separate them,'),
    (66.33, 68.60, 'rather than turning on every expensive profiler.'),
    (68.77, 71.87, 'Once it has a strong explanation,'),
    (72.25, 75.34, 'it tests that cause directly'),
    (75.35, 77.44, 'and checks whether the system changes as expected'),
    (77.45, 80.00, 'and end-to-end latency recovers.'),
    (80.01, 82.62, 'I tested it on a real SmolVLA model'),
    (82.63, 84.66, 'on an NVIDIA T4,'),
    (84.67, 86.68, 'where it localized large'),
    (86.69, 90.00, 'GPU timing regressions.'),
    (90.15, 91.35, 'Here are some examples.'),
]

def srt_time(seconds):
    ms = round(seconds * 1000)
    return f'{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}'

def ass_time(seconds):
    cs = round(seconds * 100)
    return f'{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}'

for index, (start, end, text) in enumerate(cues):
    assert end > start and len(text) <= 60
    if index:
        assert start >= cues[index - 1][1]

srt = '\n\n'.join(f'{i}\n{srt_time(start)} --> {srt_time(end)}\n{text}' for i, (start, end, text) in enumerate(cues, 1)) + '\n'
(downloads / 'reflex demo - FINAL subtitled.srt').write_text(srt, encoding='utf-8')
ass = '''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Camera,Arial,42,&H00FFFFFF,&H00FFFFFF,&H40000000,&H40000000,0,0,0,0,100,100,0,0,3,9,0,2,90,90,72,1
Style: Diagram,Arial,38,&H00FFFFFF,&H00FFFFFF,&H40000000,&H40000000,0,0,0,0,100,100,0,0,3,8,0,2,80,500,110,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
for start, end, text in cues:
    style = 'Camera' if start < 31.3 else 'Diagram'
    # Switch layout at the proof cut without changing the spoken subtitle.
    ass += f'Dialogue: 0,{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{text}\n'
(root / 'final-subtitles.ass').write_text(ass, encoding='utf-8-sig')
(root / 'subtitle-cues.json').write_text(json.dumps(cues, indent=2), encoding='utf-8')
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [ffmpeg, '-hide_banner', '-nostdin', '-n', '-i', str(source),
       '-vf', 'ass=final-subtitles.ass', '-map', '0:v:0', '-map', '0:a:0',
       '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-threads', '4',
       '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-c:a', 'copy',
       '-movflags', '+faststart', '-progress', str(root / 'progress-subtitles.txt'),
       '-nostats', str(output)]
with (root / 'render-subtitles.log').open('w', encoding='utf-8') as log:
    result = subprocess.run(cmd, cwd=root, stdout=log, stderr=subprocess.STDOUT)
if result.returncode:
    raise RuntimeError((root / 'render-subtitles.log').read_text(encoding='utf-8')[-5000:])
print(f'Final subtitled export: {output}\n{len(cues)} subtitle cues; {output.stat().st_size:,} bytes')
