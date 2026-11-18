---
title: "Recipe: bring notes in from Basic Memory, an Obsidian vault or a Notion export"
summary: "For someone whose notes live in a notes app and who wants them as items in a node. You learn which importer fits which export, try a dry run, import, and fix what the import leaves."
description: "Import Basic Memory notes, an Obsidian vault and a Notion export into an AgenticSystemCore node as drafts, then fix links and lint."
---

**Who it is for:** someone with notes in Basic Memory, an Obsidian vault or a Notion export.

**What you get:** the notes as draft items in one node, with typed links where the source had them, and a clean lint.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell with GNU `sed`.


## Before you start

Install the engine with the block in [Mode 0](/docs/guides/mode-0/). You start in an empty working folder. Make three small sample exports (use your own folders if you have them), then an empty node:

```bash
mkdir -p basic-memory/notes vault/Daily notion
printf -- '---\ntitle: Espresso\ntype: note\ntags: [coffee]\npermalink: espresso\n---\n# Espresso\n\n## Observations\n- [method] Pull a shot in 25 to 30 seconds #coffee\n\n## Relations\n- uses [[Grind size]]\n- broader [[Coffee]]\n' > basic-memory/notes/espresso.md
printf -- '---\ntitle: Grind size\ntype: note\npermalink: grind-size\n---\n# Grind size\n\nFiner grind slows the shot.\n' > basic-memory/notes/grind-size.md
printf -- '---\ntitle: Coffee\ntype: note\npermalink: coffee\n---\n# Coffee\n\nA drink made from roasted beans.\n' > basic-memory/notes/coffee.md
printf -- '# Sourdough\n\nA loaf needs a lively starter. See [[Hydration]] and [[Daily/2026-11-17]].\n' > vault/Sourdough.md
printf -- '# Hydration\n\nWater weight divided by flour weight. Back to [[Sourdough|the sourdough note]].\n' > vault/Hydration.md
printf -- 'Fed the starter at 8.\n' > vault/Daily/2026-11-17.md
printf -- '# Meeting notes\n\nAgreed to move the rota to Mondays. See [Rota](%s).\n' 'Rota%20fedcba9876543210fedcba9876543210.md' > "notion/Meeting notes 0123456789abcdef0123456789abcdef.md"
printf -- '# Rota\n\nThe on-call rota changes every Monday.\n' > "notion/Rota fedcba9876543210fedcba9876543210.md"
printf -- 'Name,Tags,Body\nDesigning Data-Intensive Applications,"books, data",Read the section on logs.\nThe Pragmatic Programmer,books,Reread yearly.\n' > "notion/Reading list 00112233445566778899aabbccddeeff.csv"
mkdir my-node && cd my-node && git init -q -b main
agsc init
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" . && git add -A && git commit -qm 'empty node'
```

## Which importer for which source

| Source | Importer | What it reads |
|---|---|---|
| Basic Memory project | `--from basic-memory` | its Markdown notes, and relations whose type is a link key |
| Obsidian vault of notes | `--from okf` | any tree of Markdown files; `[[wikilinks]]` stay text |
| Notion export, pages | `--from okf` | the `.md` files, after you strip the id Notion adds to each name |
| Notion export, database | `--from csv` | a table: a column `Name` or `title`, a column `Body` or `content` |
| Obsidian Kanban board, Notion task database | `--from board` | see [the task boards recipe](/docs/recipe-task-boards/) |

The 1.1.0 engine has no importer made for an Obsidian vault or for Notion pages. The Markdown reader (`okf`) takes both, as the steps below show. Every importer accepts `--dry-run`, and every foreign note arrives as a draft.

## 1. Basic Memory

```bash
agsc import ../basic-memory --from basic-memory --dry-run
agsc import ../basic-memory --from basic-memory
sed -n 1,16p content/concepts/espresso.md
```

```text
import: 3 written, 0 replaced, 0 unchanged
import: foreign_drafts: 3
import: items: 3
import: links: 2
broader:
  - coffee
uses:
  - grind-size
x-basic-memory-permalink: espresso
```

Two of the relations (`uses`, `broader`) became typed links, because those are link keys. A relation with another type, such as `relates_to`, stays in the body as written. The dry run printed the same counts and wrote nothing.

## 2. An Obsidian vault

```bash
agsc import ../vault --from okf --dry-run
agsc import ../vault --from okf
grep -n '\[\[' content/concepts/sourdough.md content/concepts/hydration.md
```

```text
import: 3 written, 0 replaced, 0 unchanged
import: items: 3
import: unreadable_frontmatter: 3
content/concepts/sourdough.md:12:A loaf needs a lively starter. See [[Hydration]] and [[Daily/2026-11-17]].
content/concepts/hydration.md:12:Water weight divided by flour weight. Back to [[Sourdough|the sourdough note]].
```

The titles come from each page's top heading, or the file name. `unreadable_frontmatter: 3` counts the three notes with no header at all. Wikilinks are not links to the engine, so turn them into Markdown links to the new file names (lower case, `.md`):

```bash
sed -i -E 's/\[\[([^]|]*\/)?([^]|]+)\|([^]]+)\]\]/[\3](\L\2.md)/g; s/\[\[([^]|]*\/)?([^]|]+)\]\]/[\2](\L\2.md)/g' content/concepts/sourdough.md content/concepts/hydration.md
grep -n 'md)' content/concepts/sourdough.md content/concepts/hydration.md
```

```text
content/concepts/sourdough.md:12:A loaf needs a lively starter. See [Hydration](hydration.md) and [2026-11-17](2026-11-17.md).
content/concepts/hydration.md:12:Water weight divided by flour weight. Back to [the sourdough note](sourdough.md).
```

This pattern fits names of one word. A note called `Grind size` becomes the file `grind-size.md`, so replace its spaces with hyphens as well.

## 3. A Notion export

Notion adds a 32-character id to every file name and to every link. Copy the pages without it, then import:

```bash
mkdir ../notion-clean
for f in ../notion/*.md; do n=$(basename "$f" | sed -E 's/ [0-9a-f]{32}\.md$/.md/'); cp "$f" "../notion-clean/$n"; done
sed -i -E 's/\]\(([A-Za-z0-9]+)%20[0-9a-f]{32}\.md\)/](\L\1.md)/g' ../notion-clean/*.md
agsc import ../notion-clean --from okf
agsc import ../notion --from csv --dry-run
agsc import ../notion --from csv
```

```text
import: 2 written, 0 replaced, 0 unchanged
import: --dry-run: 2 file(s) would be written, 0 unchanged
import: foreign_drafts: 2
import: 2 written, 0 replaced, 0 unchanged
```

The pages arrive from `okf`; each row of the database table arrives from `csv` as one item, its `Tags` kept as `x-csv-tags` and any other column in `x-csv-rest`.

## Check that it worked

```bash
agsc lint | grep '^lint:'
```

```text
lint: pass (0 error, 19 warn)
```

Ten items are in `content/concepts/`, all with `status: draft`. Review them, then publish: [the OKF recipe](/docs/recipe-open-knowledge-format/) shows the status change and the build.

## What this does not do

- It does not read Obsidian's `.obsidian` settings, plugins, tags or embeds, or Notion's database properties other than through a CSV.
- It does not turn `[[wikilinks]]` into links for you, and it never publishes: every foreign note is a draft.
- It does not connect to either service. You export from the app, and the engine reads the files.

## Where to go next

- [CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md), route 10: every memory-tool importer, and the exports back.
- [Mode 1](/docs/guides/mode-1/): typed links and the assistant tools.

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/notes-apps.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/notes-apps.run.sh). More recipes: [the list](/docs/recipes/).
