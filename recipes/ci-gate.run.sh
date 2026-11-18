#!/usr/bin/env bash
# Repeats every command of the page "Recipe: stop a broken change before it is merged".
# Usage: ci-gate.run.sh <folder that holds node_modules with agentic-system-core@1.1.0>
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export GIT_AUTHOR_NAME=you GIT_AUTHOR_EMAIL=you@example.org GIT_COMMITTER_NAME=you GIT_COMMITTER_EMAIL=you@example.org
export GIT_AUTHOR_DATE=2026-11-18T09:00:00Z GIT_COMMITTER_DATE=2026-11-18T09:00:00Z
cd "$(mktemp -d)"
PS4='$ '
set -x

# 1. A node that passes
mkdir my-notes && cd my-notes
printf '# Sourdough starter\n\nFlour and water, fed once a day. How runny it is depends on its [hydration](%s).\n' hydration.md > sourdough.md
printf '# Hydration\n\nThe weight of the water divided by the weight of the flour.\n' > hydration.md
agsc init --quiet
mkdir -p .well-known && printf 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'my notes'
agsc ci --quiet 2>/dev/null
node -e 'const g = JSON.parse(require("fs").readFileSync("dist/gate.json")); console.log(g.gate, g.level, g.status); console.log(g.checks.map((c) => c.name + ":" + c.status).join(" "))'

# 2. Break a link
sed -i 's/(hydration.md)/(hydratoin.md)/' content/concepts/sourdough.md
agsc ci --quiet > ci.out 2>&1 || echo "ci exited $?"
grep -E '^(ci:|error:)' ci.out
node -e 'const g = JSON.parse(require("fs").readFileSync("dist/gate.json")); console.log(g.gate, g.level, g.status); console.log(g.checks.map((c) => c.name + ":" + c.status).join(" "))'

# 3. The same check in GitHub Actions
mkdir -p .github/workflows
cat > .github/workflows/agsc.yml <<'YAML'
name: agsc
on:
  push:
  pull_request:
permissions:
  contents: read
jobs:
  agsc:
    name: agsc ci
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
      - uses: andreibesleaga/agentic-system-core@v1.1.0
YAML
curl -s -o /dev/null -w '%{http_code}\n' -L https://raw.githubusercontent.com/andreibesleaga/agentic-system-core/v1.1.0/action.yml

# 4. A hook that runs agsc lint before every commit
printf '#!/bin/sh\nexec agsc lint --quiet\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
git add -A
git commit -m 'break a link' > commit.out 2>&1 || echo "commit refused, exit $?"
grep -E '^(lint:|error:)' commit.out
git log --oneline | wc -l
sed -i 's/(hydratoin.md)/(hydration.md)/' content/concepts/sourdough.md
git add -A
git commit -q -m 'fix the link'
git log --oneline | wc -l

# script-only checks (not on the page)
set +x
code=0; git commit --allow-empty -q -m x >/dev/null 2>&1 || code=$?; test "$code" -eq 0
sed -i 's/(hydration.md)/(hydratoin.md)/' content/concepts/sourdough.md; git add -A
code=0; git commit -q -m y >/dev/null 2>&1 || code=$?; test "$code" -ne 0 && echo "checked: the hook refuses a commit with a broken link"
node -e 'require(require("path").join(process.argv[1], "node_modules/yaml")).parse(require("fs").readFileSync(".github/workflows/agsc.yml","utf8")); console.log("checked: the workflow file is valid YAML")' "$HERE"
