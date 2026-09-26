import json
import sys
from pathlib import Path

repo = Path('/content/reflex-network/reflex')
sys.path.insert(0, str(repo / 'scripts'))
import network_smolvla_farm as farm

farm.CASES = tuple(case for case in farm.CASES
                   if case[0] in ('forward_delay', 'gpu_pressure', 'network_gpu'))
results = farm.farm(repo / 'workloads/smolvla/corpora',
                    Path('/content/reflex-network/validation-gpu2'),
                    requests=6, repetitions=1, production_requests=7)
by_phase = {result['phase']: result for result in results}
for assignment in json.loads(Path('/content/reflex-network/validation-gpu2/private/assignments.json').read_text()):
    if assignment['arm'] == 'incident':
        result = by_phase[assignment['phase']]
        print(json.dumps({'case': assignment['case'], 'phase': assignment['phase'],
                          'rtt_ms': result['client_rtt']['p50_ms'],
                          'cuda_ms': result['cuda_device']['p50_ms'],
                          'ok': result['counts'].get('ok', 0)}), flush=True)
