#!/usr/bin/env bash
# Repeats every command of the page "Recipe: move a task board into a node and back out".
# The commands below are the page's command blocks, in order.
# Usage: task-boards.run.sh <folder that holds node_modules>
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export PS4='$ '
WORK="$(mktemp -d)"
cd "$WORK"
set -x

mkdir from-jira
printf 'Issue key,Summary,Status,Assignee,Project name,Description,Labels,Due date\nWEB-1,Write the FAQ,In Progress,sam,Website,Answer the ten questions people ask most.,docs,2026-12-01\nWEB-2,Check the links,To Do,,Website,Check every link once the FAQ is written.,docs,\n' > from-jira/website.csv
mkdir my-node && cd my-node && git init -q -b main
git config user.name Demo && git config user.email demo@example.org
agsc init
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" . && git add -A && git commit -qm 'empty node'

node -e 'const { FORMATS } = require(process.env.ENGINE + "/src/interchange/board-formats.js"); for (const [name, f] of Object.entries(FORMATS)) console.log(name.padEnd(16), f.ext.padEnd(6), "in:" + (typeof f.parse === "function" ? "yes" : "no"), "out:" + (typeof f.write === "function" ? "yes" : "no"));'

agsc import --from board --format jira ../from-jira --dry-run
agsc import --from board --format jira ../from-jira
sed -n 1,12p content/concepts/write-the-faq.md

sed -i 's/^status: draft$/status: stable/' content/clusters/website.md content/concepts/*.md
git add -A && git commit -qm 'the board'
agsc build | grep -v '^skipped\|^warn'
node -e 'const b = require("./www/boards/website.json"); for (const t of b.tasks) console.log(t.slug, t.state, t.claimed_by || "(unclaimed)");'

agsc export --to board --format trello
node -e 'const b = JSON.parse(require("fs").readFileSync("dist/export/board/trello/website.json", "utf8")); const lists = new Map(b.lists.map((l) => [l.id, l.name])); for (const c of b.cards) console.log(lists.get(c.idList) + ": " + c.name);'

mkdir ../check-node && git -C ../check-node init -q -b main && (cd ../check-node && agsc init > /dev/null)
for f in agsc-board asana github gitlab jira linear markdown notion obsidian-kanban todotxt trello; do agsc export --to board --format $f > /dev/null 2>&1; (cd ../check-node && agsc import --from board --format $f ../my-node/dist/export/board/$f --dry-run 2>&1 | grep "^import: own"); done | sort | uniq -c
