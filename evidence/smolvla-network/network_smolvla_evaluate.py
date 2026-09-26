import json
import sys
from collections import defaultdict, Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from reflex.ledger import Incident, Ledger
from reflex.network import investigate
from reflex.network_capture import ingest_workload
from reflex.network_analysis import compare_population_summaries

root = Path(sys.argv[1])
assignments = json.loads((root / 'private/assignments.json').read_text())
groups = defaultdict(list)
for assignment in assignments:
    if assignment['arm'] != 'production':
        groups[assignment['case']].append(assignment)
results = []
for number, (case, blocks) in enumerate(sorted(groups.items()), 1):
    incident = f'farm-case-{number:03d}'
    ledger_path = root / 'private' / f'{incident}-ledger-v3.jsonl'
    ledger = Ledger(ledger_path)
    ledger.open_incident(Incident(incident_id=incident, domain='network', provenance='farm'))
    for block in blocks:
        arm = 'current' if block['arm'] == 'incident' else 'reference'
        ingest_workload(ledger, root / 'public' / f"{block['phase']}-manifest.json",
                        incident, arm=arm)
    contract = dict(target='all scheduled SmolVLA deliveries', outcome='deadline exceedance',
                    exposure='opaque operating regime', comparable=['deadline_s', 'payload_bytes', 'concurrency'],
                    mediators=['client RTT', 'server service', 'CUDA device'], reference_ids=[],
                    selection='exploratory', frozen_at=0,
                    dependence={'model': 'unknown', 'basis': None},
                    estimand='eligible delivery deadline rate', threshold=.05, alpha=.05,
                    weights={'reference': [], 'current': []}, regime='T4 local relay',
                    units='probability')
    analysis = investigate(ledger_path, incident, contract=contract)
    reference = []
    current = []
    for block in blocks:
        manifest = json.loads((root / 'public' / f"{block['phase']}-manifest.json").read_text())
        target = current if block['arm'] == 'incident' else reference
        target.append({'summary': manifest['population'], 'context': manifest['context']})
    population = compare_population_summaries(reference, current, contract)
    result = {'incident': incident, 'private_case': case,
              'blocks': len(blocks), 'claims': Counter(c['level'] for c in analysis['claims']),
              'closure': analysis.get('closure'), 'population': population}
    results.append(result)
(root / 'private/root-evaluation.json').write_text(json.dumps(results, indent=2, default=dict))
print(json.dumps({'cases': len(results),
                  'levels': dict(sum((Counter(row['claims']) for row in results), Counter())),
                  'closures': [row['closure'] for row in results[:3]]}, default=dict))
