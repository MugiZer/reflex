from pathlib import Path

effective = int(Path('/proc/self/status').read_text().split('CapEff:')[1].splitlines()[0], 16)
print({'CAP_NET_ADMIN': bool(effective & (1 << 12)), 'CAP_NET_RAW': bool(effective & (1 << 13))})
