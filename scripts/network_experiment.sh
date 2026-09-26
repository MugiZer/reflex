#!/usr/bin/env bash
# Linux only: isolated endpoints, independently impaired directions and an alternate routed path.
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 {delay|loss|bandwidth|server|reverse|route|queue-loss|cpu|queue|novel} OUTPUT_DIR [REQUESTS]" >&2
  exit 2
fi
fault=$1
out=$2
requests=${3:-200}
smolvla_corpus=${SMOLVLA_CORPUS:-}
case "$fault" in delay|loss|bandwidth|server|reverse|route|queue-loss|cpu|queue|novel) ;; *) echo "unknown fault: $fault" >&2; exit 2;; esac
if [[ -n "$smolvla_corpus" && "$fault" == server ]]; then echo "server sleep is a fixed-response control only" >&2; exit 2; fi
if [[ -n "$smolvla_corpus" ]]; then : "${REFLEX_SERVICE_TOKEN:?set a private service token}"; fi
if [[ $EUID -ne 0 ]]; then echo "run as root (ip netns and tc require NET_ADMIN)" >&2; exit 2; fi
for tool in ip tc python3; do command -v "$tool" >/dev/null || { echo "missing $tool" >&2; exit 2; }; done
mkdir "$out"
out=$(realpath "$out")
mkdir "$out/private"
exec 9>"$out/private/commands.log"
export BASH_XTRACEFD=9
set -x
cd "$(dirname "$0")/.."
{ uname -a; ip -V; tc -V; python3 --version; } > "$out/environment.txt"
ns="rootnet-$$"
client_if="rn-c-$$"
server_if="rn-s-$$"
server_pid=""
traffic_pid=""
cpu_pid=""
relay_pid=""
client_port=8765
capture_pids=()
ns_owned=0
link_owned=0
router_owned=0
alt_owned=0
router="rootroute-$$"
alt_client="rn-a-$$"
alt_router="rn-b-$$"
router_server="rn-d-$$"
server_router="rn-e-$$"
cleanup() {
  for capture_pid in "${capture_pids[@]}"; do kill "$capture_pid" 2>/dev/null || true; wait "$capture_pid" 2>/dev/null || true; done
  if [[ -n "$relay_pid" ]]; then kill "$relay_pid" 2>/dev/null || true; wait "$relay_pid" 2>/dev/null || true; fi
  if [[ -n "$traffic_pid" ]]; then kill "$traffic_pid" 2>/dev/null || true; wait "$traffic_pid" 2>/dev/null || true; fi
  if [[ -n "$cpu_pid" ]]; then kill "$cpu_pid" 2>/dev/null || true; wait "$cpu_pid" 2>/dev/null || true; fi
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  if (( ns_owned )); then ip netns del "$ns" 2>/dev/null || true; fi
  if (( router_owned )); then ip netns del "$router" 2>/dev/null || true; fi
  if (( link_owned )); then ip link del "$client_if" 2>/dev/null || true; fi
  if (( alt_owned )); then ip link del "$alt_client" 2>/dev/null || true; fi
}
trap cleanup EXIT
ip netns add "$ns"
ns_owned=1
ip link add "$client_if" type veth peer name "$server_if"
link_owned=1
ip link set "$server_if" netns "$ns"
ip addr add 198.19.7.1/30 dev "$client_if"
ip link set "$client_if" up
ip netns exec "$ns" ip addr add 198.19.7.2/30 dev "$server_if"
ip netns exec "$ns" ip link set lo up
ip netns exec "$ns" ip link set "$server_if" up
ip netns exec "$ns" ip addr add 198.19.10.2/32 dev lo
ip route add 198.19.10.2/32 via 198.19.7.2 dev "$client_if"
ip netns add "$router"
router_owned=1
ip link add "$alt_client" type veth peer name "$alt_router"
alt_owned=1
ip link set "$alt_router" netns "$router"
ip addr add 198.19.8.1/30 dev "$alt_client"
ip link set "$alt_client" up
ip netns exec "$router" ip addr add 198.19.8.2/30 dev "$alt_router"
ip netns exec "$router" ip link set "$alt_router" up
ip netns exec "$router" ip link set lo up
ip netns exec "$router" ip link add "$router_server" type veth peer name "$server_router"
ip netns exec "$router" ip link set "$server_router" netns "$ns"
ip netns exec "$router" ip addr add 198.19.9.1/30 dev "$router_server"
ip netns exec "$router" ip link set "$router_server" up
ip netns exec "$ns" ip addr add 198.19.9.2/30 dev "$server_router"
ip netns exec "$ns" ip link set "$server_router" up
ip netns exec "$ns" ip route add 198.19.8.0/30 via 198.19.9.1
ip netns exec "$router" ip route add 198.19.10.2/32 via 198.19.9.2
ip netns exec "$router" sysctl -q -w net.ipv4.ip_forward=1
if [[ -n "$smolvla_corpus" ]]; then
  ip netns exec "$ns" python3 scripts/network_smolvla_run.py serve --host 0.0.0.0 \
    --port 8765 --corpus "$smolvla_corpus" --log "$out/server.jsonl" &
