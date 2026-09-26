import subprocess
import sys
from pathlib import Path

base = Path('/content/reflex-network')
repo = base / 'reflex'
code = '''
import json
import time
from pathlib import Path
base = Path('/content/reflex-network')
for _ in range(900):
    if 'SETUP_COMPLETE' in (base / 'setup.log').read_text(errors='replace'):
        break
    time.sleep(2)
else:
    raise RuntimeError('setup did not complete')
from smolvla_run import genesis_or_validate
corpus, sha = genesis_or_validate()
print({'corpus_sha256': sha}, flush=True)
import network_smolvla_farm as farm
farm.CASES = (
    ('reverse_delay', {'reverse_ms': 5000}, False, False),
    ('gpu_pressure', {}, True, False),
    ('network_gpu', {'reverse_ms': 1000}, True, False),
)
results = farm.farm(corpus, base / 'more', requests=4, repetitions=2,
                    production_requests=35, seed=193, deadline_s=4)
print({'blocks': len(results), 'requests': sum(r['counts']['eligible'] for r in results)}, flush=True)
import hashlib
import tarfile
for name, source in [('more.tar.gz', base / 'more'), ('corpus.tar.gz', corpus)]:
    with tarfile.open(base / name, 'w:gz') as tar:
        tar.add(source, arcname=source.name)
    print({name: hashlib.sha256((base / name).read_bytes()).hexdigest()}, flush=True)
print('MORE_COMPLETE', flush=True)
'''
script = repo / 'scripts/more_job.py'
script.write_text(code)
log = (base / 'more.log').open('w')
process = subprocess.Popen([sys.executable, str(script)], cwd=repo / 'scripts',
                           stdout=log, stderr=log, start_new_session=True)
print({'farm_pid': process.pid}, flush=True)
