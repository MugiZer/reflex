import json
import os
from pathlib import Path

base = Path('/content/reflex-network')
pid = int((base / 'main.pid').read_text())
public = base / 'main/public'
blocks = len(list(public.glob('block-*-manifest.json'))) if public.exists() else 0
inflight = public / 'block-0136.jsonl'
rows = 0
for manifest in public.glob('block-*-manifest.json') if public.exists() else []:
    try:
        rows += json.loads(manifest.read_text())['population']['counts']['eligible']
    except (ValueError, KeyError):
        pass
stderr = base / 'main.stderr'
print(json.dumps({'pid': pid, 'alive': Path(f'/proc/{pid}').exists(),
                  'state': Path(f'/proc/{pid}/stat').read_text().split()[2] if Path(f'/proc/{pid}/stat').exists() else None,
                  'blocks': blocks, 'requests': rows,
                  'inflight_rows': len(inflight.read_text().splitlines()) if inflight.exists() else 0,
                  'done': (base / 'main/checksums.json').exists(),
                  'error_tail': stderr.read_text()[-200:] if stderr.exists() else ''}))
