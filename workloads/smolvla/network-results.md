# SmolVLA network farm results

Measured on a Tesla T4 using real SmolVLA actions over same-host HTTP/TCP and an application relay. These runs do not validate separate-host physical paths or kernel packet loss. The VM lacked `CAP_NET_ADMIN`.

## Preserved evidence

Six runs contain 1,663 requests across 237 blocks: 1,547 successful requests and 116 failed/censored requests. Every successful request joins to a server action hash and CUDA duration. There are 142 healthy/recovery control blocks, 71 incident blocks (13 mixed), and 24 production blocks. Earlier exploratory validations used separate regime blocks; three later runs used persistent workloads with seven transitions each.

Twenty-one incident blocks showed an observed increase in the deadline-rate lower bound over the control upper bound exceeding 0.05. This is an exploratory population effect, not a formally verified causal regression. All 255 manipulation/restoration records passed. Root reported six INFERRED endpoint-dispatch claims and zero VERIFIED claims; underlying mechanisms remain unresolved.

The additional repeat run used seed 193, two repetitions of three cases, four requests per healthy/incident/recovery block, two clients, a four-second deadline, and a 35-request persistent workload with four clients. It produced 107 requests across 19 blocks: 96 successful, 11 failed/censored. All 72 controlled requests succeeded; each incident arm missed 8/8 deadlines while each healthy and recovery arm missed 0/8.

| Repeat case | Healthy median RTT | Incident median RTT | Recovery median RTT |
|---|---:|---:|---:|
| Reverse relay delay | 1.032 s | 5.622 s | 1.090 s |
| GPU contention | 1.165 s | 10.972 s | 1.169 s |
| Reverse relay delay + GPU | 1.132 s | 9.257 s | 0.975 s |

Injected case assignments remain in private experiment artifacts. Public block manifests and Root ledgers were checked for injected-label leakage. Relay timing controls do not establish physical loss or route behavior.

## Reproduction and artifacts

Environment: Linux 6.6.122+, Python 3.13.15, Torch 2.9.1+cu128, LeRobot 0.6.0, NVIDIA driver 580.82.07, T4 15,360 MiB. Install LeRobot and `ddsketch==3.0.1`; the general network requirements' NumPy pin conflicts with LeRobot when installed together.

The checked-in `corpora/` manifests match the frozen inputs used on the T4. Main SHA256: `b1fb605b78171a8820e651d7b85040a115647f4147342cd65da8957d579f7dd3`.

Downloaded archives and analysis remain in the ignored `.loop-runs/` directory; they are not hosted by this repository. `network-smolvla-report.json` records counts and artifact hashes. The repeat archive `network-smolvla-more.tar.gz` has SHA256 `e64d8e3f87d7894834209a51088efad07919d3a133b08b12acffc21519b60bb0`. Its public manifests are ingestible with the existing Root network commands. Private assignments must remain outside Root inputs.

Validation: full feasible suite 237 passed/14 skipped; final focused suite 46 passed/11 skipped; bridge and corpus checks rerun after freezing inputs: 8 passed. Archive and per-file checksums, action correlation, CUDA coverage, restoration, and label isolation passed. The repeat T4 session was terminated after downloading evidence.

See the README's SmolVLA network bridge commands for service/client use and the native `tc` harness resume command. Physical network experiments require a capable Linux T4 environment and a separate client path.
