---
title: "How it works"
summary: "Files go in, every surface comes out, and nothing is published until a deterministic build has proved itself twice: this page walks through the build, the proposal lifecycle, discovery, import and export, and the safety rules."
description: "How AgenticSystemCore works: the build pipeline, the proposal lifecycle, discovery, import and export, determinism, federation and agent safety."
---

## The build

A build is a function of four inputs and nothing else: the content tree, the configuration file, the build instant and, for the ledger head only, the git history (AGSC-04-01, AGSC-04-18). It discovers the files, parses their headers, validates them against the schema, resolves the fourteen link keys and computes their inverses, emits the graph, the search index, the pages, the discovery document and the NOW page, and then builds a second time and compares the bytes (AGSC-04-02). A difference fails the build. Budgets are enforced on the way: at most 100 KB per page, a bounded search index, no external request from any page (AGSC-06-21, AGSC-06-05).

{{diagram:build-pipeline}}

## The proposal lifecycle

Nobody writes to the published branch directly, agents included. A change starts as an edit with a provenance record: who or what made it and who is accountable for it (AGSC-08-01). The `propose` verb writes a local patch and a pull-request body and prints the commands a person runs; it performs no network write (AGSC-08-04). The pull request carries a sign-off trailer (AGSC-08-06). CI runs the lint gates with no model call on any gating lane (AGSC-08-27). A person reviews, records the review as a `verified` entry (AGSC-08-03) and merges. The merge rebuilds and deploys the site, and the ledger, a hash chain derived from git history, gains an entry whose head is pinned in the discovery document (AGSC-08-20, AGSC-08-24).

{{diagram:proposal-lifecycle}}

## The agent lane, when a model drives

A node may declare agents (AGSC-01-36): each with a model, a budget, the tasks it may perform and the item types it may touch. Every value that is a secret or host-specific — a key, an agent's switch or budget — can be set in a `.env` file in the Bundle root that is never committed (AGSC-01-37). The node has one cap on model spend of every kind, ten dollars a month unless changed, and the enabled agents' budgets may not add up to more (AGSC-01-38); each lane creates at most `max_new_items` items per proposal and holds at most `max_claims` tasks at once (AGSC-E511). An agent lane runs as the refresh verb or as a client of the tool server, reads the published surfaces, and opens proposals that carry its provenance and an episode with its cost; it can never write to the branch, never touch a procedure, a gate or the configuration, and stops for the month at its budget (AGSC-08-28). `refresh --agent <name> --dry-run` shows the proposal it would open without opening it. With an automatic channel it makes the node self-driving under the standing ratification and every guard of the automatic lane (AGSC-08-29); the build stays deterministic and model-free (AGSC-08-30). Drafted for rc.4.

## Discovery

Every page carries a `describedby` link to `/.well-known/knowledge-linkset`, and the root route sends the same link as a header (AGSC-06-25, AGSC-11-05). That document is an RFC 9264 link set: one context anchored at the Bundle, whose relations point at the graph, llms.txt, the licence page, the documentation, the ontology and its JSON-LD context, the declared surfaces and the peers (AGSC-06-08 to AGSC-06-10). At Level 2 and above every artefact link carries a SHA-256 digest, so a reader can check that what it fetched is what was published (AGSC-06-08). The profile URI, resolved through w3id.org, leads to the [profile page](/specs/agentic-knowledge/) that explains the document.

{{diagram:discovery-flow}}

## Import and export

Bare Markdown without headers is adopted in place: minimal headers are inserted, bodies stay byte for byte, and the result passes the build (AGSC-02-93, AGSC-02-94). Foreign Open Knowledge Format bundles are accepted with unknown types and keys tolerated (AGSC-01-22). Skill files map to Procedures (PRD-034). On the way out, Markdown and OKF exports are lossless and open as a plain folder in any editor or vault tool (AGSC-01-26); JSON-LD export is byte-identical to the published graph; steer files, skill packs, llms.txt, the chunk export and Harnesses are derived surfaces. Every export that carries prose carries the Content Use Terms with it (AGSC-01-29).

{{diagram:import-export}}

## Why determinism matters

Two conforming tools on two machines produce identical machine artefacts (AGSC-04-24). That is what makes a digest in the discovery document a real integrity check, lets two nodes compare notes, lets a reader rebuild a site from its source and verify that nothing changed, and lets any language reimplement the format from the specification and its vectors alone (PRD-055). The rules that make it true are in [canonicalization](/specs/04-canonicalization/): canonical JSON, NFC before sorting, fixed sort orders, one instant format, SHA-256.

## Federation without servers

Nodes never call nodes. A node declares its peers; an agent, a validator or a browser does the walking, and the walk is bounded: HTTPS only, every private, loopback, link-local and special-purpose address refused in both address families, redirects re-checked hop by hop, a hop limit of three, a fan-out cap and a request budget (AGSC-11-06 to AGSC-11-10). Everything that comes from a peer is marked untrusted with its origin (AGSC-11-11). The mutual-conformance check accepts two local files, so it runs offline (AGSC-10-12).

## Safety

Content that agents consume is data, never instruction. Four lints run on every build: an injection scan over bodies, headers at any depth, attachment text and every exported prose surface; a secrets check; a personal-data check; and a clean-room check (AGSC-08-13 to AGSC-08-17). Every text handed to a model is marked untrusted (AGSC-08-18). Tools take identifiers, never paths, URLs or shell strings. Skill packs are inert. And the specification states its own limit: these lints prove neither safety nor the absence of novel injection; hashes and attestations prove only that an artefact is what was published (AGSC-08-19).
