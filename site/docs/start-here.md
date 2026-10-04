---
title: "Start here"
summary: "One path through this site and its sources for each kind of reader: someone curious, a developer, an implementer in another language, and an agent. Each step is one page, in order."
description: "Where to start with AgenticSystemCore: a reading path for the public reader, the developer, the implementer and the agent."
---

AgenticSystemCore has several doors. Find yourself below and follow that path; each step is one page, in the order given. Every page explains; the [specification](/specs/) decides.

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
6. On any page of this site, the seven page tools, when your browser offers them; everything from here is marked untrusted, and `propose` returns text for a person to review.

## Where a node can live

A node is a set of files, so it can live wherever files can be served over HTTPS: a web host, a laptop, a small device, a clone of its repository, IPFS behind a gateway, or a web interface in front of a ledger that records each build. What the rules ask of the place is fixed — the discovery document and the routes, with the response headers the build wrote (AGSC-06-17) — and a *hosting profile*, one of the plugin kinds (AGSC-00-24), tells each kind of place how. No rule of version 1.x pins a transport other than HTTP. The [architecture](/docs/architecture/) describes the deployment; the source repository's `docs/CONNECTORS.md` lists every profile and what it cannot do.