else
  ip netns exec "$ns" python3 -m reflex.network serve --host 0.0.0.0 \
    --port 8765 --response-bytes 65536 --log "$out/server.jsonl" &
fi
server_pid=$!
ready=0
ready_attempts=50
if [[ -n "$smolvla_corpus" ]]; then ready_attempts=1800; fi
for ((attempt=0; attempt<ready_attempts; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then echo "endpoint exited before readiness" >&2; exit 1; fi
  if python3 -c 'import socket; s=socket.create_connection(("198.19.10.2",8765),.1); s.close()' 2>/dev/null; then ready=1; break; fi
  sleep .1
done
if (( ! ready )); then echo "endpoint readiness failed" >&2; exit 1; fi
run_phase() {
  local phase=$1
  ip netns exec "$ns" tc -j -s qdisc show dev "$server_if" > "$out/private/$phase-server-qdisc-before.json"
  tc -j -s qdisc show dev "$client_if" > "$out/private/$phase-client-qdisc-before.json"
  ip -j route get 198.19.10.2 > "$out/$phase-route.json"
  if [[ -n "$smolvla_corpus" ]]; then
    python3 scripts/network_smolvla_run.py run --host 198.19.10.2 --port "$client_port" \
      --corpus "$smolvla_corpus" --out "$out" --phase "$phase" \
      --requests "$requests" --concurrency "${CONNECTIONS:-2}" --deadline-s "${DEADLINE_S:-4}" \
      --response-padding-bytes "${RESPONSE_PADDING_BYTES:-16384}"
  else
    python3 -m reflex.network run --host 198.19.10.2 --port "$client_port" \
      --out "$out" --phase "$phase" --requests "$requests" \
      --concurrency "${CONNECTIONS:-2}" --persistent \
      --server-slow-every "${slow_every:-0}" --server-slow-ms "${slow_ms:-0}"
  fi
  ip netns exec "$ns" tc -j -s qdisc show dev "$server_if" > "$out/private/$phase-server-qdisc-after.json"
  tc -j -s qdisc show dev "$client_if" > "$out/private/$phase-client-qdisc-after.json"
}
run_phase healthy
case "$fault" in
  delay) ip netns exec "$ns" tc qdisc add dev "$server_if" root netem delay 2ms 10ms 25% ;;
  loss) ip netns exec "$ns" tc qdisc add dev "$server_if" root netem loss 2% 50% ;;
  bandwidth) ip netns exec "$ns" tc qdisc add dev "$server_if" root tbf rate 1mbit burst 32kbit latency 1000ms ;;
  server) slow_every=20; slow_ms=50 ;;
  reverse) tc qdisc add dev "$client_if" root netem delay 20ms 5ms loss 1% 25% ;;
  route) ip route replace 198.19.10.2/32 via 198.19.8.2 dev "$alt_client" ;;
  queue-loss) ip netns exec "$ns" tc qdisc add dev "$server_if" root netem rate 1mbit limit 1000 loss 2% 50% ;;
  queue) ip netns exec "$ns" tc qdisc add dev "$server_if" root tbf rate 1mbit burst 32kbit latency 1000ms ;;
  cpu) cpu=$(python3 -c 'import os; print(min(os.sched_getaffinity(0)))'); taskset -pc "$cpu" "$server_pid"; taskset -c "$cpu" python3 -c 'while True: sum(range(100000))' & cpu_pid=$! ;;
  novel)
    ip netns exec "$ns" python3 -m reflex.network relay --host 0.0.0.0 --port 8766 \
      --upstream-host 127.0.0.1 --upstream-port 8765 --log "$out/relay.jsonl" --credits 2 --period-s .08 &
    relay_pid=$!
    client_port=8766
    ready=0
    for _ in {1..50}; do
      if python3 -c 'import socket; s=socket.create_connection(("198.19.10.2",8766),.1); s.close()' 2>/dev/null; then ready=1; break; fi
      sleep .1
    done
    if (( ! ready )); then echo "relay readiness failed" >&2; exit 1; fi
    ;;
esac
if [[ "$fault" == queue || "$fault" == queue-loss ]]; then
  python3 -m reflex.network run --host 198.19.10.2 --out "$out/private" --phase cross-traffic \
    --requests "$((requests * 20))" --concurrency 8 --persistent --timeout-s 2 &
  traffic_pid=$!
