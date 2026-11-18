---
title: "Recipe: review what a node proves about itself"
summary: "For a security reviewer, an operator or a procurement team. Each claim a node makes is tied to a command, the line it prints and the document to read."
description: "What a reviewer can check on an AgenticSystemCore node: digests, the ledger chain, what the tool server refuses, the stated limits and the threat model."
---

**Who it is for:** a security reviewer or operator who has to say what a built node does and does not guarantee.

**What you get:** for each claim, the command that tests it, the line it prints, and the engine document that states it.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell, curl.


## Before you start

Install the engine as in [the Mode 0 guide](/docs/guides/mode-0/). The commands build the `mode-2-project` example (`$ENGINE`) with two commits and work inside that folder, so the ledger has history to check.

```bash
cp -r "$ENGINE/examples/demos/mode-2-project" my-node && cd my-node
mkdir -p .well-known && printf 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" .
git init -q -b main && git add -A && git commit -q -m 'a node'
printf '\nIt keeps the plan.\n' >> content/concepts/handoff.md
git add -A && git commit -q -m 'a second commit'
agsc build --quiet 2>/dev/null
```

## 1. Every file matches its digest

The discovery document, `/.well-known/knowledge-linkset`, lists each file with a SHA-256 digest. Compare one by hand, then run the shipped checker over all of them:

```bash
node -e 'const l = JSON.parse(require("fs").readFileSync("www/.well-known/knowledge-linkset")).linkset[0]; console.log(l.alternate[0].href, l.alternate[0].digest[0])'
node -e 'console.log("sha-256=:" + require("crypto").createHash("sha256").update(require("fs").readFileSync("www/llms.txt")).digest("base64") + ":")'
node "$ENGINE/tools/validate-wellknown" www/.well-known/knowledge-linkset --level 2
```

```text
https://project.example/llms.txt sha-256=:DA37Xt2R3bYSJRoc2OmOlZOsNLnDcmnnTOE1BlyeN4c=:
sha-256=:DA37Xt2R3bYSJRoc2OmOlZOsNLnDcmnnTOE1BlyeN4c=:
validate-wellknown pass (level 2): 14 input file(s) read, 0 error(s), 0 warning(s)
```

Change one byte of a copy and the checker refuses it:

```bash
cp -r www www-tampered
echo 'one more line' >> www-tampered/llms.txt
node "$ENGINE/tools/validate-wellknown" www-tampered/.well-known/knowledge-linkset --level 2 || echo "exit $?"
```

```text
www-tampered/.well-known/knowledge-linkset:1:1 error AGSC-E201 relation alternate: digest does not match the bytes of https://project.example/llms.txt
validate-wellknown fail (level 2): 14 input file(s) read, 1 error(s), 0 warning(s)
exit 1
```

Read: [Security considerations](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/SECURITY-CONSIDERATIONS.md), section 2. A digest shows which bytes were hashed. It does not show who published them: that rests on the origin's TLS certificate and DNS name.

## 2. The history was not rewritten

`ledger.jsonl` is a hash chain derived from the git history, and the discovery document publishes its head. `agsc verify --ledger` recomputes both. Run it, then rewrite the last commit message in this scratch repository and run it again:

```bash
agsc verify --ledger --quiet
git commit -q --amend -m 'a second commit, reworded'
agsc verify --ledger --quiet > ledger.out 2>&1 || echo "exit $?"
cut -c1-330 ledger.out
```

```text
verify: pass (0 error, 0 warn)
verify: fail (2 error, 0 warn)
error: AGSC-E701 the published agsc-ledger-head "88b666937d686dddc8390ddeea736c3fe60058612f331d1cc805ca9922036bab" is not the recomputed head "100a5d92b16f8c209b8f14d410113bd1d63fc7c9d19f42e7078007f044952546" — the tail has been truncated (AGSC-08-23) — /ledger.jsonl
error: AGSC-E702 the published ledger differs from the recomputation of the same history at line 2 (AGSC-08-23) — www/ledger.jsonl:2
exit 1
```

Your two hashes will differ from these, because they come from your commit dates. The second error names the earliest line where the chain differs. Read: section 3 of the same document. The chain proves a published history was not changed; it does not prove that what a commit says is true.

## 3. What an assistant cannot do through the tool server

