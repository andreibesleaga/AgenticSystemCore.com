---
title: "Recipe: stop a broken change before it is merged"
summary: "For anyone who keeps a node in a git repository and wants a check that fails a pull request with a broken link. You end up with the check run locally, in GitHub Actions and before each commit."
description: "Run agsc ci locally, read the gate verdict it writes, add the same check as a GitHub Actions job, and block a commit with a broken link using a hook."
---

**Who it is for:** a person or team with a node in a git repository on GitHub.

**What you get:** `agsc ci` run on your machine with a verdict file, the same check as a GitHub Actions job, and a hook that refuses a commit with a broken link.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell, and a GitHub repository for step 3.


## Before you start

Install the engine as in [the Mode 0 guide](/docs/guides/mode-0/), which also builds the two-note folder used here. The commands below make that folder again and start inside it.

## 1. Run the gate on a node that passes

`agsc ci` checks every note, builds the site twice, compares the bytes and verifies the result. It exits 0 on a pass and 1 on a finding.

```bash
mkdir my-notes && cd my-notes
printf '# Sourdough starter\n\nFlour and water, fed once a day. How runny it is depends on its [hydration](%s).\n' hydration.md > sourdough.md
printf '# Hydration\n\nThe weight of the water divided by the weight of the flour.\n' > hydration.md
agsc init --quiet
mkdir -p .well-known && printf 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'my notes'
agsc ci --quiet 2>/dev/null
node -e 'const g = JSON.parse(require("fs").readFileSync("dist/gate.json")); console.log(g.gate, g.level, g.status); console.log(g.checks.map((c) => c.name + ":" + c.status).join(" "))'
```

```text
ci: pass (0 error, 5 warn)
ci L1 pass
lint:pass build:pass verify:pass forge:pass
```

The verdict is the file `dist/gate.json`. It names the gate (`ci`), its level, the overall status and one status for each check. Warnings do not fail the gate. Your own `type: gate` item, as in [the Mode 2 guide](/docs/guides/mode-2/), sets a stricter level.

## 2. Break a link and watch it fail

Change the link in `sourdough.md` so that it points at a note that does not exist, then run the gate again:

```bash
sed -i 's/(hydration.md)/(hydratoin.md)/' content/concepts/sourdough.md
agsc ci --quiet > ci.out 2>&1 || echo "ci exited $?"
grep -E '^(ci:|error:)' ci.out
node -e 'const g = JSON.parse(require("fs").readFileSync("dist/gate.json")); console.log(g.gate, g.level, g.status); console.log(g.checks.map((c) => c.name + ":" + c.status).join(" "))'
```

```text
ci exited 1
ci: fail (1 error, 5 warn)
error: AGSC-E310 body reference "hydratoin.md" resolves to nothing inside the Bundle (AGSC-03-11) — content/concepts/sourdough.md:14
ci L1 fail
lint:fail build:fail verify:pass forge:pass
```

The error line names the rule, the bad link, the file and the line. `dist/gate.json` now says `fail`, and the lint and build checks are the ones that failed.

## 3. Run the same check on every pull request

Add one workflow file. The engine ships a composite action that runs `agsc ci` with the engine at the ref you name, so the ref pins the engine version. Pin it to the tag `v1.1.0` or to that tag's full commit SHA:

```bash
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
```

`fetch-depth: 0` fetches the full history, which the ledger and the content version read. The job needs `contents: read` and nothing else. This recipe does not run the workflow on GitHub; the same `agsc ci` ran in step 2. To make the check required, import the ruleset that a gate item writes to `dist/forge/ruleset.json`: it requires the status `agsc ci`, which is why the job has that name. Steps are in [the Mode 2 guide](/docs/guides/mode-2/#2-the-gate-compiled-for-a-forge) and in [GitHub's page on rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).

## 4. Refuse a bad commit on your own machine

The engine documents a hook for the [pre-commit](https://pre-commit.com/) tool that runs `agsc lint` when a note or `agsc.config.json` changes. Its configuration is in [the engine's README](https://github.com/andreibesleaga/agentic-system-core#connecting-agents-and-repositories); this recipe does not run it, because the tool fetches the hook from GitHub. A plain git hook does the same job with nothing more to install:

```bash
printf '#!/bin/sh\nexec agsc lint --quiet\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
git add -A
git commit -m 'break a link' > commit.out 2>&1 || echo "commit refused, exit $?"
grep -E '^(lint:|error:)' commit.out
```

```text
commit refused, exit 1
lint: fail (1 error, 5 warn)
error: AGSC-E310 body reference "hydratoin.md" resolves to nothing inside the Bundle (AGSC-03-11) — content/concepts/sourdough.md:14
```

Git stops the commit. Fix the link and commit again, and `lint: pass (0 error, 5 warn)` lets it through. The hook lives in `.git/hooks`, so it is not shared by `git clone`; the GitHub job in step 3 is the check everyone gets.

## Check that it worked

Step 2 exited 1 and `dist/gate.json` said `fail`. Step 4 left your history with one commit, not two.

## What this does not do

- The gate checks the files of the node. It does not check that the words are right or that a link to another site answers.
- The workflow file is not run by this recipe; read GitHub's own page on workflows for its side.
- The hook runs `lint` alone: it does not build the site twice. That is the job of `ci`.

## Where to go next

- [Publish the node and check it live](/docs/guides/publish/).
- [Mode 2: a gate as an item of your own](/docs/guides/mode-2/).
- [When a check says no](/docs/guides/troubleshooting/).
- [What a security reviewer can check](/docs/recipe-security-review/).

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/ci-gate.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/ci-gate.run.sh). More recipes: [the list](/docs/recipes/).
