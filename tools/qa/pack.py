# Packs the Poki build for upload: index.html at the zip root, files 0644, folders 0755, fixed order and date.
# Usage: python3 pack.py <dist/poki> <out.zip>
import os
import sys
import zipfile

src, out = sys.argv[1], sys.argv[2]
entries = []
for root, dirs, files in os.walk(src):
    dirs.sort()
    rel = os.path.relpath(root, src)
    if rel != '.':
        entries.append((rel.replace(os.sep, '/') + '/', None))
    for f in sorted(files):
        entries.append(((f if rel == '.' else f'{rel}/{f}').replace(os.sep, '/'), os.path.join(root, f)))
entries.sort(key=lambda e: e[0])
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name, path in entries:
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 22, 12, 0, 0))
        if path is None:
            info.external_attr = (0o40755 << 16) | 0x10
            z.writestr(info, b'')
        else:
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(path, 'rb') as fh:
                z.writestr(info, fh.read(), compresslevel=9)
print(out, os.path.getsize(out), 'bytes,', sum(1 for e in entries if e[1]), 'files')
