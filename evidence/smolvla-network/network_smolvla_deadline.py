import subprocess
import sys
from pathlib import Path

repo = Path('/content/reflex-network/reflex')
code = '''
import json
from pathlib import Path
import network_smolvla_farm as farm
farm.CASES = (
    ('forward_delay', {'forward_ms': 5000}, False, False),
    ('gpu_pressure', {}, True, False),
    ('network_gpu', {'forward_ms': 1000}, True, False),
)
output = Path('/content/reflex-network/final-focus')
results = farm.farm(Path('/content/reflex-network/reflex/workloads/smolvla/corpora'), output,
                    requests=4, repetitions=1, production_requests=35,
                    deadline_s=4)
print(json.dumps({'blocks': len(results),
                  'requests': sum(r['counts']['eligible'] for r in results),
                  'missed': sum(r['counts'].get('missed', 0) for r in results),
                  'output': str(output)}), flush=True)
'''
completed = subprocess.run([sys.executable, '-c', code], cwd=repo / 'scripts',
                           capture_output=True, text=True, timeout=2400)
print(completed.stdout[-3000:], flush=True)
print(completed.stderr[-3000:], file=sys.stderr, flush=True)
print(f'EXIT={completed.returncode}', flush=True)
