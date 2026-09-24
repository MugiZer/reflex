from pathlib import Path
import json
from faster_whisper import WhisperModel

root = Path(__file__).resolve().parent
model = WhisperModel('base.en', device='cpu', compute_type='int8', cpu_threads=6)
segments, info = model.transcribe(
    r'C:\Users\moham\Downloads\reflex demo.mp4',
    language='en', word_timestamps=True, vad_filter=True, beam_size=5,
    initial_prompt='Reflex. Root inference regression debugger. CPU, CUDA, GPU. SmolVLA running on an NVIDIA T4. Healthy runs, statistical and ML models, execution graph, profiler, end-to-end latency.',
)
rows = []
for segment in segments:
    row = {'start': segment.start, 'end': segment.end, 'text': segment.text,
           'words': [{'start': w.start, 'end': w.end, 'word': w.word} for w in segment.words]}
    rows.append(row)
    print(f'{segment.start:.2f} - {segment.end:.2f}: {segment.text}', flush=True)
(root / 'timed-transcript.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
