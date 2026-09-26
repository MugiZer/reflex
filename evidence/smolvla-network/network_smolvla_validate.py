from pathlib import Path
import subprocess
import sys

repo = Path('/content/reflex-network/reflex')
out = Path('/content/reflex-network/validation')
completed = subprocess.run([
    sys.executable, 'scripts/network_smolvla_farm.py',
    '--corpus', str(repo / 'workloads/smolvla/corpora'),
    '--output', str(out), '--requests', '2', '--repetitions', '1',
    '--production-requests', '7'], cwd=repo, capture_output=True, text=True,
    timeout=3000)
print(completed.stdout[-5000:], flush=True)
print(completed.stderr[-5000:], file=sys.stderr, flush=True)
print(f'EXIT={completed.returncode}', flush=True)
if completed.returncode:
    raise SystemExit(completed.returncode)
