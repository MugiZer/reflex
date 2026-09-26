import subprocess
import sys
from pathlib import Path
base = Path('/content/reflex-network')
script = base / 'install-fix.py'
script.write_text('import subprocess, sys\nsubprocess.run([sys.executable, "-m", "pip", "install", "-q", "lerobot[smolvla,dataset,evaluation]==0.6.0", "pytest", "ddsketch==3.0.1"], check=True)\nprint("SETUP_COMPLETE", flush=True)\n')
log = (base / 'setup.log').open('w')
process = subprocess.Popen([sys.executable, str(script)], stdout=log, stderr=log, start_new_session=True)
print({'install_pid': process.pid})
