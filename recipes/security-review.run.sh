#!/usr/bin/env bash
# Repeats every command of the page "Recipe: review a node's security claims".
# Usage: security-review.run.sh <folder that holds node_modules with agentic-system-core@1.1.0>
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export GIT_AUTHOR_NAME=you GIT_AUTHOR_EMAIL=you@example.org GIT_COMMITTER_NAME=you GIT_COMMITTER_EMAIL=you@example.org
cd "$(mktemp -d)"
PS4='$ '
set -x

# 1. A node with two commits, built
cp -r "$ENGINE/examples/demos/mode-2-project" my-node && cd my-node
mkdir -p .well-known && printf 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" .
git init -q -b main && git add -A
GIT_AUTHOR_DATE=2026-11-17T09:00:00Z GIT_COMMITTER_DATE=2026-11-17T09:00:00Z git commit -q -m 'a node'
printf '\nIt keeps the plan.\n' >> content/concepts/handoff.md
git add -A
GIT_AUTHOR_DATE=2026-11-18T09:00:00Z GIT_COMMITTER_DATE=2026-11-18T09:00:00Z git commit -q -m 'a second commit'
agsc build --quiet 2>/dev/null

# 2. The digests
node -e 'const l = JSON.parse(require("fs").readFileSync("www/.well-known/knowledge-linkset")).linkset[0]; console.log(l.alternate[0].href, l.alternate[0].digest[0])'
node -e 'console.log("sha-256=:" + require("crypto").createHash("sha256").update(require("fs").readFileSync("www/llms.txt")).digest("base64") + ":")'
node "$ENGINE/tools/validate-wellknown" www/.well-known/knowledge-linkset --level 2
cp -r www www-tampered
echo 'one more line' >> www-tampered/llms.txt
code=0; node "$ENGINE/tools/validate-wellknown" www-tampered/.well-known/knowledge-linkset --level 2 || code=$?
echo "exit $code"
test "$code" -eq 1

# 3. The ledger chain
agsc verify --ledger --quiet
wc -l www/ledger.jsonl
GIT_AUTHOR_DATE=2026-11-19T09:00:00Z GIT_COMMITTER_DATE=2026-11-19T09:00:00Z git commit -q --amend -m 'a second commit, reworded'
code=0; agsc verify --ledger --quiet > ledger.out 2>&1 || code=$?
cut -c1-330 ledger.out
echo "exit $code"
test "$code" -eq 1

# 4. What the tool server refuses
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | agsc mcp | tail -1 | node -e 'for (const t of JSON.parse(require("fs").readFileSync(0)).result.tools) console.log(t.name.padEnd(9), "readOnly=" + t.annotations.readOnlyHint)'
node "$ENGINE/examples/demos/agents/mcp-call.js" remember '{"title":"A new task","body":"Write the test plan.","kind":"task","cluster":"login"}' || echo "exit $?"
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"slug":"handoff","task_state":"TASK_STATE_WORKING"}' || echo "exit $?"
node "$ENGINE/examples/demos/agents/mcp-call.js" read '{"slug":"../../etc/passwd"}' || echo "exit $?"
node "$ENGINE/examples/demos/agents/mcp-call.js" delete '{"slug":"handoff"}' || echo "exit $?"
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"slug":"task-login-tests","task_state":"TASK_STATE_COMPLETED"}' | grep -E '"(type|from|task_state)"'
git status --short -- content agsc.config.json | wc -l
agsc mcp --bind 0.0.0.0 --http 0 || echo "exit $?"
agsc mcp --http 8799 > mcp.log 2>&1 &
sleep 2
cat mcp.log
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8799/mcp -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}'
kill $!

# 5. The stated limits, and where the threat model is written
grep -n '^## ' "$ENGINE/docs/SECURITY-CONSIDERATIONS.md"
sed -n '/^## 5\./,$p' "$ENGINE/docs/SECURITY-CONSIDERATIONS.md" | grep -o '^- \*\*[^*]*\*\*'
head -5 "$ENGINE/SECURITY.md"
