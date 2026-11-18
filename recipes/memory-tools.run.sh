#!/usr/bin/env bash
# Repeats every command of memory-tools.md. Usage: memory-tools.run.sh <folder holding node_modules>
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export GIT_AUTHOR_DATE="2026-11-18T10:00:00Z" GIT_COMMITTER_DATE="2026-11-18T10:00:00Z"   # fixed commit time: the same bytes on every run
WORK="$(mktemp -d)"; cd "$WORK"
export PS4='+ '
set -x

# 1. a small Bundle
mkdir my-notes && cd my-notes
printf '# Sourdough starter\n\nFlour and water, fed once a day. How runny it is depends on its [hydration](%s).\n' hydration.md > sourdough.md
printf '# Hydration\n\nThe weight of the water divided by the weight of the flour.\n' > hydration.md
printf '# Oven spring\n\nThe last rise of a loaf, in the first minutes in a hot oven.\n' > oven-spring.md
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'my notes'

# 2. export for the three tools, with a manifest
for tool in mem0 letta zep; do agsc export --to "$tool" --manifest 2>&1 | grep -e '^wrote' -e '^export:' | sed 's/ sha256:.*//'; done
find dist/export -type f | sort

# 3. the shape of each file
node -e '
const fs = require("fs");
const pick = (file, key) => JSON.parse(fs.readFileSync(file, "utf8"))[key][0];
const m = pick("dist/export/mem0/memories.json", "memories");
console.log("mem0  memories[0]: messages =", JSON.stringify(m.messages), "options.infer =", m.options.infer, "metadata keys =", Object.keys(m.options.metadata).join(","));
const l = pick("dist/export/letta/passages.json", "passages");
console.log("letta passages[0]: keys =", Object.keys(l).join(","), "text =", JSON.stringify(l.text));
const z = pick("dist/export/zep/episodes.json", "episodes");
console.log("zep   episodes[0]: type =", z.type, "sourceDescription =", z.sourceDescription);
console.log("zep   metadata.agsc starts:", z.metadata.agsc.slice(0, 24) + "...");'

# 4. the manifest
cat dist/export/mem0/export-manifest.json; echo
node -e '
const j = JSON.parse(require("fs").readFileSync("dist/export/mem0/export-manifest.json", "utf8"));
console.log("members:", Object.keys(j).join(" "));'

# 5. check a file against the manifest by hand
echo "sha-256=:$(openssl dgst -sha256 -binary dist/export/mem0/memories.json | base64):"
jq -r '.files[0].content_digest' dist/export/mem0/export-manifest.json

# 5b. a changed copy no longer matches
cp -r dist/export/mem0 ../mem0-edited
sed -i 's/weight of the water/weight of the WATER/' ../mem0-edited/memories.json
echo "sha-256=:$(openssl dgst -sha256 -binary ../mem0-edited/memories.json | base64):"

# 6. import into an empty Bundle
mkdir ../restored && cd ../restored
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'empty'
agsc import ../my-notes/dist/export/mem0 --from mem0 --dry-run
agsc import ../my-notes/dist/export/mem0 --from mem0
ls content/concepts
diff ../my-notes/content/concepts/hydration.md content/concepts/hydration.md || echo "diff exit code $?"
set +x
echo "memory-tools: all steps ran"

set -x
mkdir ../restored-2 && cd ../restored-2
agsc init > /dev/null 2>&1
git init -q -b main
agsc import ../my-notes/dist/export/letta --from letta --dry-run 2>&1 | grep '^import: items'
agsc import ../my-notes/dist/export/zep --from zep --dry-run 2>&1 | grep '^import: items'
set +x
