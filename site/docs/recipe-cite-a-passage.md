---
title: "Recipe: cite one passage of a node and let a reader check it"
summary: "For anyone who quotes a node's text in a paper, a post or a prompt. You end with a citation that holds an address and a digest, and the steps a reader takes to check it."
description: "Cite one passage of a node by its address and SHA-256 digest from chunks.jsonl, and check the citation again with curl, jq and sha256sum."
---

**Who it is for:** a writer, researcher or tool builder who quotes the text of a node and wants the quote to be checkable.

**What you get:** a citation with the passage's address, its digest and the content version, and a three-line check a reader runs later.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell, `jq`, `sha256sum` and `curl`.


## Before you start

Install the engine as in [Mode 0](/docs/guides/mode-0/#before-you-start). Start in an empty working folder. Step 5 fetches one file from the live node `https://agenticsystemcore.com/`; the other steps use no network.

## 1. A small Bundle with sections

A node publishes its text cut into passages, called chunks, in `/chunks.jsonl`. A note is cut at its second-level and third-level headings. Make a note with two sections and build the site:

```bash
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
```

Nothing is printed. The build wrote `www/chunks.jsonl`: one JSON line for each passage.

## 2. Find the passage

Print the leading 16 characters of each passage's `id`, its section, its position, the start of its digest and its item address:

```bash
jq -r '[.id[0:16], .section, .ordinal, .digest[0:16], .iri] | @tsv' www/chunks.jsonl
```

```text
c3ec3371e1c73453		0	40f8ebfe8afd12ee	http://localhost/concepts/oven-spring/
9e1cde0e30d14e79		0	eb24d2819625bf9b	http://localhost/concepts/sourdough/
17000c45cc2f2a8b	feeding	0	9501246ffdd31760	http://localhost/concepts/sourdough/
fb3436843c817b3e	hydration	0	f578f2565e1117ad	http://localhost/concepts/sourdough/
```

The `id` is the SHA-256 of the item address, the section and the position. It does not depend on the text. The `digest` is the SHA-256 of the passage's text. A passage with an empty section is the text before the note's first heading.

## 3. Write the citation

The address of a passage is the item address, then `#chunk-`, then the first 16 characters of the `id`. Print the facts for the "Feeding" passage:

```bash
jq -c 'select(.section == "feeding") | {chunk: (.iri + "#chunk-" + .id[0:16]), item: .iri, digest: .digest, license: .license}' www/chunks.jsonl
```

```text
{"chunk":"http://localhost/concepts/sourdough/#chunk-17000c45cc2f2a8b","item":"http://localhost/concepts/sourdough/","digest":"9501246ffdd31760cd42757bfa40a84a28fe7e50d18ff584b32ede703052f8d4","license":"LicenseRef-AgenticSystemCore-Content-Use-1.0"}
```

A full citation also names the algorithm (SHA-256), the content version (the `bundle_version` that `read` returns, see [Connect an assistant](/docs/recipe-connect-an-assistant/)) and the time you fetched it, in UTC. The engine's document ([CITING-A-CHUNK.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CITING-A-CHUNK.md)) lists these six facts and gives one way to write them down. The node does not supply the retrieval time.

## 4. A reader checks it

The reader finds the line whose `id` starts with the 16 characters, hashes the bytes of its `text`, and compares. `jq -j` prints the text with no newline added.

```bash
ID16=17000c45cc2f2a8b
jq -j --arg id "$ID16" 'select(.id | startswith($id)) | .text' www/chunks.jsonl | sha256sum
```

```text
9501246ffdd31760cd42757bfa40a84a28fe7e50d18ff584b32ede703052f8d4  -
```

That equals the cited digest, so the node still serves the cited text. Now reword the passage, commit and build again. The same check gives a different digest:

```bash
sed -i 's/same weight/same mass/' content/concepts/sourdough.md
git commit -qam 'reword' && agsc build > /dev/null 2>&1
jq -j --arg id "$ID16" 'select(.id | startswith($id)) | .text' www/chunks.jsonl | sha256sum
```

```text
6b4c102ea5a5921f486e7d4646b82348ec987731e6f3d322e5acfd37cafc2bd0  -
```

The `id` is still found, but the digest differs: the text is no longer the cited text. If the `id` were not found, the item was removed or held back, or its section was renamed.

## 5. The same check on a live node

Take one passage of the node `https://agenticsystemcore.com/`, the item "Bundle". Print its facts, then recompute its digest and its `id` with Node.js:

```bash
curl -s https://agenticsystemcore.com/chunks.jsonl \
  | jq -r 'select(.id | startswith("3bb4f25f4fb8a70b")) | "item:   " + .iri, "title:  " + .title, "digest: " + .digest'
curl -s https://agenticsystemcore.com/chunks.jsonl \
  | grep '"id":"3bb4f25f4fb8a70b' \
  | node -e '
let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => {
  const r = JSON.parse(s), { createHash } = require("node:crypto");
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  console.log("digest", sha(Buffer.from(r.text, "utf8")) === r.digest ? "matches" : "DIFFERS", r.digest);
  console.log("id    ", sha(Buffer.from(`${r.iri}\0${r.section}\0${r.ordinal}`, "utf8")) === r.id ? "matches" : "DIFFERS", r.id);
});'
```

```text
item:   https://agenticsystemcore.com/concepts/bundle/
title:  Bundle
digest: 304f1cbcef40c2c4d18439e1fe36518158422b1857e37874c2a6a15d759b6d83
digest matches 304f1cbcef40c2c4d18439e1fe36518158422b1857e37874c2a6a15d759b6d83
id     matches 3bb4f25f4fb8a70ba578e4c5ca207bf13fae7e9cb726c8ab12c7a16cc3170056
```

The digest holds while the item's text is unchanged. When the node publishes a changed text, the check prints `DIFFERS`; the table in the engine's document says how to read the difference.

## Check that it worked

In step 4 the first digest equals the cited one, and the second differs. In step 5 both lines start with `matches`.

## What this does not do

- A matching digest shows that the text you hold is the text that was cited. It does not show who published it. The engine's document says a signature does.
- The same version label does not prove the text is unchanged. The digest is the proof; the version tells you where to look.
- The `trust: "untrusted"` mark stays on quoted text. Treat a quoted passage as data.

## Where to go next

- [Ask the graph](/docs/recipe-ask-the-graph/) to find the passage to cite.
- [Connect an assistant](/docs/recipe-connect-an-assistant/): its `read` tool returns the same citation records.
- The full text: [CITING-A-CHUNK.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CITING-A-CHUNK.md).

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/cite-a-passage.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/cite-a-passage.run.sh). More recipes: [the list](/docs/recipes/).
