import hashlib
import json
from collections import Counter
from pathlib import Path

base = Path(__file__).parent
names = ('validation', 'validation-gpu', 'validation-gpu2', 'main', 'final-focus', 'more')
totals = Counter()
clear = mixed = controls = incidents = restores = assignments_count = 0
for name in names:
    root = base / name
    summary = json.loads((base / f'{name}-summary.json').read_text())
    totals.update({key: summary[key] for key in ('requests', 'ok', 'blocks', 'joined_ok', 'cuda_covered_ok')})
    assignments = json.loads((root / 'private/assignments.json').read_text())
    restores += sum(row.get('restored') is True for row in assignments)
    assignments_count += len(assignments)
    healthy = {}
    for row in assignments:
        if row['arm'] == 'production':
            continue
        counts = json.loads((root / 'public' / f"{row['phase']}-manifest.json").read_text())['population']['counts']
        n = counts['eligible']
        bounds = [counts.get('missed', 0) / n,
                  (counts.get('missed', 0) + counts.get('unknown_deadline', 0)) / n]
        if row['arm'] == 'healthy':
            healthy[row['case']] = bounds
        if row['arm'] == 'incident':
            incidents += 1
            mixed += row['case'] in ('network_gpu', 'queue_gpu')
            clear += bounds[0] - healthy[row['case']][1] > .05
        else:
            controls += 1
archives = ('validation.tar.gz', 'validation-gpu.tar.gz', 'validation-gpu2.tar.gz',
            'network-smolvla-main.tar.gz', 'network-smolvla-final-focus.tar.gz',
            'network-smolvla-more.tar.gz', 'smolvla-corpus.tar.gz')
analysis = (base / 'main-summary.json', base / 'final-focus-summary.json',
            base / 'main/private/root-evaluation.json', base / 'final-focus/private/root-evaluation.json',
            base / 'more-summary.json', base / 'more/private/root-evaluation.json',
            base / 'more-environment.json')
report = dict(totals, controls=controls, incident_blocks=incidents,
              mixed_incident_blocks=mixed, observed_deadline_regression_blocks=clear,
              restoration_records=restores, assignment_records=assignments_count,
              root_verified=0, root_inferred=6,
              sha256={str(path.relative_to(base)): hashlib.sha256(path.read_bytes()).hexdigest()
                      for path in [*(base / name for name in archives), *analysis]})
output = base / 'network-smolvla-report.json'
output.write_text(json.dumps(report, indent=2))
print(json.dumps({k: v for k, v in report.items() if k != 'sha256'}))
