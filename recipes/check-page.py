#!/usr/bin/env python3
"""Check a recipe page against its script and transcript.

  check-page.py <slug> [<slug> ...]

For each page: every line of a ```bash block must be in <slug>.run.sh, and every line of a
```text block must be a line of <slug>.transcript.txt (the output of one run of the script).
Exit 0 when all pages agree, 1 otherwise.
"""
import re, sys

def blocks(text, lang):
    return re.findall(r'^```' + lang + r'\n(.*?)^```', text, flags=re.S | re.M)

bad = 0
for slug in sys.argv[1:]:
    page = open(f'{slug}.md', encoding='utf-8').read()
    script = open(f'{slug}.run.sh', encoding='utf-8').read()
    transcript = set(l.rstrip() for l in open(f'{slug}.transcript.txt', encoding='utf-8', errors='replace'))
    miss = []
    # The script may fix the commit time and catch an exit code where the page shows the plain command.
    plain = re.sub(r'GIT_AUTHOR_DATE=\S+ GIT_COMMITTER_DATE=\S+ ', '', script)
    for b in blocks(page, 'bash'):
        for line in b.splitlines():
            if not line.strip() or line.strip() in plain:
                continue
            parts = [part.split(' || echo ')[0].strip() for part in line.strip().split(' && ')]
            if not all(part in plain for part in parts):
                miss.append(('command not in script', line))
    for b in blocks(page, 'text'):
        for line in b.splitlines():
            if line.strip() and line.rstrip() not in transcript:
                miss.append(('output not in transcript', line))
    n = len(page.splitlines())
    print(f'{slug}: {n} lines, {len(miss)} mismatch(es)')
    for kind, line in miss:
        print(f'   {kind}: {line[:150]}')
    bad += len(miss)
sys.exit(1 if bad else 0)
