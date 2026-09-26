import hashlib
import json
import tarfile
from pathlib import Path

base = Path('/content/reflex-network')
for name in ('validation-gpu', 'final-focus'):
    source = base / name
    if not source.exists():
        continue
    if name == 'main' and not (source / 'checksums.json').exists():
        continue
    archive = base / f'{name}.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(source, arcname=name)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size,
                      'sha256': digest}), flush=True)
