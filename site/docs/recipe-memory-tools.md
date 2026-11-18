---
title: "Recipe: copy a node's memory into Mem0, Letta or Zep, and back"
summary: "For anyone who keeps agent memory in Mem0, Letta or Zep and wants a node's notes in it. You end with the files each tool takes, a list of their digests, and the way back."
description: "Export a node's notes as files for Mem0, Letta or Zep, list their digests in a manifest, and import a memory file back into a Bundle."
---

**Who it is for:** a developer who wants the notes of a node in the memory of an agent that runs on Mem0, Letta or Zep.

**What you get:** one file for each tool, a manifest with its SHA-256 digest, and an import that turns such a file back into notes.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell, `openssl` and `jq`.


## Before you start

Install the engine as in [Mode 0](/docs/guides/mode-0/#before-you-start). Start in an empty working folder.
The engine never contacts these services. It writes files. Loading them into a product is done with that product's own tooling; this page did not run any of the three products.

## 1. A small Bundle

The same three notes as in [Mode 0](/docs/guides/mode-0/#1-adopt-your-notes), adopted and committed once:

```bash
mkdir my-notes && cd my-notes
printf '# Sourdough starter\n\nFlour and water, fed once a day. How runny it is depends on its [hydration](%s).\n' hydration.md > sourdough.md
printf '# Hydration\n\nThe weight of the water divided by the weight of the flour.\n' > hydration.md
printf '# Oven spring\n\nThe last rise of a loaf, in the first minutes in a hot oven.\n' > oven-spring.md
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'my notes'
```

## 2. Export, with a manifest

`--to` names the tool. `--manifest` adds a list of the files and their digests.

```bash
for tool in mem0 letta zep; do agsc export --to "$tool" --manifest 2>&1 | grep -e '^wrote' -e '^export:' | sed 's/ sha256:.*//'; done
find dist/export -type f | sort
```

```text
wrote: dist/export/mem0/memories.json
wrote: dist/export/mem0/export-manifest.json
export: pass (0 error, 3 warn)
wrote: dist/export/letta/passages.json
wrote: dist/export/letta/export-manifest.json
export: pass (0 error, 3 warn)
wrote: dist/export/zep/episodes.json
wrote: dist/export/zep/export-manifest.json
export: pass (0 error, 3 warn)
dist/export/letta/export-manifest.json
dist/export/letta/passages.json
dist/export/mem0/export-manifest.json
dist/export/mem0/memories.json
dist/export/zep/episodes.json
dist/export/zep/export-manifest.json
```

The three warnings say that each note has no description. They do not stop the export. Only published items leave the node; a draft or a retired item never does.

## 3. What is in each file

Each file has one record for each item. The tool's own client reads these records ([connectors document](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md#route-10--memory-tools-directly-mem0-letta-zep-csv-basic-memory-claude-code)). Print the first record of each:

```bash
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
```

```text
mem0  memories[0]: messages = [{"content":"# Hydration\n\nThe weight of the water divided by the weight of the flour.","role":"user"}] options.infer = false metadata keys = agsc
letta passages[0]: keys = metadata,text text = "# Hydration\n\nThe weight of the water divided by the weight of the flour."
zep   episodes[0]: type = text sourceDescription = http://localhost/concepts/hydration/
zep   metadata.agsc starts: eyJib2R5IjoiXG4jIEh5ZHJh...
```

The item travels whole under `agsc`: in Mem0 and Letta as an object, in Zep as one base64 string, because Zep's client takes only simple metadata values. That is what lets the import recognise its own items again.

Send the files with each tool's own client. The engine's document names the call for each; check the current version in the product's documentation: [Mem0 add](https://docs.mem0.ai/core-concepts/memory-operations/add), [Letta archival memory](https://docs.letta.com/guides/agents/archival-memory), [Zep graph](https://help.getzep.com/graph-overview).

## 4. The manifest

```bash
cat dist/export/mem0/export-manifest.json; echo
```

```text
{"bundle_hash":"543f2751347821047b8b1cfd71cd03203ac9ea7966cc7a58b5c17e20b17ebf79","bundle_version":"0.0.0+1.gd43d2142952c","files":[{"content_digest":"sha-256=:QYvA3Bk4V3CcaUyrUQE3TN/a4bq495oMYmNy84cLg3s=:","path":"memories.json"}],"item_count":3,"items_digest":"fed927c3ef19afbff3d0cd1a0d11a1ea6f908692fde384b7224f0a89eeb735b2","spec_version":"1.1.0"}
```

It lists each file with its digest, the number of items, the content version and the version of the format. Your digest and version differ: they depend on your commit and your git name.

Check a file against it by hand. The digest is the SHA-256 of the file in base64:

```bash
echo "sha-256=:$(openssl dgst -sha256 -binary dist/export/mem0/memories.json | base64):"
jq -r '.files[0].content_digest' dist/export/mem0/export-manifest.json
```

```text
sha-256=:QYvA3Bk4V3CcaUyrUQE3TN/a4bq495oMYmNy84cLg3s=:
sha-256=:QYvA3Bk4V3CcaUyrUQE3TN/a4bq495oMYmNy84cLg3s=:
```

The two lines are equal. A copy that someone edited prints a different digest:

```bash
cp -r dist/export/mem0 ../mem0-edited
sed -i 's/weight of the water/weight of the WATER/' ../mem0-edited/memories.json
echo "sha-256=:$(openssl dgst -sha256 -binary ../mem0-edited/memories.json | base64):"
```

```text
sha-256=:sF7CW4BnyXIkNRaivUb4lm59/pLCzhZ1H1kpG9Wk698=:
```

The manifest is not a signature. It travels with the files, so whoever can change one can change the other.

## 5. Bring it back

Make an empty Bundle and import the Mem0 folder. `--dry-run` shows what would happen and writes nothing.

```bash
mkdir ../restored && cd ../restored
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'empty'
agsc import ../my-notes/dist/export/mem0 --from mem0 --dry-run
agsc import ../my-notes/dist/export/mem0 --from mem0
ls content/concepts
diff ../my-notes/content/concepts/hydration.md content/concepts/hydration.md || echo "diff exit code $?"
```

```text
import: --dry-run: 3 file(s) would be written, 0 unchanged
import: items: 3
import: pass (0 error, 1 warn)
warn: AGSC-E506 export-manifest.json: not imported: the file holds no list of Mem0 memories (a JSON array, or one under "memories" or "results")
import: 3 written, 0 replaced, 0 unchanged
import: items: 3
import: pass (0 error, 1 warn)
warn: AGSC-E506 export-manifest.json: not imported: the file holds no list of Mem0 memories (a JSON array, or one under "memories" or "results")
hydration.md
oven-spring.md
sourdough.md
>   source_version: 0.0.0+1.gd43d2142952c
diff exit code 1
```

Some lines the command printed are left out. The three notes came back, and the only difference is one added line that records the version they came from. The warning says the manifest file is not a memory record; it is harmless. Into a Bundle that already holds the same notes, the import refuses and writes nothing; `--replace` lets the imported items replace them.

Records from the tool that are not this node's items arrive as drafts, never published until a person changes their status. The Letta and Zep files come back the same way:

```bash
agsc import ../my-notes/dist/export/letta --from letta --dry-run 2>&1 | grep '^import: items'
agsc import ../my-notes/dist/export/zep --from zep --dry-run 2>&1 | grep '^import: items'
```

```text
import: items: 3
```

## Check that it worked

The two digests in step 4 are equal, and step 5 lists the three notes in `restored/content/concepts`.

## What this does not do

- It does not send anything to Mem0, Letta or Zep, and this page did not run them. The engine's document shows a sketch for Mem0 that you run with your own key.
- At this version the import of a memory folder does not check the manifest: it names the file as "not imported" and goes on. Compare the digests by hand, as in step 4, before you import a copy you did not make.
- Only published items leave. Notes without a `description` give a warning.

## Where to go next

- [Mode 1](/docs/guides/mode-1/#5-take-the-memory-elsewhere) on taking the memory elsewhere.
- [Connect an assistant](/docs/recipe-connect-an-assistant/) to search the notes directly.
- [Move a site in](/docs/recipe-move-a-site-in/) for other formats that `agsc import` reads.

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/memory-tools.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/memory-tools.run.sh). More recipes: [the list](/docs/recipes/).
