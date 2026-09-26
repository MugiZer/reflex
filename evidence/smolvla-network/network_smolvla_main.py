import json
import subprocess
import sys
from pathlib import Path

base = Path('/content/reflex-network')
repo = base / 'reflex'
stdout = (base / 'main.stdout').open('w')
stderr = (base / 'main.stderr').open('w')
process = subprocess.Popen([
    sys.executable, 'scripts/network_smolvla_farm.py',
    '--corpus', str(repo / 'workloads/smolvla/corpora'),
    '--output', str(base / 'main'),
    '--requests', '8', '--repetitions', '3',
    '--production-requests', '210'], cwd=repo,
    stdout=stdout, stderr=stderr, start_new_session=True)
(base / 'main.pid').write_text(str(process.pid))
print(json.dumps({'pid': process.pid, 'output': str(base / 'main'),
                  'controlled_blocks_planned': 135,
                  'controlled_requests_planned': 1080,
                  'production_requests_planned': 210}), flush=True)
