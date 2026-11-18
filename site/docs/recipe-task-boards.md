---
title: "Recipe: move a task board into a node and back out"
summary: "For a team whose tasks sit in a tracker or a notes app. You import a board export as draft tasks, publish them as a live board, and export the board in another tool's format."
description: "Import a Jira CSV board into an AgenticSystemCore node, publish it as a live board, and export it as a Trello file. All eleven formats listed."
---

**Who it is for:** someone who keeps tasks in a tracker (GitHub, GitLab, Jira, Trello, Linear, Asana, Notion, Obsidian Kanban, a Markdown list or Todo.txt) and wants them in a node, or the other way round.

**What you get:** a board of tasks in a node, with states, assignees and due dates kept; the same board written as another tool's import file.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell with GNU `sed`.


## Before you start

Install the engine with the block in [Mode 0](/docs/guides/mode-0/). You start in an empty working folder. Make a small Jira-style CSV export (use your own export if you have one) and an empty node:

```bash
mkdir from-jira
printf 'Issue key,Summary,Status,Assignee,Project name,Description,Labels,Due date\nWEB-1,Write the FAQ,In Progress,sam,Website,Answer the ten questions people ask most.,docs,2026-12-01\nWEB-2,Check the links,To Do,,Website,Check every link once the FAQ is written.,docs,\n' > from-jira/website.csv
mkdir my-node && cd my-node && git init -q -b main
agsc init
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" . && git add -A && git commit -qm 'empty node'
```

## The formats the engine reads and writes

The board importer and exporter share one table of eleven formats, and each format works in both directions:

| `--format` | File | Direction |
|---|---|---|
| `github`, `gitlab`, `trello`, `agsc-board` | `.json` | both |
| `asana`, `jira`, `linear`, `notion` | `.csv` | both |
| `markdown`, `obsidian-kanban` | `.md` | both |
| `todotxt` | `.txt` | both |

`agsc-board` is the node's own format. For the steps that get each file out of each tool, see Route 7 of [CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md).

## 1. Import the board

```bash
agsc import --from board --format jira ../from-jira --dry-run
agsc import --from board --format jira ../from-jira
sed -n 1,12p content/concepts/write-the-faq.md
```

```text
import: 3 written, 0 replaced, 0 unchanged
import: boards_new: 1
import: items: 3
---
type: concept
title: Write the FAQ
status: draft
clusters:
  - website
prov:
  origin: imported
  operator: human:demo
kind: task
task_state: TASK_STATE_WORKING
x-board-assignee: sam
```

Three items came in: two tasks and the board, which is a cluster named `Website`. The Jira word `In Progress` became the state `TASK_STATE_WORKING`; the word itself, the assignee, the due date and the Jira key are kept in `x-board-*` keys. Everything arrives as a draft.

## 2. Publish the board and read it

Review the drafts, then set their status. The board and its tasks must all be published:

```bash
sed -i 's/^status: draft$/status: stable/' content/clusters/website.md content/concepts/*.md
git add -A && git commit -qm 'the board'
agsc build | grep -v '^skipped\|^warn'
node -e 'const b = require("./www/boards/website.json"); for (const t of b.tasks) console.log(t.slug, t.state, t.claimed_by || "(unclaimed)");'
```

```text
wrote: 65 files under www/
build: pass (0 error, 4 warn)
check-the-links TASK_STATE_SUBMITTED (unclaimed)
write-the-faq TASK_STATE_WORKING (unclaimed)
```

The assignee `sam` is not a claim: who holds a task comes from the history of the node ([Mode 5](/docs/guides/mode-5/)).

## 3. Export the board for another tool

```bash
agsc export --to board --format trello
node -e 'const b = JSON.parse(require("fs").readFileSync("dist/export/board/trello/website.json", "utf8")); const lists = new Map(b.lists.map((l) => [l.id, l.name])); for (const c of b.cards) console.log(lists.get(c.idList) + ": " + c.name);'
```

```text
export: pass (0 error, 0 warn)
To Do: Check the links
In Progress: Write the FAQ
```

The tool sees lists named after the states. Each card also carries a comment line with the whole item, which the tool ignores and a return import reads.

## 4. Check that every format reads its own file

Write the board in all eleven formats, then dry-run each one into a second, empty node. `own: 2` means the node recognised its own two tasks:

```bash
mkdir ../check-node && git -C ../check-node init -q -b main && (cd ../check-node && agsc init > /dev/null)
for f in agsc-board asana github gitlab jira linear markdown notion obsidian-kanban todotxt trello; do agsc export --to board --format $f > /dev/null 2>&1; (cd ../check-node && agsc import --from board --format $f ../my-node/dist/export/board/$f --dry-run 2>&1 | grep "^import: own"); done | sort | uniq -c
```

```text
     11 import: own: 2
```

## Check that it worked

`www/boards/website.json` lists both tasks, and `dist/export/board/trello/website.json` exists.

## What this does not do

- It does not talk to any tracker: you move the files, in and out.
- It does not publish an import: every foreign task is a draft until you change its status.
- It does not keep every field: each tool loses some on the way out (Route 7 of CONNECTORS.md has the table).

## Where to go next

- [Mode 5](/docs/guides/mode-5/): agent lanes that claim and finish tasks.

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/task-boards.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/task-boards.run.sh). More recipes: [the list](/docs/recipes/).
