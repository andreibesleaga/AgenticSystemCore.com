---
title: "The six modes"
summary: "One folder of Markdown, one format, six ways of using it: an automatic wiki, a distributed memory for agents, live specifications for a software project, an evolving library of skills, knowledge that can be assembled into a running architecture, and a shared live board on which agents and people run a whole project until it is done."
description: "The six modes of AgenticSystemCore: auto-wiki (with an optional agent lane), distributed agentic memory, live specifications, evolutive skills, runnable knowledge and the live board, each with its mechanism and its requirements."
---

No mode adds a file type or a key. Each is a way of reading the same files, and one Bundle can be used in all six at once. The requirement identifiers (PRD-nnn) link to the [requirements page](/docs/requirements/).

## Mode 0 — the automatic, self-correcting wiki

**What you do.** Write Markdown. Run one command, or push to your repository. Get a website with a graph, a search index, an agent-facing text file and a discovery document. No language model is needed for any of it (PRD-012).

**What "self-correcting" means here.** Nothing in this mode guesses. `agsc ci` runs deterministic checks and refuses to publish what fails them: the header against the schema, every link to an existing target, no cycles where cycles are forbidden, no orphans left unreported (AGSC-03-07 to AGSC-03-10). Every item can carry an instant after which it is stale, and the build flags it against its own build instant (AGSC-02-06, AGSC-04-11). The NOW page of every build lists the stale items (AGSC-06-22); a scheduled refresh that re-checks external links and opens at most one issue is a requirement (PRD-044) that version 1.0 does not ship. What went wrong becomes a Lesson item, and the set of Lessons is the error log (PRD-016). Corrections, whether a person or an agent writes them, arrive as proposals that a person ratifies (AGSC-08-03).

{{diagram:mode-0-autowiki}}

**Optional: let a model drive it.** A node may declare an **agent lane**: a model-driven or programmatic agent with a name, a model, a monthly budget, the tasks it may perform (create, edit, update, review, summarize, translate, refresh, plan, claim, work) and the item types it may touch (AGSC-01-36). Each lane creates at most `max_new_items` items per proposal (default twenty) and, on a live board, holds at most `max_claims` tasks at once (default one); the whole node also carries one cap on model spend of every kind, ten dollars a month unless changed, and the enabled agents' budgets may not add up to more (AGSC-01-38). It runs as the refresh verb or as a client of the tool server, reads the published surfaces, and can only ever open proposals, each carrying its provenance and an episode with its cost (AGSC-08-28); `refresh --agent <name> --dry-run` shows the shape of the proposal it would open without opening it; the reference engine ships no model adapter at 1.0, so a live run needs one. With `publish: auto` on its channel the wiki becomes **self-driving**: pages are created, edited, reviewed and updated by the model alone, under the standing ratification the owner configured once, the lints at error severity, the budget, and the rule that procedures, gates and configuration always stay with a person (AGSC-08-29). Non-determinism is confined to what is proposed; the build stays deterministic and model-free (AGSC-08-30). The lane is off by default.

{{diagram:agent-lane}}

Requirements: PRD-011 to PRD-021. Rules: [AGSC-06](/specs/06-surfaces/) for what is emitted, [AGSC-08](/specs/08-governance/) for the checks.