`agsc mcp` serves ten tools. List them with the hint each one declares:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | agsc mcp | tail -1 | node -e 'for (const t of JSON.parse(require("fs").readFileSync(0)).result.tools) console.log(t.name.padEnd(9), "readOnly=" + t.annotations.readOnlyHint)'
```

```text
ask       readOnly=true
brief     readOnly=true
check     readOnly=true
compose   readOnly=true
explain   readOnly=true
links     readOnly=true
propose   readOnly=false
read      readOnly=true
remember  readOnly=false
search    readOnly=true
```

`propose` and `remember` are the two that are not read-only, and they return prepared text; they write nothing. Each call below is refused, and the last shows that a proposal changes no file:

```bash
node "$ENGINE/examples/demos/agents/mcp-call.js" remember '{"title":"A new task","body":"Write the test plan.","kind":"task","cluster":"login"}'
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"slug":"handoff","task_state":"TASK_STATE_WORKING"}'
node "$ENGINE/examples/demos/agents/mcp-call.js" read '{"slug":"../../etc/passwd"}'
node "$ENGINE/examples/demos/agents/mcp-call.js" delete '{"slug":"handoff"}'
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"slug":"task-login-tests","task_state":"TASK_STATE_COMPLETED"}' | grep -E '"(type|from|task_state)"'
git status --short -- content agsc.config.json | wc -l
```

```text
    "code": "AGSC-E003",
    "message": "remember needs the declared human operator, `operator`, or the `agent` of a declared lane (AGSC-09-14b)"
    "code": "AGSC-E207",
    "message": "only a concept of kind task has a task_state (AGSC-02-99)"
    "code": "AGSC-E301",
    "message": "no item with that slug in this Bundle"
mcp-call: no answer to tools/call: {"code":-32602,"message":"Unknown tool: delete","data":{"name":"delete"}}
    "from": "TASK_STATE_WORKING",
    "task_state": "TASK_STATE_COMPLETED"
  "type": "proposal"
0
```

The server also refuses to listen anywhere but the loopback address, and refuses a web page of another site:

```bash
agsc mcp --bind 0.0.0.0 --http 0 || echo "exit $?"
agsc mcp --http 8799 > mcp.log 2>&1 &
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8799/mcp -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}'
kill $!
```

```text
{"code":"AGSC-E003","severity":"error","message":"mcp: --bind \"0.0.0.0\" is not a loopback address: one in 127.0.0.0/8, or ::1 (AGSC-09-18)"}
exit 2
403
```

Read: [Using the engine with assistants](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USING-WITH-ASSISTANTS.md). Every answer carries `"trust": "untrusted"`: the text of a node is data for an assistant, never an instruction.

## 4. The stated limits and the threat model

The threat rows, with what closes each and what stays open, are in `docs/SECURITY-CONSIDERATIONS.md`. List its sections and the open items it names:

```bash
grep -n '^## ' "$ENGINE/docs/SECURITY-CONSIDERATIONS.md"
sed -n '/^## 5\./,$p' "$ENGINE/docs/SECURITY-CONSIDERATIONS.md" | grep -o '^- \*\*[^*]*\*\*'
```

```text
12:## 1. Boundary threat rows (continuing the STRIDE table of PLAN §12, T1–T10)
47:## 2. Digests versus signatures — what 1.0 proves and what it does not
67:## 3. The ledger's bounds, stated honestly
75:## 5. What remains open at 1.0, by name
- **Authorship**
- **Truth**
- **A verified but malicious contributor**
- **Restricted visibility**
- **A responder's runtime**
- **`prov.operator` is a published identifier of a natural person**
```

To report a problem, `SECURITY.md` in the package and the node's own `security.txt` name the route. A node needs a `Contact:` line there or `agsc ci` refuses to build.

## Check that it worked

Step 1 ended in `pass` and then `AGSC-E201`; step 2 in `AGSC-E701` and `AGSC-E702`; step 3 in four refusals and a count of 0.

## What this does not do

- It does not show who wrote the node, or that its statements are true. Digests and the ledger cover bytes and history, nothing more.
- It tests the engine's refusals on one example node, not every tool or every input.
- `restricted` visibility is metadata, not access control: see [Keep a node for internal knowledge](/docs/recipe-internal-node/).

## Where to go next

- [Stop a broken change before it is merged](/docs/recipe-ci-gate/).
- [Publish a node and check it live](/docs/guides/publish/).

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/security-review.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/security-review.run.sh). More recipes: [the list](/docs/recipes/).
