#!/usr/bin/env bash
# Repeats every command of the page "Recipe: keep a node for internal knowledge".
# Usage: internal-node.run.sh <folder that holds node_modules with agentic-system-core@1.1.0>
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export GIT_AUTHOR_NAME=you GIT_AUTHOR_EMAIL=you@example.org GIT_COMMITTER_NAME=you GIT_COMMITTER_EMAIL=you@example.org
export GIT_AUTHOR_DATE=2026-11-18T09:00:00Z GIT_COMMITTER_DATE=2026-11-18T09:00:00Z
cd "$(mktemp -d)"
PS4='$ '
set -x

# 1. A node, built in the open
cp -r "$ENGINE/examples/demos/mode-2-project" my-node && cd my-node
mkdir -p .well-known && printf 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" .
git init -q -b main && git add -A && git commit -q -m 'a node'
agsc build --quiet 2>/dev/null
mv www ../www-public

# 2. The same node, marked restricted
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("agsc.config.json")); c.visibility = "restricted"; fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n")'
agsc lint --quiet 2>&1 | grep -E '^(lint:|error:)' || true
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("agsc.config.json")); c.access = "https://project.example/access/"; fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n")'
agsc lint --quiet 2>&1 | grep -E '^lint:'
agsc build --quiet 2>/dev/null
mv www ../www-restricted

# 3. What changed
cd ..
find www-public -type f | wc -l
find www-restricted -type f | wc -l
diff -rq www-public www-restricted | sed 's/ and .* differ/ differs/' || true
cat > compare.js <<'JS'
const fs = require("fs");
for (const dir of ["www-public", "www-restricted"]) {
  const set = JSON.parse(fs.readFileSync(dir + "/.well-known/knowledge-linkset")).linkset[0];
  const rel = (k) => k.replace("https://w3id.org/agentic-system-core/rel#", "rel#");
  console.log(dir + " links: " + Object.keys(set).filter((k) => k.startsWith("http")).map(rel).join(" "));
  console.log(dir + " facts: " + Object.keys(set.describedby[0]).filter((k) => k.startsWith("agsc-")).join(" "));
  const digests = Object.values(set).flat().filter((l) => l && l.digest).map((l) => new URL(l.href).pathname);
  console.log(dir + " digests: " + digests.join(" "));
}
JS
node compare.js
diff www-public/llms.txt www-restricted/llms.txt || true
grep -c '^- \[' www-restricted/llms.txt
for d in www-public www-restricted; do echo "$d: $(awk '/^\//{p=$0} /^  Access-Control-Allow-Origin: \*/{print p}' $d/_headers | wc -l) wildcard routes"; done

# 4. Read it with a local assistant tool server
cd my-node
node "$ENGINE/examples/demos/agents/mcp-call.js" ask '{"question":"who splits a task into parts"}'
