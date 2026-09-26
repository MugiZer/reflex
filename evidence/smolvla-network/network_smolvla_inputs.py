import hashlib
import json
import platform
import subprocess
import tarfile
from pathlib import Path

import torch
import lerobot

base = Path('/content/reflex-network')
corpus = base / 'reflex/workloads/smolvla/corpora'
archive = base / 'corpus.tar.gz'
with tarfile.open(archive, 'w:gz') as tar:
    tar.add(corpus, arcname='corpus')
environment = {'platform': platform.platform(), 'python': platform.python_version(),
               'torch': torch.__version__, 'lerobot': lerobot.__version__,
               'gpu': subprocess.run(['nvidia-smi', '--query-gpu=name,driver_version,memory.total',
                                      '--format=csv,noheader'], capture_output=True, text=True).stdout.strip(),
               'capabilities': Path('/proc/self/status').read_text().split('CapEff:')[1].splitlines()[0].strip(),
               'corpus_sha256': hashlib.sha256((corpus / 'main-1000.jsonl').read_bytes()).hexdigest()}
(base / 'environment.json').write_text(json.dumps(environment, indent=2))
print(json.dumps(environment), flush=True)
print({'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}, flush=True)
