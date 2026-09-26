import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from reflex.network import stats

root = Path(sys.argv[1])
for name, expected in json.loads((root / 'checksums.json').read_text()).items():
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f'checksum mismatch: {name}')
assignments = json.loads((root / 'private/assignments.json').read_text())
by_phase = defaultdict(list)
for assignment in assignments:
    by_phase[assignment['phase']].append(assignment)
rows = []
for path in (root / 'public').glob('block-*.jsonl'):
    if '-events' not in path.name:
        rows.extend(json.loads(line) for line in path.read_text().splitlines())
server = {row['request_id']: row for row in map(json.loads,
          (root / 'public/server.jsonl').read_text().splitlines())}
joined = sum(row['request_id'] in server and row.get('action_sha256') ==
             server[row['request_id']].get('action_sha256') for row in rows if row['status'] == 'ok')
phases = {phase: [row for row in rows if row['phase'] == phase] for phase in by_phase}
populations = {phase: json.loads((root / 'public' / f'{phase}-manifest.json').read_text())['population']['counts']
               for phase in by_phase}
cases = defaultdict(lambda: defaultdict(list))
case_phases = defaultdict(lambda: defaultdict(list))
for phase, assignments_for_phase in by_phase.items():
    first = assignments_for_phase[0]
    if first['arm'] != 'production':
        cases[first['case']][first['arm']].extend(phases[phase])
        case_phases[first['case']][first['arm']].append(phase)
headline = {}
for case, arms in cases.items():
    headline[case] = {}
    for arm, members in arms.items():
        ok = [r for r in members if r['status'] == 'ok']
        headline[case][arm] = {
            'requests': len(members), 'ok': len(ok),
            'deadline_misses': sum(populations[p].get('missed', 0) for p in case_phases[case][arm]),
            'deadline_unknown': sum(populations[p].get('unknown_deadline', 0) for p in case_phases[case][arm]),
            'rtt_ms': stats([r['client_rtt_ns'] / 1e6 for r in ok]),
            'server_ms': stats([r['server_work_ns'] / 1e6 for r in ok]),
            'cuda_ms': stats([r['cuda_device_ms'] for r in ok if r.get('cuda_device_ms') is not None]),
        }
effects = []
for case, arms in headline.items():
    if 'healthy' in arms and 'incident' in arms:
        h, i = arms['healthy']['rtt_ms']['p95_ms'], arms['incident']['rtt_ms']['p95_ms']
        if h and i is not None and i - h > max(20, 0.2 * h):
            effects.append(case)
result = {
    'requests': len(rows), 'ok': sum(r['status'] == 'ok' for r in rows),
    'blocks': len(by_phase), 'controlled_blocks': sum(a['arm'] != 'production' for a in assignments),
    'production_regimes': sum(a['arm'] == 'production' for a in assignments),
    'joined_ok': joined,
    'cuda_covered_ok': sum(r.get('cuda_device_ms') is not None for r in rows if r['status'] == 'ok'),
    'restored': sum(a.get('restored') is True for a in assignments),
    'assignments': len(assignments),
    'observed_tail_shifts': effects,
    'headlines': headline,
}
path = root.parent / f'{root.name}-summary.json'
path.write_text(json.dumps(result, indent=2))
print(json.dumps({k: v for k, v in result.items() if k != 'headlines'}))
print(path)
