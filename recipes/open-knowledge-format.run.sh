#!/usr/bin/env bash
# Repeats every command of the page "Recipe: bring an Open Knowledge Format bundle in, and write a node out as one".
# Usage: open-knowledge-format.run.sh <folder that holds node_modules>
# Needs the network once: it clones the public example repository.
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export PS4='$ '
WORK="$(mktemp -d)"
cd "$WORK"
set -x

git clone -q https://github.com/GoogleCloudPlatform/open-knowledge-format okf
git -C okf checkout -q ad30107
mkdir my-node && cd my-node && git init -q -b main
git config user.name Demo && git config user.email demo@example.org
agsc init
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" . && git add -A && git commit -qm 'empty node'

# 1. Import
agsc import ../okf/bundles/ga4 --from okf --dry-run 2>&1 | grep -v '^warn'
agsc import ../okf/bundles/ga4 --from okf 2>&1 | grep -v '^warn'
ls content/concepts
sed -n 1,10p content/concepts/purchasers.md
grep -n 'x-okf-type' content/concepts/purchasers.md

# 2. Lint, and the two fixes
rc=0; agsc lint 2>&1 | grep '^lint:' || rc=${PIPESTATUS[0]}
test "$rc" -eq 1
test "$(agsc lint 2>&1 | grep -c 'AGSC-E204')" -eq 9
test "$(agsc lint 2>&1 | grep -c 'AGSC-E310')" -eq 9
sed -i -E 's/^(  at: [0-9T:-]+)\+00:00$/\1Z/' content/concepts/*.md
perl -pi -e 's{\]\((?:\.\./)+(?:[a-z]+/)*([a-z0-9_]+)\.md\)}{ my $s = $1; $s =~ tr/_/-/; $s =~ s/-+$//; "]($s.md)" }ge' content/concepts/*.md
agsc lint | grep '^lint:'

# 3. Publish
sed -i 's/^status: draft$/status: stable/' content/concepts/*.md
git add -A && git commit -qm 'import the ga4 bundle'

# 4. Build
agsc build | grep '^wrote\|^build:'
grep -o 'sha-256=' www/.well-known/knowledge-linkset | wc -l
grep 'Purchasers' www/llms.txt
ls www/graph.jsonld www/graph.ttl www/graph.nq www/chunks.jsonl www/search.json

# 5. Export as OKF
agsc export --okf --manifest 2>&1 | grep '^export'
ls dist/export/okf
test "$(ls dist/export/okf/content/concepts | wc -l)" -eq 9
test -f www/concepts/purchasers/index.html

# Claim on the page: a published page that links to a draft stops the build.
sed -i 's/^status: stable$/status: draft/' content/concepts/purchasers.md
git add -A && git commit -qm 'one page back to draft'
rc=0; agsc build > ../build-fail.txt 2>&1 || rc=$?
test "$rc" -ne 0
grep -m1 'purchasers' ../build-fail.txt

# The limit: a bundle whose headers use inline maps
mkdir ../limit-node && cd ../limit-node && git init -q -b main && agsc init > /dev/null 2>&1
agsc import ../okf/bundles/acme_retail --from okf --dry-run 2>&1 | grep 'unreadable_frontmatter'
for b in stackoverflow crypto_bitcoin; do agsc import ../okf/bundles/$b --from okf --dry-run 2>&1 | grep 'items:\|unreadable_frontmatter'; done
