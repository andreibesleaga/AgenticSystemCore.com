#!/usr/bin/env bash
# Repeats every command of connect-an-assistant.md. Usage: connect-an-assistant.run.sh <folder holding node_modules>
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

# 2. ask for the tool list by hand
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
} | agsc mcp > init-and-list.jsonl
node -e '
const lines = require("fs").readFileSync("init-and-list.jsonl", "utf8").trim().split("\n").map(JSON.parse);
console.log("server:", lines[0].result.serverInfo.name, lines[0].result.serverInfo.version);
console.log("tools:", lines[1].result.tools.map((t) => t.name).join(" "));'

# 3. call two tools
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}'
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search","arguments":{"query":"hydration"}}}'
  echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read","arguments":{"slug":"hydration"}}}'
} | agsc mcp > calls.jsonl
node -e '
const lines = require("fs").readFileSync("calls.jsonl", "utf8").trim().split("\n").map(JSON.parse);
const search = lines[1].result.structuredContent;
for (const h of search.body.hits) console.log("hit:", h.slug, h.iri);
console.log("trust:", search.trust);
const read = lines[2].result.structuredContent;
console.log("read members:", Object.keys(read.body).join(" "));
console.log("chunk record:", JSON.stringify(read.body.chunks[0]));'

# 4. the same server over HTTP, on this machine only
agsc mcp --http 0 2> http.log &
SERVER=$!
sleep 2
sed -E 's#:[0-9]+/mcp#:PORT/mcp#' http.log
URL="$(grep -o 'http://[^ ]*' http.log | head -1)"
curl -s "$URL" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: server/discover' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log("supportedVersions:",JSON.stringify(JSON.parse(s).result.supportedVersions)))'
kill "$SERVER"
wait "$SERVER" 2>/dev/null || true
set +x
echo "connect-an-assistant: all steps ran"
