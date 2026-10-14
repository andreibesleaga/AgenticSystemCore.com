---
title: "Start here"
summary: "One path through this site and its sources for each kind of reader: someone with a folder of notes, a team, someone deciding whether to depend on it, a security reviewer, a researcher, a publisher whose content is gated, someone curious, a developer, an implementer in another language, and an agent. Each step is one page, in order."
description: "Where to start with AgenticSystemCore: a reading path for the public reader, the developer, the implementer and the agent."
---

AgenticSystemCore has several doors. Find yourself below and follow that path; each step is one page, in the order given. Every page explains; the [specification](/specs/) decides.

## If you have a folder of notes

1. The [demos](/docs/demos/): install the package and run Mode 0 on a few notes in five minutes; every command is shown with the lines it prints.
2. The [Mode 0 guide](/docs/guides/mode-0/): on your own notes, `agsc init` in the folder, a security contact file, one commit, then `agsc ci` and `agsc build`, with the lines each prints; the [other guides](/docs/guides/) do the same for each mode.
3. The [six modes](/docs/modes/): what else the same folder can become once it is a checked site.

## If your team works with coding assistants

1. The [Mode 2 guide](/docs/guides/mode-2/): decisions, specifications, tasks and a gate as checked files, a board, and one steering file for every assistant.
2. The [Mode 3](/docs/guides/mode-3/) and [Mode 5](/docs/guides/mode-5/) guides: the team's procedures as skills, and a board that agents and people share.

## If your team keeps its procedures as skills

1. The [Mode 3 guide](/docs/guides/mode-3/): each procedure as an installable skill pack, checked against a lockfile and holding no scripts; skills collections and rule folders imported as procedures, and the packs exported back.
2. This site's own [skill packs](/skills/): one pack per cluster, holding the cluster's published items.

## If your team works on a live board

1. The [Mode 5 guide](/docs/guides/mode-5/): tasks as checked files and a board for every cluster that holds tasks; claims and moves are proposals through the local tool server, and a person merges them.
2. This site's own [project board](/boards/project-board/), and [Mode 5](/docs/modes/#mode-5-the-live-board-self-driving-product-and-project-management): how people and agents pull work through a board until it is done.

## If you review its security

1. [Compliance and security](/docs/compliance/): what the security design proves and what it does not.
2. The source repository's `SECURITY.md` and `docs/SECURITY-CONSIDERATIONS.md`: a ledger re-derived from git history and checked offline with `agsc verify --ledger`, the security contact checked by `agsc ci`, untrusted prose fenced in every tool result, and a security corpus with its scores. The security reviewer's scenarios are in `features/persona-m-security-reviewer.feature`.
3. This node's own [ledger](/ledger.jsonl) and [security.txt](/.well-known/security.txt).

## If you measure or cite it

1. The source repository's `docs/BENCHMARKS.md` and `docs/MEASUREMENTS.md`: a benchmark kit that runs offline with no model and no key, and the numbers it gives.
2. The graph as [JSON-LD](/graph.jsonld), [Turtle](/graph.ttl) and [N-Quads](/graph.nq), which hold the same statements, and the [status page](/docs/status/) for the versions to cite.
3. The source repository's `CITATION.cff`; the researcher's scenarios are in `features/persona-n-researcher.feature`.

## If your content is gated

1. The [boundary section](/specs/11-boundary/) of the specification, AGSC-11-20: a node can say in public that it exists while its content stays behind access control. The discovery document stays public, the facts about the content that a public node shows are left out, and the checker accepts their absence.
2. `"visibility": "restricted"` in `agsc.config.json`; the restricted publisher's scenarios are in the source repository's `features/persona-o-restricted.feature`.

## If you decide whether to depend on it

1. The [status page](/docs/status/): what is live and the state of every outside step.
2. The source repository's `GOVERNANCE.md` ("Who stands behind this": one maintainer, open licences, no support promise and no schedule) and `SECURITY.md`.
3. A live node to look at: [patterns.agenticsystemcore.com](https://patterns.agenticsystemcore.com/).

## If you are curious

1. The [introduction](/docs/introduction/): what this is, what is new about it, who it is for.
2. The [six modes](/docs/modes/): six ways of using one folder of files, and [how to use it](/docs/how-to-use/): the first commands for each.
3. [How it works](/docs/how-it-works/): the build, proposals, discovery, import and export, safety.
4. The [vocabulary](/concepts/): the terms, each one a page of this site.

## If you are a developer

1. [How to use it](/docs/how-to-use/), then [how it works](/docs/how-it-works/), then the [architecture](/docs/architecture/): the contexts, the ports and the deployment.
2. The source repository's `docs/START-HERE.md`, `docs/CODE-ORIENTATION.md` and `docs/TESTING.md`: a guided walk through the code and the tests. The repository is linked from every page's "Propose an edit" link.
3. The [requirements](/docs/requirements/) and the [scenarios](/docs/scenarios/): what the engine must do, and the behaviour it is tested against.

## If you implement the standard in another language

1. [How to read the specification](/docs/reading-the-specification/): rule identifiers, key words, the bracketed references, Levels.
2. The [specification](/specs/), starting with the [overview](/specs/00-overview/) and the [implementation profiles](/specs/10-implementation-profiles/).
3. [Publish a Level-0 node](/procedures/publish-a-level-0-node/): the smallest conforming node, from any CMS or wiki export, with no engine.
4. The source repository's `docs/IMPLEMENTERS-GUIDE.md` and `tests/vectors/`: the byte-level pitfalls, a mapping for common platforms, and the vectors your own runner reads.

## If you are an agent

1. The discovery document, [`/.well-known/knowledge-linkset`](/.well-known/knowledge-linkset): every machine file of this node with its digest.
2. [`/llms.txt`](/llms.txt) and [`/llms-full.txt`](/llms-full.txt): the site in text, with a provenance header.
3. [`/chunks.jsonl`](/chunks.jsonl), the graph dumps and the [ontology](/ns/): for retrieval and for joining with other nodes.
4. The [agent skill](/docs/agent-skill/): one file to load into a coding agent so it can use the engine in every mode.
5. [How to use it](/docs/how-to-use/), the section for agents: what to fetch, in which order, and how to propose a change.
6. On every item page and on `/compose/` of this site, the seven page tools, when your browser offers them; everything from here is marked untrusted, and `propose` returns text for a person to review.

## Where a node can live

A node is a set of files, so it can live wherever files can be served over HTTPS: a web host, a laptop, a small device, a clone of its repository, IPFS behind a gateway, or a web interface in front of a ledger that records each build. What the rules ask of the place is fixed — the discovery document and the routes, with the response headers the build wrote (AGSC-06-17) — and a *hosting profile*, one of the plugin kinds (AGSC-00-24), tells each kind of place how. No rule of version 1.x pins a transport other than HTTP. The [architecture](/docs/architecture/) describes the deployment; the source repository's `docs/CONNECTORS.md` lists every profile and what it cannot do.
