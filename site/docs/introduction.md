---
title: "Introduction"
summary: "AgenticSystemCore turns a folder of Markdown files into a shared memory that people and software agents can both read, check, extend and run: a distributed brain whose meaning, form and rules are published, so any agent anywhere can use it, improve it and build systems from it."
description: "What AgenticSystemCore is, what is new about it, who it is for and what exists today."
---

## The idea

Most knowledge that agents use today lives in one of two places: inside a single vendor's memory service, or scattered across documents that no machine can verify. AgenticSystemCore takes a third path. Knowledge is written as ordinary Markdown files with a small header, kept in one folder under version control, and compiled by a deterministic build into everything a person or an agent needs: web pages, a graph with a published ontology, a search index, an agent-facing text file, a chunked export for retrieval, and one discovery document that tells any agent where all of it is.

Because the meaning is published (the ontology), the form is published (the format and its schema), and the rules are published (the specification, with test vectors), the same folder can be read by a browser, by a coding agent, by a triple store, by an agent-memory system or by another node of the same kind. Nothing about it belongs to one vendor or one runtime.

{{diagram:system-overview}}

## A distributed brain, in the plain sense of the words

The word *brain* is a metaphor, but each part of it corresponds to something concrete in the specification:

- **Memory.** Every item is a file with a stable web address. An agent can read it, cite it by address, export it in a form it understands and import it back, and use a node as its external, auditable memory (Mode 1). Nodes can name each other as peers, and an agent walks them itself: nodes never call nodes (AGSC-11-06, AGSC-11-10).
- **Semantics and syntax.** The syntax is the item format (AGSC-02-01); the semantics is the ontology, a small OWL 2 RL vocabulary aligned to SKOS, PROV-O and Dublin Core (AGSC-05-12, AGSC-05-22; the [ontology](/ns/)). Together they make the knowledge machine-understandable without a proprietary API.
- **Universal exchange.** Bare Markdown, Google's Open Knowledge Format, JSON-LD, JSONL and skill files come in; Markdown, OKF, JSON-LD, JSONL, RDF, steer files, skill packs, llms.txt and chunk exports go out, without loss (AGSC-01-22, AGSC-01-26). Any agent that can read files can take part.
- **Self-checking and self-evolving, under human ratification.** Every build runs deterministic lints: schema, links, cycles, orphans, staleness, injection, secrets, personal data (AGSC-08-13 to AGSC-08-17). Stale items are flagged by date (AGSC-02-06), failures become Lesson items, and agents propose changes that a person merges (AGSC-08-03, AGSC-08-08). The system improves through actions that verify and modify text, and every such action leaves a provenance record and a place in a hash-chained ledger (AGSC-08-20).
- **Runnable.** A selection of Concepts can be composed into a Harness: seven files (a Structurizr model, a Mermaid diagram, an arc42 skeleton, decision records, a gate checklist, a skills manifest and a JSON-LD record) that an architect or an agent runtime can execute (AGSC-07-12). Knowledge is not only described; it can be assembled and run.
- **Working, not only remembering.** Used as a LiveBoard (Mode 5), the same Bundle is a shared pull board for agents and people: tasks are claimed and finished by proposals, agent lanes plan and work until a board is done, and a fast lane of automatic work sits under a slow lane of human decisions that it can never reach (AGSC-10-16, AGSC-10-18). That is the System 1 / System 2 of the node: a distributed brain that acts, with the deliberate part kept human.

## What is new

The related-work survey on the [standards page](/docs/standards/#related-work) catalogues the mechanisms that discover agents, tools and services, the wiki and memory systems, and the pattern catalogues that exist as of September 2026. To our knowledge, no other system combines these five properties:

1. A knowledge base discoverable through registered mechanisms (a well-known URI, a registered link relation and a profile URI) with an integrity digest on every artefact and no new media type.
2. Every machine artefact byte-deterministic across independent implementations, proved by test vectors.
3. Federation that is static and client-side, with a bounded walk, a mutual-conformance check and cross-node citation instead of cross-node links.
4. Every agent surface declared as a plugin under one contract, so that an external draft moving does not move the core.
5. An agent-retrieval chunk export with stable, citable units and provenance, without embeddings.

These are claims about the specification's text and its vectors, not performance claims. The survey and its verification dates are published so that anyone can check them.

## Who it is for

| You are | What you get |
|---|---|
| Someone with a folder of notes | A living, linked, agent-readable wiki in three commands, with no configuration (PRD-053) |
| A reader looking for a pattern or a fact | Pages with evidence, sources and provenance, readable without JavaScript |
| A contributor | A legible review gate: a pull request, deterministic checks, a human decision |
| An agent, or someone building one | A discovery document, a graph, llms.txt, chunks and a local tool server, all with trust labels |
| An architect | A combiner that turns selected Concepts into a starting architecture you can download |
| A team building software with agents | The team's own decisions, specifications, tasks and gates as one governed memory |
| An implementer or a standards body | A specification with test vectors, an ontology, a discovery profile and independent validators |

## What exists today

This site is a Level-0 node of the specification it publishes: the specification text, the vocabulary, the ontology and the discovery document are live and checkable. The reference engine, the patterns catalogue as a second node, the Internet-Draft and the registrations follow. The [status page](/docs/status/) says exactly what is live and what is not, and it never says "registered" before a registry does.