fi
printf '%s\n' "$fault" > "$out/private/fault.txt"
if [[ -n "${CLIENT_DELAY_MS:-}" ]]; then tc qdisc replace dev "$client_if" root netem delay "${CLIENT_DELAY_MS}ms"; fi
if [[ -n "${SERVER_DELAY_MS:-}" ]]; then ip netns exec "$ns" tc qdisc replace dev "$server_if" root netem delay "${SERVER_DELAY_MS}ms"; fi
for profile in packets scheduler probe; do
  config=$(python3 -c 'import json,sys; print(json.dumps(dict(seconds=8,max_bytes=8388608,pid=int(sys.argv[1]),interface=sys.argv[2],filter="tcp port 8765 or tcp port 8766",readability=True)))' "$server_pid" "$server_if")
  ip netns exec "$ns" python3 -m reflex.network capture --profile "$profile" --config "$config" \
    --out "$out/capture-$profile" > "$out/$profile-availability.json" &
  capture_pids+=("$!")
done
run_phase incident
for capture_pid in "${capture_pids[@]}"; do wait "$capture_pid"; done
capture_pids=()
if [[ -n "$relay_pid" ]]; then kill "$relay_pid" 2>/dev/null || true; wait "$relay_pid" 2>/dev/null || true; relay_pid=""; client_port=8765; fi
if [[ -n "$traffic_pid" ]]; then kill "$traffic_pid" 2>/dev/null || true; wait "$traffic_pid" 2>/dev/null || true; traffic_pid=""; fi
if [[ -n "$cpu_pid" ]]; then kill "$cpu_pid" 2>/dev/null || true; wait "$cpu_pid" 2>/dev/null || true; cpu_pid=""; fi
if [[ "$fault" =~ ^(delay|loss|bandwidth|queue|queue-loss)$ || -n "${SERVER_DELAY_MS:-}" ]]; then ip netns exec "$ns" tc qdisc del dev "$server_if" root; fi
if [[ "$fault" == reverse || -n "${CLIENT_DELAY_MS:-}" ]]; then tc qdisc del dev "$client_if" root; fi
if [[ "$fault" == route ]]; then ip route replace 198.19.10.2/32 via 198.19.7.2 dev "$client_if"; fi
slow_every=0
slow_ms=0
run_phase recovery
if [[ -z "$smolvla_corpus" ]]; then
  python3 -m reflex.network compare "$out/healthy.json" "$out/incident.json" > "$out/comparison.json"
  python3 -m reflex.network compare "$out/healthy.json" "$out/recovery.json" > "$out/recovery-comparison.json"
fi
python3 -m reflex.network ingest --ledger "$out/investigation.jsonl" --incident network-incident \
  --input "$out/healthy-manifest.json" --arm reference
python3 -m reflex.network ingest --ledger "$out/investigation.jsonl" --incident network-incident \
  --input "$out/incident-manifest.json" --arm current
for profile in packets scheduler probe; do
  if [[ -f "$out/capture-$profile/DONE" ]]; then
    python3 -m reflex.network ingest --ledger "$out/investigation.jsonl" --incident network-incident \
      --input "$out/capture-$profile"
  fi
done
python3 -m reflex.network investigate --ledger "$out/investigation.jsonl" --incident network-incident \
  --contract tests/fixtures/network/contract.json > "$out/diagnosis.json"
if [[ -n "$smolvla_corpus" ]]; then echo "Evidence: $out"; exit 0; fi
kind=rate
case "$fault" in route) kind=route;; cpu) kind=scheduling;; queue|queue-loss) kind=competing_load;; novel) kind=pacing;; esac
cpu=$(python3 -c 'import os; print(min(os.sched_getaffinity(0)))')
config=$(python3 -c 'import json,sys; print(json.dumps(dict(namespace=sys.argv[1],interface=sys.argv[2],directory=sys.argv[3],host="198.19.10.2",port=8765,requests=8,cpu=int(sys.argv[4]))))' "$ns" "$server_if" "$out/private/contrast" "$cpu")
python3 -m reflex.network isolated-contrast --ledger "$out/investigation.jsonl" --incident network-incident \
  --config "$config" --kind "$kind" > "$out/contrast.json"
python3 -m reflex.network report --ledger "$out/investigation.jsonl" --incident network-incident > "$out/report.md"
python3 - "$out" <<'PY'
import json
import sys
from pathlib import Path
from reflex.ledger import Ledger
from reflex.report import resolve_report
out=Path(sys.argv[1])
diagnosis=json.loads((out/"diagnosis.json").read_text())
assert diagnosis["domain"]=="network" and diagnosis["closure"]["open_world"]
assert all(c["level"] in ("OBSERVED","INFERRED") for c in diagnosis["claims"])
assert not any(c["scope"]["mechanism"] in ("physical loss","wireless contention") for c in diagnosis["claims"])
assert resolve_report((out/"report.md").read_text(),Ledger(out/"investigation.jsonl"))["ok"]
contrast=json.loads((out/"contrast.json").read_text())
assert contrast["execution"]=="executed", contrast
assert contrast["restoration"]["status"]=="restored", contrast
PY
echo "Evidence: $out"
