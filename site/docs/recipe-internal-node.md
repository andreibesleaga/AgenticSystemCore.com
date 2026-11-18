---
title: "Recipe: keep a node for internal knowledge"
summary: "For a team that wants a node for knowledge that is not public. You mark the node restricted, see what the build then leaves out of its discovery document, and read it with a local assistant."
description: "Set visibility restricted in agsc.config.json, compare the build with the public one, read the node with agsc mcp, and see what access control you still owe."
---

**Who it is for:** a team that keeps knowledge for its own use as a node and wants an honest picture of what `restricted` does.

**What you get:** the same node built twice, public and restricted, a comparison of the two, and a local tool server over the notes.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell.


## Before you start

Install the engine as in [the Mode 0 guide](/docs/guides/mode-0/). Start in an empty folder; the notes are the `mode-2-project` example that ships in the package (`$ENGINE`).

## 1. Build the node in the open

```bash
cp -r "$ENGINE/examples/demos/mode-2-project" my-node && cd my-node
mkdir -p .well-known && printf 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" .
git init -q -b main && git add -A && git commit -q -m 'a node'
agsc build --quiet 2>/dev/null
mv www ../www-public
```

```text
build: pass (0 error, 1 warn)
```

## 2. Mark it restricted

The key is `visibility` in `agsc.config.json`, `public` by default. A restricted node must also say where a reader gets credentials, in a top-level `access` key. Try it without:

```bash
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("agsc.config.json")); c.visibility = "restricted"; fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n")'
agsc lint --quiet 2>&1 | grep -E '^(lint:|error:)'
```

```text
lint: fail (1 error, 2 warn)
error: AGSC-E202 visibility is restricted and no access page is named; a restricted node carries exactly one rel#access link, whose target is where a reader obtains credentials: name it in the top-level access key (AGSC-11-20) — agsc.config.json
```

Name the page, an absolute `https:` address, then build the restricted node:

```bash
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("agsc.config.json")); c.access = "https://project.example/access/"; fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n")'
agsc lint --quiet 2>&1 | grep -E '^lint:'
agsc build --quiet 2>/dev/null
mv www ../www-restricted
```

```text
lint: pass (0 error, 2 warn)
build: pass (0 error, 1 warn)
```

## 3. Compare the two builds

```bash
cd ..
find www-public -type f | wc -l
find www-restricted -type f | wc -l
diff -rq www-public www-restricted | sed 's/ and .* differ/ differs/'
```

```text
89
89
Files www-public/.well-known/knowledge-linkset differs
Files www-public/_headers differs
Files www-public/index.html differs
Files www-public/llms-full.txt differs
Files www-public/llms.txt differs
Files www-public/now/index.html differs
Files www-public/now.md differs
```

Both builds write the same 89 files. Restricted does not hold content back: every page, `graph.nq` and `chunks.jsonl` are still in `www-restricted/`. What differs is what the node says about itself. Read the discovery document of each:

```bash
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
diff www-public/llms.txt www-restricted/llms.txt
grep -c '^- \[' www-restricted/llms.txt
for d in www-public www-restricted; do echo "$d: $(awk '/^\//{p=$0} /^  Access-Control-Allow-Origin: \*/{print p}' $d/_headers | wc -l) wildcard routes"; done
```

```text
www-public links: rel#boards rel#context rel#graph rel#ledger rel#now rel#skills rel#surface
www-public facts: agsc-bundle-hash agsc-bundle-version agsc-counts agsc-generated-at agsc-spec-version
www-public digests: /llms.txt /graph.jsonld /boards/index.json /ns/context.jsonld /graph.nq /graph.ttl /ledger.jsonl /now.md /skills/index.json /chunks.jsonl
www-restricted links: rel#access rel#boards rel#context rel#graph rel#now rel#skills rel#surface
www-restricted facts: agsc-generated-at agsc-spec-version agsc-visibility
www-restricted digests: /llms.txt /graph.jsonld
10d9
< bundle_version: 0.0.0+1.gf2b1f02bb694
8
www-public: 20 wildcard routes
www-restricted: 1 wildcard routes
```

The restricted discovery document drops the counts, the bundle hash, the content version and the ledger link, and keeps digests for just the two files meant to be public. It adds one `access` link and `agsc-visibility`. `/llms.txt` loses its `bundle_version` line, and the wildcard CORS header goes from 20 routes to the discovery document alone.

## 4. Read it with a local assistant

`agsc mcp` serves ten tools over your notes on your own machine, with no network. The package has a script that makes one call, the way an assistant does:

```bash
cd my-node
node "$ENGINE/examples/demos/agents/mcp-call.js" ask '{"question":"who splits a task into parts"}'
```

```text
  "citations": [
    "https://project.example/concepts/decide-the-login/",
    "https://project.example/procedures/run-the-tests/",
    "https://project.example/concepts/supervisor/"
  ],
  "trust": "untrusted",
  "type": "answer"
```

To connect Claude Code, Cursor or another assistant to this server, follow [Connect an assistant](/docs/recipe-connect-an-assistant/).

## Check that it worked

`agsc lint` failed with `AGSC-E202` until you named the access page, and then `www-restricted/.well-known/knowledge-linkset` listed two digests, not ten.

## What this does not do

- **It does not control access.** `restricted` changes the metadata. The build still writes every file, and your host must put authentication in front of them. The wildcard CORS header is withheld, and nothing else is.
- **Two files stay public by design.** `/llms.txt` and `/graph.jsonld` are served without credentials, and the node's claim of conformance is made on that view (`llms.txt` still lists 8 items). Keep a secret out of titles and descriptions.
- Credential formats, encrypted bundles and visibility of a single item are not defined at 1.1.
- `agsc mcp` has no login: it serves the folder you start it in, to whoever runs it.

## Where to go next

- [The rule](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/SECURITY-CONSIDERATIONS.md) and its threat rows for a restricted node.
- [What a security reviewer can check](/docs/recipe-security-review/).
- [Publish a node and check it live](/docs/guides/publish/).

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/internal-node.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/internal-node.run.sh). More recipes: [the list](/docs/recipes/).
