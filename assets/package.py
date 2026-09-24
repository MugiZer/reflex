from pathlib import Path
import re
import struct
import zipfile
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent
sheet = root / 'contact-sheet.html'
sheet.write_text(re.sub(r'file:///[^"<>]+/(0[1-6]-[^/"<>]+\.svg)', r'\1', sheet.read_text(encoding='utf-8')), encoding='utf-8')
for source in sorted(root.glob('0*.mmd')):
    png = source.with_suffix('.png')
    width, height = struct.unpack('>II', png.read_bytes()[16:24])
    assert (width, height) == (3840, 2160), (png, width, height)
    svg = ET.parse(source.with_suffix('.svg')).getroot()
    assert svg.attrib['viewBox'] == '0 0 1920 1080'
    print(f'{source.stem}: SVG valid; PNG {width}x{height}')
archive = root.parent / 'Root-demo-diagrams.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for file in sorted(root.iterdir()):
        if file.is_file():
            bundle.write(file, 'Root-demo-diagrams/' + file.name)
print(f'Packaged {archive.name}: {archive.stat().st_size:,} bytes')
