---
title: "Demos"
summary: "Every mode and every persona as a small demo you can run in under five minutes from an empty folder: the exact commands, the lines they print, and the one thing each proves. Every command is run by a test in the engine repository, so this page cannot drift from the engine."
description: "Runnable demos of AgenticSystemCore: the six modes and the thirteen personas, each with the exact commands, the printed lines and what it proves, kept true by a test."
---

Reading about six modes is one thing; seeing each one do something is another. The engine repository carries one page of demos, [docs/DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md), and a test, `tests/docs/demos.test.js`, that runs every command on that page in a scratch folder and compares what was printed with what the page says. This page is the short form: what each demo does, the commands, and the lines to look for. The full page has every step and every expected line.

## Before you start

Node.js 22.13 or later, `git` and a POSIX shell. Everything runs offline; no account, no key.

```bash
mkdir agsc-demos && cd agsc-demos
npm install agentic-system-core          # or, from a clone: npm install /path/to/agentic-system-core
export PATH="$PWD/node_modules/.bin:$PATH"
export ENGINE="$PWD/node_modules/agentic-system-core"
export SOURCE_DATE_EPOCH=1789380000      # 2026-09-14T10:00:00Z, the build instant of every line below
```

`ENGINE` is where the demo files live (`examples/demos/`, one small folder per mode, derived from the engine's own minimal fixture) and where the checkers are. The fixed build instant is what makes the printed timestamps reproducible; nothing else depends on it.

## Mode 0 — the self-correcting wiki

**What it proves.** Plain notes become a checked, linked, agent-readable site with no model; a broken link stops publication; a person's edit becomes a proposal a person merges; the review lane reaches no model.

```bash
cp -r "$ENGINE/examples/demos/mode-0-wiki" . && cd mode-0-wiki/notes
agsc init                                          # adopts the notes, writes the configuration
mkdir -p .well-known && cp ../security.txt .well-known/security.txt
cp ../boiling-point.md content/concepts/boiling-point.md
printf 'Salt it like [pasta water](%s).\n' salting.md >> content/concepts/brewing.md
agsc lint                                          # error: AGSC-E310 … resolves to nothing … brewing.md:4
agsc build                                         # error: AGSC-E901 … emits no route for it; nothing under www/
grep -v salting content/concepts/brewing.md > brewing.tmp && mv brewing.tmp content/concepts/brewing.md
agsc build                                         # build: pass — www/ holds the site, graph.jsonld, llms.txt, search.json, the discovery document
grep -A2 '## Stale items' www/now.md               # - boiling-point
git init -q -b main && git add -A && git commit -q -m 'adopted notes'
printf '\nCoarser for a French press.\n' >> content/concepts/grind-size.md
agsc lint --fix && agsc propose grind-size         # writes dist/proposal/1.patch and prints the git commands, runs none
agsc review                                        # lane: review is lint-only — no model call is reachable from it
agsc ci && agsc verify --ledger                    # ci: pass … verify: pass
```

Personas: the drop-in user, the human reader, the human contributor, the maintainer.

## An agent on the same wiki

**What it proves.** An assistant gets seven tools over a Bundle — `search`, `read`, `links`, `compose`, `ask`, `propose`, `remember` — with nothing leaving the machine; every answer is marked `untrusted` and carries its licence; `propose` and `remember` hand back text and write nothing; the same seven tools on a published page give the same answers.

Two small scripts stand in for an assistant: `mcp-call.js` starts `agsc mcp` and sends the three JSON-RPC lines every Model Context Protocol client sends first; `page-tools.js` loads the three scripts an item page loads and calls a tool the way the page does.

```bash
cp -r "$ENGINE/examples/demos/mode-1-memory/a" wiki && cd wiki && agsc build
node "$ENGINE/examples/demos/agents/mcp-call.js" search '{"query":"handoff"}'
node "$ENGINE/examples/demos/agents/mcp-call.js" ask '{"question":"how does a handoff work"}' > ask.json
node "$ENGINE/examples/demos/agents/mcp-call.js" ask '{"question":"quantum chromodynamics"}'   # "body": "no answer in this memory"
node "$ENGINE/examples/demos/agents/page-tools.js" www ask '{"question":"how does a handoff work"}' > page-ask.json
cmp ask.json page-ask.json && echo "the page tools and the tool server gave the same answer"
```

The `search` answer, as printed:

```text
{
  "body": {
    "hits": [
      { "iri": "https://a.example/concepts/handoff/", "score": 1, "slug": "handoff", "title": "Handoff" },
      { "iri": "https://a.example/concepts/supervisor/", "score": 1, "slug": "supervisor", "title": "Supervisor" }
    ]
  },
  "license": "LicenseRef-AgenticSystemCore-Content-Use-1.0",
  "source": "search",
  "trust": "untrusted",
  "type": "items"
}
```

In a browser whose assistant supports in-page tools, every item page and the `/compose/` page register the same seven tools through `document.modelContext`; nothing is installed and no server runs. Connecting a real assistant is four lines of configuration per assistant, in the engine's [assistant guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USING-WITH-ASSISTANTS.md). Personas: the agent reader, the agent proposer, the agent using a node as memory.

## Mode 1 — distributed memory

**What it proves.** Two nodes that name each other pass the mutual check with no server between them; a one-sided claim fails; every link in a discovery document carries a digest; the memory exports and re-imports without loss; a node written without the engine passes the shipped checker.

```bash
cp -r "$ENGINE/examples/demos/mode-1-memory" . && cd mode-1-memory && cp "$ENGINE/LICENSE-CONTENT" b/
for n in a b c; do (cd $n && git init -q -b main && git add -A && git commit -q -m "node $n" && agsc build); done
node "$ENGINE/tools/validate-wellknown" a/www/.well-known/knowledge-linkset --level 2 --peer b/www/.well-known/knowledge-linkset
#   validate-wellknown pass (level 2): 22 input file(s) read, 0 error(s), 0 warning(s)
node "$ENGINE/tools/validate-wellknown" a/www/.well-known/knowledge-linkset --level 2 --peer c/www/.well-known/knowledge-linkset
#   error AGSC-E907 resolved, not mutual: no rel#peer names https://c.example/.well-known/knowledge-linkset
(cd b && agsc export --markdown && agsc export --okf && agsc export --jsonld && agsc export --to llm-context)
mkdir fresh && cd fresh && agsc init && agsc import ../b/dist/export/okf --from okf   # import: 3 written, 0 replaced, 0 unchanged
agsc import ../b/dist/export/okf --from okf                                         # import: 0 written, 0 replaced, 3 unchanged
cd .. && node "$ENGINE/tools/validate-wellknown" level-0/.well-known/knowledge-linkset --level 0   # pass (level 0)
```

Personas: the standards implementer, the port implementer, the agent using a node as memory.

## Mode 2 — live specifications

**What it proves.** A project's decisions, specifications, tasks and gates are ordinary items; a gate compiles into forge files whose one required check is a check a CI job really reports; the steering files an assistant reads are the same bytes for every assistant; a person reading the pages sees a task's state, a gate's checks and a decision's typed links.

```bash
cp -r "$ENGINE/examples/demos/mode-2-project" . && cd mode-2-project
agsc ci                                            # ci: pass; dist/gate.json, dist/forge/ruleset.json, dist/forge/status-checks.json
cat dist/forge/status-checks.json                  # ["links","review","schema"]
agsc export --steer                                # export --steer: 2 targets (agents, claude), identical bytes at each path
agsc build
grep -o '<dt>Task state</dt><dd><code>[A-Z_]*</code></dd>' www/concepts/task-login-tests/index.html   # TASK_STATE_WORKING
```

Persona: the project team.

## Mode 3 — the evolving skills library

**What it proves.** Procedures become skill packs, one per cluster, with a lockfile of digests; a pack installs with one command, a second run changes nothing, an update shows its diff, and a pack that no longer matches its lockfile installs nothing; a pack of this format imports back into its procedures, and a foreign skill comes in as a procedure in the cluster you name.

```bash
cp -r "$ENGINE/examples/demos/mode-3-skills" . && cd mode-3-skills
agsc skills                                        # skills: 2 packs under dist/skills/
agsc skills install .claude/skills                 # skills install: 2 written, 0 unchanged
agsc skills install .claude/skills                 # skills install: 0 written, 2 unchanged
printf '\nInjected.\n' >> dist/skills/login/SKILL.md
agsc skills install .agents/skills                 # error: AGSC-E413 … nothing was installed
cd .. && cp -r "$ENGINE/examples/demos/mode-1-memory/a" other && cd other
agsc import "$ENGINE/examples/demos/mode-3-skills/foreign" --from skills --cluster agent-patterns   # import: 1 written
```

Persona: the integrator.

## Mode 4 — runnable knowledge

**What it proves.** A selection of items becomes a Harness — the seven file kinds and an archive — and the tool server gives the same verdict for the same selection; the runtime renderings the specification names are not shipped, and the engine says so; `run --dry-run` lists a procedure's steps and refuses a program outside the allow list; `run` refuses to execute without an isolating runner; a traced run becomes an Episode whose spend the NOW page counts.

```bash
cp -r "$ENGINE/examples/demos/mode-4-compose" . && cd mode-4-compose
git init -q -b main && git add -A && git commit -q -m 'runnable knowledge'
agsc compose handoff run-the-tests task-login-form --zip   # dist/harness/<name>/ with AGENTS.md, arc42.md, decisions/, diagram.mmd, harness.jsonld, skills/, workspace.dsl, and the archive
agsc compose handoff --emit crewai                          # error: AGSC-E001 … named by AGSC-07-18 but is not implemented at this milestone
agsc run greet --dry-run                                    # run: step 1: echo hello … nothing executed
agsc run fetch --dry-run                                    # [REFUSED: not in run.allow[]]
agsc run greet                                              # error: AGSC-E001 run executed nothing … does not declare network isolation
agsc trace run1.json && agsc build && grep -A4 '## Monthly spend' www/now.md   # spent: 0.25 USD, cap: 1 USD
```

A person on the built node's `/compose/` page ticks the same items and downloads the archive; its bytes equal the one `compose --zip` wrote. That needs a browser, so the engine's browser test lane proves it. Persona: the architect.

## Mode 5 — the live board

**What it proves.** A cluster of tasks is a board published as JSON; an agent lane claims a task by proposing its working state through the tool server, which returns a patch and writes nothing; once a person applies and commits that patch, the build derives who holds the task from the commit; from then on every other claim of that task is refused — for a stranger, on the page as on the tool server — and the lane's work-in-progress limit refuses its second claim; a dry run of the lane proposes the Episode of the run, which the NOW page counts.

```bash
cp -r "$ENGINE/examples/demos/mode-5-board" . && cd mode-5-board
git init -q -b main && git add -A && git commit -q -m 'the board' && agsc build
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"agent":"worker","at":"2026-09-14","slug":"task-login-form","task_state":"TASK_STATE_WORKING"}' > claim.json
node -e 'process.stdout.write(require("./claim.json").body.patch);' > claim.patch
git apply claim.patch && git add content && git commit -q -m 'claim task-login-form' -m 'Channel-Auto: worker'
agsc build && grep -o 'claimed by <span>[^<]*</span>' www/boards/login/index.html    # claimed by <span>process:worker</span>
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"agent":"someone-else","at":"2026-09-14","slug":"task-login-form","task_state":"TASK_STATE_WORKING"}'
#   "code": "AGSC-E511" — the task is already TASK_STATE_WORKING under process:worker; the first merged claim wins
agsc refresh --agent worker --dry-run                # writes dist/proposal/1.patch with the run's Episode; prints the commands, runs none
```

Personas: the self-driving team, the agent proposer.

## What needs something you may not have

- **A browser with an assistant** — the in-page tools and the `/compose/` download. The page-tools script runs the page's own code without a browser; the engine's browser test lane runs a real Chromium.
- **A forge** — the pull request, the required check, automatic merging. `propose` prints the commands, `ci` writes the enforcement files, the shipped action runs `agsc ci`; opening and merging is the forge's.
- **A model key** — an agent lane that writes pages. The engine ships no model adapter; `refresh --agent <name> --dry-run` runs the lane's gates and budget and proposes the Episode, without a model call.
- **An isolating runner** — `agsc run` executing a step. None ships; `run --dry-run` resolves the steps and `run` refuses with the reason.

## How the page stays true

The engine's test reads the full demos page, runs every marked command block in order in a fresh scratch folder with the fixed build instant and an empty git identity, and asserts that every line the page says to expect was printed, exactly. When the engine changes what it prints, that test fails and the page is corrected — never the other way round. The [scenarios](/docs/scenarios/) are the same behaviour written as Given/When/Then; the [six modes](/docs/modes/) explain what each mode is for.
