from pathlib import Path
base = Path('/content/reflex-network')
for name in ('setup.log', 'more.log'):
    path = base / name
    if path.exists():
        print(name, path.read_text(errors='replace')[-2500:], flush=True)
root = base / 'more'
print({'manifests': len(list(root.glob('public/*-manifest.json'))), 'checksums': (root / 'checksums.json').exists()}, flush=True)
