#!/usr/bin/env bash
# Repeats every command of the page "Recipe: bring notes in from Obsidian, Notion or Basic Memory".
# The commands below are the page's command blocks, in order.
# Usage: notes-apps.run.sh <folder that holds node_modules>
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export PS4='$ '
WORK="$(mktemp -d)"
cd "$WORK"
set -x

mkdir -p basic-memory/notes vault/Daily notion
printf -- '---\ntitle: Espresso\ntype: note\ntags: [coffee]\npermalink: espresso\n---\n# Espresso\n\n## Observations\n- [method] Pull a shot in 25 to 30 seconds #coffee\n\n## Relations\n- uses [[Grind size]]\n- broader [[Coffee]]\n' > basic-memory/notes/espresso.md
printf -- '---\ntitle: Grind size\ntype: note\npermalink: grind-size\n---\n# Grind size\n\nFiner grind slows the shot.\n' > basic-memory/notes/grind-size.md
printf -- '---\ntitle: Coffee\ntype: note\npermalink: coffee\n---\n# Coffee\n\nA drink made from roasted beans.\n' > basic-memory/notes/coffee.md
printf -- '# Sourdough\n\nA loaf needs a lively starter. See [[Hydration]] and [[Daily/2026-11-17]].\n' > vault/Sourdough.md
printf -- '# Hydration\n\nWater weight divided by flour weight. Back to [[Sourdough|the sourdough note]].\n' > vault/Hydration.md
printf -- 'Fed the starter at 8.\n' > vault/Daily/2026-11-17.md
printf -- '# Meeting notes\n\nAgreed to move the rota to Mondays. See [Rota](%s).\n' 'Rota%20fedcba9876543210fedcba9876543210.md' > "notion/Meeting notes 0123456789abcdef0123456789abcdef.md"
printf -- '# Rota\n\nThe on-call rota changes every Monday.\n' > "notion/Rota fedcba9876543210fedcba9876543210.md"
printf -- 'Name,Tags,Body\nDesigning Data-Intensive Applications,"books, data",Read the section on logs.\nThe Pragmatic Programmer,books,Reread yearly.\n' > "notion/Reading list 00112233445566778899aabbccddeeff.csv"
mkdir my-node && cd my-node && git init -q -b main
git config user.name Demo && git config user.email demo@example.org
agsc init
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" . && git add -A && git commit -qm 'empty node'

agsc import ../basic-memory --from basic-memory --dry-run
agsc import ../basic-memory --from basic-memory
sed -n 1,16p content/concepts/espresso.md

agsc import ../vault --from okf --dry-run
agsc import ../vault --from okf
grep -n '\[\[' content/concepts/sourdough.md content/concepts/hydration.md

sed -i -E 's/\[\[([^]|]*\/)?([^]|]+)\|([^]]+)\]\]/[\3](\L\2.md)/g; s/\[\[([^]|]*\/)?([^]|]+)\]\]/[\2](\L\2.md)/g' content/concepts/sourdough.md content/concepts/hydration.md
grep -n 'md)' content/concepts/sourdough.md content/concepts/hydration.md

mkdir ../notion-clean
for f in ../notion/*.md; do n=$(basename "$f" | sed -E 's/ [0-9a-f]{32}\.md$/.md/'); cp "$f" "../notion-clean/$n"; done
sed -i -E 's/\]\(([A-Za-z0-9]+)%20[0-9a-f]{32}\.md\)/](\L\1.md)/g' ../notion-clean/*.md
agsc import ../notion-clean --from okf
agsc import ../notion --from csv --dry-run
agsc import ../notion --from csv

agsc lint | grep '^lint:'
