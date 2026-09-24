#!/usr/bin/env bash
# Linux only: isolated veth/network namespace, with tc on server egress.
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 {delay|loss|bandwidth|server} OUTPUT_DIR [REQUESTS]" >&2
  exit 2
fi
fault=$1
out=$2
requests=${3:-200}
case "$fault" in delay|loss|bandwidth|server) ;; *) echo "unknown fault: $fault" >&2; exit 2;; esac
if [[ $EUID -ne 0 ]]; then echo "run as root (ip netns and tc require NET_ADMIN)" >&2; exit 2; fi
for tool in ip tc python3; do command -v "$tool" >/dev/null || { echo "missing $tool" >&2; exit 2; }; done
mkdir "$out"
out=$(realpath "$out")
cd "$(dirname "$0")/.."
{ uname -a; ip -V; tc -V; python3 --version; } > "$out/environment.txt"
ns="rootnet-$$"
client_if="rn-c-$$"
server_if="rn-s-$$"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  ip netns del "$ns" 2>/dev/null || true
  ip link del "$client_if" 2>/dev/null || true
}
trap cleanup EXIT
ip netns add "$ns"
ip link add "$client_if" type veth peer name "$server_if"
ip link set "$server_if" netns "$ns"
ip addr add 198.19.7.1/30 dev "$client_if"
ip link set "$client_if" up
ip netns exec "$ns" ip addr add 198.19.7.2/30 dev "$server_if"
ip netns exec "$ns" ip link set lo up
ip netns exec "$ns" ip link set "$server_if" up
ip netns exec "$ns" python3 -m reflex.network serve --host 198.19.7.2 \
  --port 8765 --response-bytes 65536 --log "$out/server.jsonl" &
server_pid=$!
for _ in {1..50}; do
  if ip netns exec "$ns" python3 -c 'import socket; s=socket.create_connection(("198.19.7.2",8765),.1); s.close()' 2>/dev/null; then break; fi
  sleep .1
done
run_phase() {
  local phase=$1
  ip netns exec "$ns" tc -j -s qdisc show dev "$server_if" > "$out/$phase-qdisc-before.json"
  python3 -m reflex.network run --host 198.19.7.2 --port 8765 \
    --out "$out" --phase "$phase" --requests "$requests" \
    --server-slow-every "${slow_every:-0}" --server-slow-ms "${slow_ms:-0}"
  ip netns exec "$ns" tc -j -s qdisc show dev "$server_if" > "$out/$phase-qdisc-after.json"
}
run_phase healthy
case "$fault" in
  delay) ip netns exec "$ns" tc qdisc add dev "$server_if" root netem delay 2ms 10ms 25% ;;
  loss) ip netns exec "$ns" tc qdisc add dev "$server_if" root netem loss 2% ;;
  bandwidth) ip netns exec "$ns" tc qdisc add dev "$server_if" root tbf rate 1mbit burst 32kbit latency 1000ms ;;
  server) slow_every=20; slow_ms=50 ;;
esac
printf '%s\n' "$fault" > "$out/fault.txt"
run_phase incident
if [[ "$fault" != server ]]; then ip netns exec "$ns" tc qdisc del dev "$server_if" root; fi
slow_every=0
slow_ms=0
run_phase recovery
python3 -m reflex.network compare "$out/healthy.json" "$out/incident.json" > "$out/comparison.json"
python3 -m reflex.network compare "$out/healthy.json" "$out/recovery.json" > "$out/recovery-comparison.json"
echo "Evidence: $out"