**Try this mode:** [the Mode 0 demo](/docs/demos/#mode-0-the-self-correcting-wiki), a few commands from an empty folder, with the lines they print.

## Mode 1 — distributed agentic memory

**What you do.** Point an agent at a node. It reads the discovery document, the graph, the chunk export or llms.txt, or it calls the local tool server, which exposes exactly seven tools: search, read, links, compose, propose, ask and remember (AGSC-09-13). It cites items by their addresses. When it wants to change something, it proposes; a person merges.

**Distributed.** A node can declare other nodes as peers, and the two can be checked for mutual conformance with one command (AGSC-10-12). An agent walks peers itself, over HTTPS only, refusing private and special-purpose addresses, with a hop limit, a fan-out cap and a request budget (AGSC-11-07 to AGSC-11-10). Everything that comes from a peer is marked untrusted and carries its origin (AGSC-11-11). Citing another node is done through sources, never through a link (AGSC-11-12).

{{diagram:mode-1-memory}}

Requirements: PRD-022 to PRD-027, PRD-057. Rules: [AGSC-05](/specs/05-graph/), [AGSC-06](/specs/06-surfaces/), [AGSC-11](/specs/11-boundary/).

**Try this mode:** [the Mode 1 demo](/docs/demos/#mode-1-distributed-memory), a few commands from an empty folder, with the lines they print.

## Mode 2 — live specifications and the memory of a software project

**What you do.** Keep a project's own decisions, specifications, tasks, gates and session records as items of the same format. Concepts of kind `principle`, `decision`, `spec`, `task` and `term`, plus Gate and Episode items, need no new type (PRD-028). Five engineering links join them: `implements`, `verifies`, `covers`, `blocked-by` and `decided-by` (AGSC-03-01). A Gate's checks compile into required status checks in CI (AGSC-08-09). Tasks carry an Agent2Agent task state, clusters of tasks are boards, and `/boards/` is a static export a client can merge across nodes (AGSC-10-13).

**Steer files.** The Bundle exports instruction files for coding agents, such as `AGENTS.md`, from its NOW page and its Concepts, Procedures, Gates and Lessons, as context only; enforcement stays in CI (PRD-029). This specification is itself developed this way.

{{diagram:mode-2-specs}}

Requirements: PRD-028 to PRD-031. Rules: [AGSC-02 §2.10](/specs/02-item/#section-2-10), [AGSC-10 §10.5](/specs/10-implementation-profiles/#section-10-5).

**Try this mode:** [the Mode 2 demo](/docs/demos/#mode-2-live-specifications), a few commands from an empty folder, with the lines they print.

## Mode 3 — the evolving skills library

**What you do.** Procedures export to skill packs in the `SKILL.md` format, one pack per Cluster, installable into an agent's skill tree with one command (PRD-032, PRD-033). Packs are content only: no scripts, no executables, no symlinks, no tool allow-lists, and a lockfile of hashes verifies every file (PRD-035). An agent that improves a skill can import its `SKILL.md` back as a Procedure (PRD-034); a whole pack this format emitted imports back as one Procedure per member procedure, filed in the Cluster the pack is named after, and every other member is reported (AGSC-07-22).

{{diagram:mode-3-skills}}

Requirements: PRD-032 to PRD-035. Rules: [AGSC-07 §7.4](/specs/07-composition/#section-7-4).

**Try this mode:** [the Mode 3 demo](/docs/demos/#mode-3-the-evolving-skills-library), a few commands from an empty folder, with the lines they print.

## Mode 4 — runnable knowledge

**What you do.** Select Concepts, in the browser or on the command line. The combiner runs five steps in a fixed order: it pulls in everything the selection requires, hides what is superseded, refuses any surviving pair that excludes each other, warns about contradictions and missing dependencies, then wires ports (AGSC-07-04 to AGSC-07-08, AGSC-07-23). A valid selection yields a Harness of seven kinds of file — one decision record per selected item and one skill file per selected procedure, so a selection usually gives more than seven files (AGSC-07-12), byte-identical whether produced in the browser or by the CLI (AGSC-07-13). Renderings of those seven files for other runtimes — GABBE, kaiban-distributed, CrewAI, LangGraph, ADK, n8n — are named by the specification (AGSC-07-18) and planned for version 1.1; at 1.0 an emitter is a plugin you write. A saved architecture item re-runs its selection (AGSC-07-24).

{{diagram:mode-4-runnable}}

Requirements: PRD-036 to PRD-038. Rules: [AGSC-07](/specs/07-composition/).

**Try this mode:** [the Mode 4 demo](/docs/demos/#mode-4-runnable-knowledge), a few commands from an empty folder, with the lines they print.

## Mode 5 — the live board: self-driving product and project management

**What you do.** Put a whole project on one Bundle: its decisions, specifications, tasks on boards, gates, procedures as skills, lessons and session records. Declare where proposals go and at least one surface agents can use. Optionally enable agent lanes whose tasks include planning, claiming and working, each holding at most its configured `max_claims` tasks at once (default one) and proposing at most `max_new_items` items at a time. Then let people, local agents and remote agents work on it together (AGSC-10-16).

**How it works.** It is a live board first — always current, read by everyone, changed only by proposals — and a pull system: claiming a task is proposing its working state, which is what pulls the work — an agent lane holds at most one task at a time unless configured otherwise, and work flows through the board's states until it is done; concurrent claims resolve by merge order. In its architecture it is the blackboard pattern (Hayes-Roth 1985, Nii 1986) realised on the format: the Bundle is the shared data structure every participant — a person, a local agent, a remote agent — reads through the published surfaces and writes to only through proposals. The board export says who holds each task and whether the board is done, and an agent lane keeps working until every board it may touch is done, a task needs a person, or its budget is reached (AGSC-10-17). All of Modes 1 to 4 are in use at once: the memory, the live specs, the skills and the runnable architectures.

**System 1 and System 2.** A live board has two lanes. The fast lane is everything that runs without a fresh human decision: agent lanes, automatic merges, refresh, the ledger, the exports, the peer check. The slow lane is everything that needs one: gates, reviews, decisions, releases, and every change to a procedure, a gate, a cluster or the configuration. The fast lane can never reach the slow lane, and every fast-lane action is auditable afterwards through the ledger and the episode of each run (AGSC-10-18). Remote participants propose through contribute targets, channels or a declared responder; nodes never call nodes, so a live board shared by many agents needs no server of its own.

{{diagram:mode-5-live-board}}

Requirements: PRD-063, PRD-064. Rules: [AGSC-08 §8.6](/specs/08-governance/#section-8-6) and [AGSC-10 §10.6](/specs/10-implementation-profiles/#section-10-6).

**Try this mode:** [the Mode 5 demo](/docs/demos/#mode-5-the-live-board), a few commands from an empty folder, with the lines they print.

## What every mode shares

Provenance on every item, a human decision on every merge, a ledger derived from git history, the same discovery document, and the same honest limit: the checks prove that an artefact is what was published, never that it is safe or true (AGSC-08-19).
