---
title: "Recipe: bring an Open Knowledge Format bundle in, and write a node out as one"
summary: "For someone who holds a folder in Open Knowledge Format (OKF) and wants it as a checked site with a graph and files for assistants, or who needs a node's notes in that format. You end with the bundle imported, checked, published and built, and an OKF export with a digest for every file."
description: "Import an Open Knowledge Format folder into an AgenticSystemCore node, fix what the check finds, publish, build, and export the node as OKF."
---

**Who it is for:** someone with an OKF folder who wants it checked, published and searchable, or who needs a node's notes in OKF.

**What you get:** every page of the bundle as an item with its title, description, tags and sources; a built site with a graph, a discovery file and files for assistants; and an OKF export of the node.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell with GNU `sed` and `perl`, and network access to clone one example repository.

Open Knowledge Format is the format published in the [open-knowledge-format repository](https://github.com/GoogleCloudPlatform/open-knowledge-format): a folder of Markdown files, each with a header that names a `type`. This page was run against version 0.2 of its [specification](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/ad30107/SPEC.md) and the example bundles of that repository, on 18 November 2026.


## Before you start

Install the engine with the block in [Mode 0](/docs/guides/mode-0/). Then fetch the example bundles, and make an empty node with a security contact, the content licence and one commit:

```bash
git clone -q https://github.com/GoogleCloudPlatform/open-knowledge-format okf
git -C okf checkout -q ad30107
mkdir my-node && cd my-node && git init -q -b main
agsc init
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" . && git add -A && git commit -qm 'empty node'
```

Use your own link in `Contact:`, and your own OKF folder in place of `../okf/bundles/ga4`.

## 1. Import

`--dry-run` plans the import and writes nothing. Then run it for real:

```bash
agsc import ../okf/bundles/ga4 --from okf --dry-run 2>&1 | grep -v '^warn'
agsc import ../okf/bundles/ga4 --from okf 2>&1 | grep -v '^warn'
sed -n 1,10p content/concepts/purchasers.md
grep -n 'x-okf-type' content/concepts/purchasers.md
```

```text
import: --dry-run: 9 file(s) would be written, 0 unchanged
import: 9 written, 0 replaced, 0 unchanged
import: items: 9
import: unreadable_frontmatter: 0
import: pass (0 error, 36 warn)
---
type: concept
title: Purchasers Audience Metric
description: Computes the count or list of users who have completed a purchase or in-app purchase.
status: draft
tags:
  - metric
  - audience
  - ga4
  - purchasers
23:x-okf-type: Reference
```

Nine pages came in, each with its title, description, tags and sources. OKF lets a bundle name its own types; the node has six, so the page became a `concept` and its OKF type is kept as `x-okf-type`. The 36 warnings say what the import added, one line each. Every page arrives as `status: draft`: it reaches no published page or file until a person changes that.

## 2. Let the check find what to fix

```bash
agsc lint | grep '^lint:'
```

```text
lint: fail (18 error, 39 warn)
```

The check found two kinds of error, nine of each. The bundle writes times as `+00:00`, and the node wants `Z`. The bundle links pages across folders (`../references/metrics/purchasers.md`), and the node keeps its items in one folder, with hyphens in file names. Two commands fix both:

```bash
sed -i -E 's/^(  at: [0-9T:-]+)\+00:00$/\1Z/' content/concepts/*.md
perl -pi -e 's{\]\((?:\.\./)+(?:[a-z]+/)*([a-z0-9_]+)\.md\)}{ my $s = $1; $s =~ tr/_/-/; $s =~ s/-+$//; "]($s.md)" }ge' content/concepts/*.md
agsc lint | grep '^lint:'
```

```text
lint: pass (0 error, 39 warn)
```

The warnings left (footnotes, pages nobody links to) do not stop a build.

## 3. Publish

An item is published when its `status` is not `draft`. Read the pages, then set the status of the ones you accept; here, all nine:

```bash
sed -i 's/^status: draft$/status: stable/' content/concepts/*.md
git add -A && git commit -qm 'import the ga4 bundle'
```

A published page may link to published pages alone. If you publish a page that links to a draft, the build stops and names the link.

## 4. Build, and see what the build adds

```bash
agsc build | grep '^wrote\|^build:'
grep -o 'sha-256=' www/.well-known/knowledge-linkset | wc -l
grep 'Purchasers' www/llms.txt
ls www/graph.jsonld www/graph.ttl www/graph.nq www/chunks.jsonl www/search.json
```

```text
wrote: 94 files under www/
build: pass (0 error, 11 warn)
11
- [Purchasers Audience Metric](http://localhost/concepts/purchasers/): Computes the count or list of users who have completed a purchase or in-app purchase.
www/chunks.jsonl
www/graph.jsonld
www/graph.nq
www/graph.ttl
www/search.json
```

The OKF folder held Markdown files. The node now also holds:

- a website with one page per item and a search page;
- a discovery file, `.well-known/knowledge-linkset`, that lists the machine files with a SHA-256 digest each;
- the graph in three forms, and `llms.txt` and `chunks.jsonl` for assistants and retrieval;
- the ten tools an assistant can call, through `agsc mcp` ([connect an assistant](/docs/recipe-connect-an-assistant/)).

## 5. Write the node out as OKF

```bash
agsc export --okf --manifest 2>&1 | grep '^export'
ls dist/export/okf
```

```text
export --okf: 12 files under dist/export/okf/ (AGSC-01-26; the export root carries LICENSE-CONTENT)
export: pass (0 error, 11 warn)
LICENSE-CONTENT
content
export-manifest.json
```

Published items leave; drafts stay. `export-manifest.json` holds a digest of every exported file, so whoever receives the folder can check the copy.

## Check that it worked

`agsc lint` and `agsc build` print `pass`, `www/concepts/purchasers/index.html` exists, and `dist/export/okf/content/concepts/` holds nine files.

## What this does not do

- It does not read a header written with inline maps (`generated: { by: …, at: … }`). The import then keeps the page's text and writes a new header, so the title comes from the first heading and the tags are not carried over. Of the four example bundles, three import with every header read (`ga4`, `stackoverflow`, `crypto_bitcoin`); `acme_retail` uses inline maps on all nine pages. Rewrite such headers in block form before importing.
- It does not keep OKF's folders or rewrite links: step 2 is yours.
- It does not copy files that are not Markdown, and it never publishes for you.

## Where to go next

- [Move an existing wiki or docs folder in](/docs/recipe-move-a-site-in/): the same importer reads any folder of Markdown.
- [Mode 1](/docs/guides/mode-1/), section 5: the other exports.
- [CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md): every adapter.

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/open-knowledge-format.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/open-knowledge-format.run.sh). More recipes: [the list](/docs/recipes/).
