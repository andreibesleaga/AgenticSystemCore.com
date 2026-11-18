---
title: "Recipe: move an existing wiki or docs folder into a node"
summary: "For someone with a folder of Markdown pages that link to each other, such as a wiki export or a docs folder. You end with a checked, built node and a list of what the import changed."
description: "Import a folder of Markdown pages into an AgenticSystemCore node, review the drafts, fix links, publish and build."
---

**Who it is for:** someone with a docs folder or wiki export of Markdown pages, who wants it as a checked site and graph.

**What you get:** the pages as items in a node, links verified, a built site, and a clear view of what the import changed.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell with GNU `sed`. HTML pages must be converted to Markdown first; the engine has no HTML importer.


## Before you start

Install the engine with the block in [Mode 0](/docs/guides/mode-0/). You start in an empty working folder. Make a small wiki to move; use your own folder if you have one:

```bash
mkdir -p wiki/guides wiki/reference
printf '# Acme Wiki\n\nStart with the [install guide](%s).\n' guides/install.md > wiki/index.md
printf '# Install the tool\n\nSet it up as in the [config reference](%s).\nSee [troubleshooting](%s).\n' ../reference/config.md troubleshooting.md > wiki/guides/install.md
printf '# Troubleshooting\n\nCheck your [configuration](%s), then the [install guide](%s).\n' ../reference/config.md install.md > wiki/guides/troubleshooting.md
printf -- '---\ntitle: Configuration reference\ntags: [config, reference]\n---\n\n# Configuration reference\n\nEvery setting lives in `acme.toml`.\n' > wiki/reference/config.md
mkdir my-node && cd my-node && git init -q -b main
agsc init
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" . && git add -A && git commit -qm 'empty node'
```

## 1. Choose the route

There are two ways in, and both end in the same checks:

- **The folder becomes the node.** `agsc init` adopts a folder of Markdown where it is. [Mode 0](/docs/guides/mode-0/) shows it.
- **The pages join a node that exists.** `agsc import --from okf` reads any tree of `.md` files, in any layout, and brings each page in as a draft to review. This page shows that route.

## 2. Import

Run `--dry-run` to plan without writing, then import:

```bash
agsc import ../wiki --from okf --dry-run
agsc import ../wiki --from okf
find content -type f | sort
head -8 content/concepts/install.md
```

```text
import: 3 written, 0 replaced, 0 unchanged
import: items: 3
import: unreadable_frontmatter: 2
import: pass (0 error, 16 warn)
content/concepts/config.md
content/concepts/install.md
content/concepts/troubleshooting.md
content/index.md
---
type: concept
title: Install the tool
status: draft
prov:
  origin: imported
  operator: human:demo
kind: explainer
```

Three pages came in as concepts, with the title taken from each page's top heading, and all as drafts. `unreadable_frontmatter: 2` counts the two pages with no header at all. The 16 warnings list each addition. The wiki's `index.md` did not come in: a file called `index.md` is never an item, and `content/index.md` is the node's own home page. Move its text there by hand.

## 3. Lint, and fix the links

```bash
agsc lint 2>&1 | grep -E '^(error|lint:)'
```

```text
lint: fail (2 error, 8 warn)
error: AGSC-E310 body reference "../reference/config.md" resolves to nothing inside the Bundle (AGSC-03-11) — content/concepts/install.md:12
error: AGSC-E310 body reference "../reference/config.md" resolves to nothing inside the Bundle (AGSC-03-11) — content/concepts/troubleshooting.md:12
```

The `agsc lint` command exits with 1. The wiki's folders are gone, so a link that went up and over now points nowhere. Drop the folder part, then check again:

```bash
sed -i -E 's#\]\(\.\./[a-z]+/([a-z0-9-]+\.md)\)#](\1)#g' content/concepts/*.md
agsc lint | grep '^lint:'
```

```text
lint: pass (0 error, 8 warn)
```

## 4. Publish and build

An item stays out of the site until its `status` is not `draft`. Review the pages, then set it for the ones you accept; here, all three:

```bash
sed -i 's/^status: draft$/status: stable/' content/concepts/*.md
git add -A && git commit -qm 'move the wiki in'
agsc build | grep -v '^skipped\|^warn'
grep -o 'href="[^"]*"' www/concepts/troubleshooting/index.html | grep concepts
```

```text
wrote: 62 files under www/
build: pass (0 error, 5 warn)
href="http://localhost/concepts/troubleshooting/"
href="/concepts/"
href="/concepts/config/"
href="/concepts/install/"
```

The page links now resolve to pages of the built site.

## Check that it worked

`agsc lint` and `agsc build` print `pass`. `www/concepts/install/index.html` exists, and the links in it reach `/concepts/config/`.

## What this does not do

- It does not keep your old addresses: each page now lives at `/concepts/<name>/`. Set up redirects on your own host.
- It does not import HTML, images or other attachments, and it does not carry over `index.md` files.
- The importer named `old-site` in `agsc import --help` is not for this: it reads the layout of one retired site.
- It does not keep a header it cannot read (the same limit as in [the OKF recipe](/docs/recipe-open-knowledge-format/)).
- It does not add descriptions or typed links; `lint` lists them as warnings.

## Where to go next

- [Mode 1](/docs/guides/mode-1/): typed links between items, and connecting an assistant.
- [Troubleshooting](/docs/guides/troubleshooting/) for any code `lint` prints.

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/move-a-site-in.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/move-a-site-in.run.sh). More recipes: [the list](/docs/recipes/).
