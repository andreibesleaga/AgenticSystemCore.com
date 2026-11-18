#!/usr/bin/env bash
# Repeats every command of the page "Recipe: move an existing wiki or docs folder in".
# Usage: move-a-site-in.run.sh <folder that holds node_modules>
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export PS4='$ '
WORK="$(mktemp -d)"
cd "$WORK"
set -x

mkdir -p wiki/guides wiki/reference
printf '# Acme Wiki\n\nStart with the [install guide](%s).\n' guides/install.md > wiki/index.md
printf '# Install the tool\n\nSet it up as in the [config reference](%s).\nSee [troubleshooting](%s).\n' ../reference/config.md troubleshooting.md > wiki/guides/install.md
printf '# Troubleshooting\n\nCheck your [configuration](%s), then the [install guide](%s).\n' ../reference/config.md install.md > wiki/guides/troubleshooting.md
printf -- '---\ntitle: Configuration reference\ntags: [config, reference]\n---\n\n# Configuration reference\n\nEvery setting lives in `acme.toml`.\n' > wiki/reference/config.md
mkdir my-node && cd my-node && git init -q -b main
git config user.name Demo && git config user.email demo@example.org
agsc init
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" . && git add -A && git commit -qm 'empty node'

printf 'slug\tdecision\tclass\n' > ../empty-selection.tsv
rc=0; agsc import ../wiki --from old-site --selection ../empty-selection.tsv || rc=$?
test "$rc" -eq 1

agsc import ../wiki --from okf --dry-run
agsc import ../wiki --from okf
find content -type f | sort
head -8 content/concepts/install.md

rc=0; agsc lint 2>&1 | grep -E '^(error|lint:)' || rc=${PIPESTATUS[0]}
test "$rc" -eq 1

sed -i -E 's#\]\(\.\./[a-z]+/([a-z0-9-]+\.md)\)#](\1)#g' content/concepts/*.md
agsc lint | grep '^lint:'

sed -i 's/^status: draft$/status: stable/' content/concepts/*.md
git add -A && git commit -qm 'move the wiki in'
agsc build | grep -v '^skipped\|^warn'
grep -o 'href="[^"]*"' www/concepts/troubleshooting/index.html | grep concepts
