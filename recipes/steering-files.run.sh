#!/usr/bin/env bash
# Repeats every command of steering-files.md. Usage: steering-files.run.sh <folder holding node_modules>
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export GIT_AUTHOR_DATE="2026-11-18T10:00:00Z" GIT_COMMITTER_DATE="2026-11-18T10:00:00Z"   # fixed commit time: the same bytes on every run
WORK="$(mktemp -d)"; cd "$WORK"
export PS4='+ '
set -x

# 1. a small project
mkdir -p my-project/content/concepts my-project/content/lessons my-project/content/procedures && cd my-project
cat > content/concepts/decide-the-login.md <<'ITEM'
---
type: concept
title: Decide the login
description: Build a plain password form first; add single sign-on later.
prov:
  origin: human
  operator: human:you
kind: decision
---

Build a plain password form first; single sign-on comes later.
ITEM
cat > content/lessons/never-log-passwords.md <<'ITEM'
---
type: lesson
title: Never log passwords
description: A debug line once wrote a password to the log.
date: "2026-11-01"
severity: warn
prov:
  origin: human
  operator: human:you
---

## What happened

A debug line printed the whole login request, password included.

## Lesson

Log the user name and the outcome, never the password.
ITEM
cat > content/procedures/run-the-tests.md <<'ITEM'
---
type: procedure
title: Run the tests
description: Run the project's tests before every change.
prov:
  origin: human
  operator: human:you
when: A change is ready to be proposed
---

## Steps

1. Run `npm test`.
2. Fix every failure.
ITEM
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'the login project'

# 2. write the default files
agsc export --steer
ls dist/export/steer
cmp dist/export/steer/AGENTS.md dist/export/steer/CLAUDE.md && echo "AGENTS.md and CLAUDE.md are the same bytes"

# 3. pick the targets, copy the files in
agsc export --steer --target agents,claude,cursor,copilot,gemini
cp -r dist/export/steer/. .
git add -A && git commit -q -m 'steering files'
find . -path ./dist -prune -o -path ./.git -prune -o \( -name AGENTS.md -o -name CLAUDE.md -o -name GEMINI.md -o -name '*.mdc' -o -name copilot-instructions.md \) -print | sort
agsc export --steer --target nope || echo "exit code $?"

# 4. look inside
sed -n '/^## Lessons/,/^## Procedures/p' AGENTS.md

# 5. keep it current: compare, ignoring the lines a commit changes
agsc export --steer --target agents,claude,cursor,copilot,gemini > /dev/null
strip() { grep -v -e '^bundle_version:' -e '^generated_at:' -e '^- last build:' "$1"; }
for f in AGENTS.md CLAUDE.md GEMINI.md .cursor/rules/agsc.mdc .github/copilot-instructions.md; do
  diff <(strip "dist/export/steer/$f") <(strip "$f") > /dev/null && echo "current: $f"
done
sed -i 's/never the password\./never the password or the session token./' content/lessons/never-log-passwords.md
git commit -qam 'lesson: session token'
agsc export --steer --target agents,claude,cursor,copilot,gemini > /dev/null
diff <(strip dist/export/steer/AGENTS.md) <(strip AGENTS.md) || echo "AGENTS.md is out of date (diff exit code $?)"
cp -r dist/export/steer/. .
diff <(strip dist/export/steer/AGENTS.md) <(strip AGENTS.md) && echo "current: AGENTS.md"
set +x
echo "steering-files: all steps ran"
