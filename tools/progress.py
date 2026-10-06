"""Keeps docs/ISH-HOLATI.md in step.

    python tools/progress.py start "<what is in hand>"          names the piece being worked on
    python tools/progress.py done "<piece>" <tree> "<what>"     ticks a piece off and notes the tree snapshot
    python tools/progress.py counts "<the last full test run>"  records the last full run

`<piece>` is the beginning of the piece's line after "[ ] ", as it stands in the list ("V3. Hamkor").
`<tree>` is a snapshot of the working tree, taken without committing:

    git add -A && TREE=$(git write-tree) && git reset -q && echo $TREE
"""
import io
import os
import re
import sys

PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs', 'ISH-HOLATI.md')
text = io.open(PATH, encoding='utf-8').read()
command = sys.argv[1]

if command == 'done':
    piece, tree, what = sys.argv[2], sys.argv[3], sys.argv[4]
    pattern = re.compile(r'\[ \] ' + re.escape(piece))
    if not pattern.search(text):
        raise SystemExit('piece not found: ' + piece)
    text = pattern.sub('[x] ' + piece, text, count=1)
    text = re.sub(r"(## Hozir ishlanayotgan bo'lak\n\n).*?\n(\n## )", r'\1—\n\2', text, flags=re.S)
    text = text.rstrip('\n') + '\n| `%s` | %s |\n' % (tree, what)
elif command == 'start':
    text = re.sub(
        r"(## Hozir ishlanayotgan bo'lak\n\n).*?\n(\n## )",
        lambda m: m.group(1) + sys.argv[2] + '\n' + m.group(2),
        text,
        flags=re.S,
    )
elif command == 'counts':
    text = re.sub(r"Oxirgi to'liq tekshiruv: .*", "Oxirgi to'liq tekshiruv: " + sys.argv[2], text)
else:
    raise SystemExit('unknown command')

io.open(PATH, 'w', encoding='utf-8', newline='\n').write(text)
print('ok')
