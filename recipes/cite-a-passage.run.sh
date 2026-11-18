#!/usr/bin/env bash
# Repeats every command of cite-a-passage.md. Usage: cite-a-passage.run.sh <folder holding node_modules>
# Step 5 fetches one file from https://agenticsystemcore.com/ (network).
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export GIT_AUTHOR_DATE="2026-11-18T10:00:00Z" GIT_COMMITTER_DATE="2026-11-18T10:00:00Z"   # fixed commit time: the same bytes on every run
WORK="$(mktemp -d)"; cd "$WORK"
export PS4='+ '
set -x

# 1. a small Bundle, with a note that has two sections
mkdir my-notes && cd my-notes
cat > sourdough.md <<'NOTE'
# Sourdough starter

Flour and water, fed once a day.

## Feeding

Feed it the same weight of flour and water, once a day, at the same hour.

## Hydration

How runny it is depends on the share of water to flour.
NOTE
printf '# Oven spring\n\nThe last rise of a loaf, in the first minutes in a hot oven.\n' > oven-spring.md
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'my notes'
agsc build > /dev/null 2>&1

# 2. the passages of the node, and their addresses
jq -r '[.id[0:16], .section, .ordinal, .digest[0:16], .iri] | @tsv' www/chunks.jsonl

# 3. the citation: address, digest, version
ID16=17000c45cc2f2a8b
test "$ID16" = "$(jq -r 'select(.section == "feeding") | .id[0:16]' www/chunks.jsonl)"
jq -c 'select(.section == "feeding") | {chunk: (.iri + "#chunk-" + .id[0:16]), item: .iri, digest: .digest, license: .license}' www/chunks.jsonl

# 4. a reader checks it
CITED_DIGEST="$(jq -r 'select(.section == "feeding") | .digest' www/chunks.jsonl)"
jq -j --arg id "$ID16" 'select(.id | startswith($id)) | .text' www/chunks.jsonl | sha256sum
echo "$CITED_DIGEST"
sed -i 's/same weight/same mass/' content/concepts/sourdough.md
git commit -qam 'reword' && agsc build > /dev/null 2>&1
jq -j --arg id "$ID16" 'select(.id | startswith($id)) | .text' www/chunks.jsonl | sha256sum

# 5. a live node
curl -s https://agenticsystemcore.com/chunks.jsonl \
  | jq -r 'select(.id | startswith("3bb4f25f4fb8a70b")) | "item:   " + .iri, "title:  " + .title, "digest: " + .digest'
date -u +%Y-%m-%dT%H:%M:%SZ
curl -s https://agenticsystemcore.com/chunks.jsonl \
  | grep '"id":"3bb4f25f4fb8a70b' \
  | node -e '
let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => {
  const r = JSON.parse(s), { createHash } = require("node:crypto");
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  console.log("digest", sha(Buffer.from(r.text, "utf8")) === r.digest ? "matches" : "DIFFERS", r.digest);
  console.log("id    ", sha(Buffer.from(`${r.iri}\0${r.section}\0${r.ordinal}`, "utf8")) === r.id ? "matches" : "DIFFERS", r.id);
});'
curl -s https://agenticsystemcore.com/chunks.jsonl \
  | jq -j 'select(.id | startswith("3bb4f25f4fb8a70b")) | .text' | sha256sum
curl -s https://agenticsystemcore.com/.well-known/knowledge-linkset \
  | jq -r '.linkset[0].describedby[0]["agsc-bundle-version"][0], .linkset[0].license[0].href'
set +x
echo "cite-a-passage: all steps ran"
