import subprocess
import sys
from pathlib import Path

base = Path('/content/reflex-network')
base.mkdir(exist_ok=True)
repo = base / 'reflex'
if not repo.exists():
    subprocess.run(['git', 'clone', '--depth', '1', 'https://github.com/MugiZer/reflex.git', str(repo)], check=True)
log = (base / 'setup.log').open('w')
commands = [
    [sys.executable, '-m', 'pip', 'install', '-q', '--index-url', 'https://download.pytorch.org/whl/cu128', 'torch==2.9.1', 'torchvision==0.24.1'],
    [sys.executable, '-m', 'pip', 'install', '-q', 'lerobot[smolvla,dataset,evaluation]==0.6.0', 'pytest', '-r', str(repo / 'requirements-network.txt')],
]
script = base / 'install.py'
script.write_text('import subprocess\ncommands = ' + repr(commands) + '\nfor command in commands:\n    subprocess.run(command, check=True)\nprint("SETUP_COMPLETE", flush=True)\n')
process = subprocess.Popen([sys.executable, str(script)], stdout=log, stderr=log, start_new_session=True)
print({'setup_pid': process.pid}, flush=True)
