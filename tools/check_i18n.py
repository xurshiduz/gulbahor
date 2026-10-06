"""Every literal t('a.b') in the web source must exist in both dictionaries; the two dictionaries must hold the same keys.

    python tools/check_i18n.py

"only uz" and "only ru" must both be empty. Thirteen keys are always listed as "missing": they are plural
forms and groups this simple reader does not follow (audit.actions, import.confirm, import.newVariants,
import.problems, import.rowsFound, products.variantCount, products.willRemove, promotions.receipts,
receipts.unpricedWarning, roles.count, stockdocs.lostHere, stockdocs.shortWarning,
stockdocs.transfer.receiveShort). Any other is a word a screen asks for and neither dictionary has.
"""
import io
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'src')

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8')


def keys_of(path):
    keys = set()
    stack = []
    for line in io.open(os.path.join(ROOT, path), encoding='utf-8').read().split('\n'):
        match = re.match(r"^(\s+)'?([\w.]+)'?:(.*)$", line)
        if match:
            depth = len(match.group(1)) // 2 - 1
            del stack[depth:]
            stack.append(match.group(2))
            if match.group(3).strip() != '{':
                keys.add('/'.join(stack))
        # `}` lines need no handling: depth is taken from the indentation.
    return keys


uz = keys_of('i18n/uz.ts')
ru = keys_of('i18n/ru.ts')
print('only uz:', sorted(uz - ru))
print('only ru:', sorted(ru - uz))

flat = {key.replace('/', '.') for key in uz}
groups = {key.rsplit('.', 1)[0] for key in flat}
used = set()
for folder, _, files in os.walk(ROOT):
    for name in files:
        if not name.endswith(('.ts', '.tsx')) or folder.endswith('i18n'):
            continue
        text = io.open(os.path.join(folder, name), encoding='utf-8').read()
        for match in re.finditer(r"\bt\(\s*'([\w.]+)'", text):
            used.add((match.group(1), os.path.relpath(os.path.join(folder, name), ROOT)))
        for match in re.finditer(r"(?:label|title|hint): '((?:nav|common|shortcuts)\.[\w.]+)'", text):
            used.add((match.group(1), os.path.relpath(os.path.join(folder, name), ROOT)))

missing = sorted((key, where) for key, where in used if key not in flat and key not in groups)
print('missing:', len(missing))
for key, where in missing:
    print('  ', key, where)
