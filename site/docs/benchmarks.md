---
title: "Benchmarks"
summary: "What has been measured, for each kind of reader: how agents answer from a node, what the typed graph and its vocabulary give, what a person, a team and a publisher get from one folder of files, how the checks hold, and how far it scales. Every number names its source, and the limits are at the end."
description: "Measured results for AgenticSystemCore 1.1.0: agent answer accuracy and token cost against plain pages, llms.txt and retrieval; checkable citations; the graph read by standard RDF, SHACL and SPARQL tools; typed-link questions; governed writes; determinism; security floor; accessibility; scale; hosting cost; and the limits of the measurements."
---

AgenticSystemCore is a knowledge system for people and agents: one folder of Markdown becomes a website, a graph with published meanings, and tools an assistant can call, with every change passing through a person. This page collects what has been measured about engine 1.1.0 and the two public nodes, this site and [patterns.agenticsystemcore.com](https://patterns.agenticsystemcore.com/).

The numbers come from two sources: the engine's own measurement record of 11 November 2026 ([docs/MEASUREMENTS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/MEASUREMENTS.md), each figure with the command that produced it), and studies run on 17 and 18 November 2026 that compared a node with other ways of offering the same content and read its graph with independent tools.

## The results in one table

| For | What a node gives | Measured |
|---|---|---|
| An AI agent on the open web | Better answers for less reading than the same content as web pages | 97–98 % correct against 67–83 %, with 31–56 % fewer tokens |
| Anyone who reads an agent's answer | Citations a program can check | 91 % of a capable model's answers carried a citation whose digest matched the published file |
| Anyone who works with linked data | A graph that standard tools read as it is | 5 graphs, 3,941 statements: two RDF forms equal, all pass the SHACL shapes, 3,648 SPARQL queries run with 0 failures |
| An agent asked about relations | Answers that follow typed links over two and three steps | 30 of 30 through the `links` tool |
| A person with notes | A checked website, a graph and agent files from one command | 323 files of 14 kinds in 2.4 seconds; a first node in 6 commands and 22 seconds |
| A team that lets agents propose | Changes that pass through a person | 0 source files changed in 20 attempts, ordinary and hostile; each returned a proposal |
| A publisher | Detection of a changed file, and the same bytes on every build | every change to the 9 digest-listed files detected; 0 files differing across two builds, time zones and locales |
| A security reviewer | A floor of refusals that is scored | 108 of 108 seeded faults stopped, 14 of 14 valid controls clean |
| A reader with assistive technology | Pages that pass automated accessibility checks | 0 violations on 250 pages in both colour schemes |
| An implementer | A specification that can be tested | 376 vectors pass, 0 fail; a second checker in Python agrees |
| Whoever pays for hosting | Static files and no server | 0 USD a month for both public nodes on a free plan |

The sections below give each result with its method.

## For agents: better answers than from web pages

Sixty questions were asked about the two nodes: 40 answered by one item, 10 that need two items, and 10 whose answer is not in the node. A program scored each answer against facts written down before any run. The same content reached the model by four routes.

| Route | What the model gets |
|---|---|
| Plain pages | a tool that fetches the site's HTML pages, starting from the home page |
| Pages and `llms.txt` | the same, with the site's `llms.txt` |
| Node tools | the node's `search`, `read`, `links` and `ask` tools |
| Retrieval | the five best passages from a word-matching (BM25) index of the same Markdown, put in the prompt |

Correct answers on the answerable questions, with 95 % intervals, and the median number of tokens for one answer:

| Model | Plain pages | Pages and `llms.txt` | Node tools | Retrieval |
|---|---|---|---|---|
| Claude Haiku 5.5 | 67.3 % [55.0, 79.0], 29,559 tokens | 73.3 % [61.7, 84.0], 22,589 tokens | 98.0 % [95.3, 100], 12,983 tokens | 97.3 % [94.7, 99.3], 1,311 tokens |
| Claude Sonnet 5.5 | 82.5 % [70.0, 92.5], 20,513 tokens | 82.5 % [70.0, 92.5], 15,918 tokens | 97.4 % [92.3, 100], 10,939 tokens | 39 of 39, 1,205 tokens |

- **A node against web pages.** With either model, the node's tools gave 15 to 31 points more correct answers than the page routes, with 31 to 56 % fewer tokens. This is the comparison that matters for an agent that visits a site it has never seen.
- **A node and retrieval.** Retrieval over the source files was as accurate and cheaper per answer. The two fit together: a publisher who has the files can index them, and a node publishes those same files, already cut into passages with digests (`chunks.jsonl`), for anyone who wants to build that index.
- **Small local models.** A 7-billion-parameter model on a laptop could not run a tool loop by any route. Given the node's results in its prompt in one step, it answered 84.0 % correctly; given retrieved passages, 94.0 %. For such models, put the content in the prompt.

The Haiku row covers two full passes and part of a third; the Sonnet row covers one pass over 40 of the 50 answerable questions.

## For meaning: a graph that standard tools read

Every link in a node says what kind of link it is, and the build publishes the result as RDF under a published vocabulary (an OWL ontology of 19 classes, 19 object properties and 22 datatype properties, built on the classes of SKOS and PROV, with Dublin Core and schema.org properties). The graphs of the two public nodes and of the engine's three example Bundles, 3,941 statements in all, were read with two independent open-source libraries, rdflib 7.6.0 and pySHACL 0.40.2, which share no code with the engine.

| Check | Result |
|---|---|
| The Turtle form and the N-Quads form parse and hold the same statements | 5 of 5 graphs |
| The graph passes the published SHACL shapes (609 shape statements) | 5 of 5 graphs, 0 violations, 0 warnings |
| The published SPARQL questions run in an independent SPARQL engine as written | 8 of 10; the other two take a selection of items as input |
| Queries run, one for each question and each subject | 3,648, with 0 failures |
| Statements whose property comes from a shared vocabulary (Dublin Core, SKOS, schema.org, RDF) | 68 %; the rest use the project's own published terms |

What this gives in use:

- **Questions with exact answers.** The ten questions the specification names ("if I choose X, what else must I take?", "what replaced X?", "what verifies X?") are each stated as a SPARQL query over the published graph, so any RDF store can answer them without the engine.
- **Typed links an agent can follow.** On the example Bundles (71 items linked by `requires`, `uses`, `verifies` and `decided-by`), a program using the `links` tool answered 30 of 30 questions about relations and two- or three-step paths. The best route that gave a local model retrieved text answered 16 of 30, and almost none of the multi-step ones. The expected answers come from the published graph, so this shows that the relations are published and usable by a program.
- **A vocabulary others already know.** A SKOS tool sees a concept scheme, a Dublin Core tool sees titles, sources and requirements, and the node's own terms resolve at a permanent address.
- **In and out without loss.** 11 of 11 documented export and import pairs returned every item, body and field unchanged, among them the Open Knowledge Format, skill packs, and the memory formats of Mem0, Letta and Zep.
- **From one node to its peer.** Starting from either public node, a client found the other through the discovery document in 4 requests, and attributed each fact to the right node in 8 of 8 answers.

## For trust: citations and files that can be checked

- **Checkable citations.** Asked to cite each passage with its digest, Claude Haiku 5.5 gave a citation whose digest matched the published `chunks.jsonl` in 91.0 % of its answers, and the small local model in 54.7 %. The node's `read` tool returned matching digests for 50 of 50 items. Web pages and a search index give a model nothing to cite that a program can verify.
- **A changed file is detected.** Every change made to the nine files the discovery document gives digests for was detected, including a one-byte change, by the engine and by the Python package independently. One of the nine is `chunks.jsonl`, which holds the text of every item.
- **The same bytes on every build.** Two clean builds of each public node were identical file for file (323 of 323 and 237 of 237). The engine's record adds a build under another time zone and locale: 61 files compared, 0 differing.

## For people and teams: little to learn, nothing to run

- **A first node.** From an empty folder: 6 commands, 22 seconds including the package install, and 4 files written by hand.
- **One source, many forms.** One build of the demonstration node wrote 323 files of 14 kinds: the website, the graph in three RDF forms, `llms.txt`, the passages, the discovery document, skill packs and more.
- **Agents propose, people decide.** In 20 attempts the writing tools changed no source file; each returned a proposal for a person to merge. The same tools answer the same way in the browser page and in the local server: 530 of 536 calls equal, and the other 6 are the one difference the specification requires.
- **Accessible pages.** axe-core found 0 violations on 250 pages of four builds, in the light and the dark colour scheme.
- **Offline.** Build, check, search and the tool server all worked with the network switched off: 11 of 11 operations.
- **No server.** Both public nodes are static files on a free hosting plan: 0 USD a month.

## For reviewers: a scored safety floor and a tested specification

- **Security floor.** A seeded corpus of 108 faults the rules name, from path escapes to hidden instructions in text, was stopped in full, each under the error code its rule names; 14 of 14 valid controls passed clean, and 16 of 16 hostile discovery documents were refused.
- **Conformance.** 376 of the 399 vectors pass and none fails (the other 23 are withdrawn cases kept for the record). A separate Python package runs the vectors of 7 areas, 115 pass and 0 fail, and agreed with the engine on 40 of 40 damaged discovery documents.

## Scale

| Items | Build | Peak memory |
|---|---|---|
| 500 | 5.9 s | 304 MiB |
| 5,000 | 49.9 s | 1,057 MiB |
| 10,000 | 119.1 s | 1,692 MiB |

Every size met the specification's budgets: at most 60 seconds of build for each 500 items, index files under 1 MB, HTML pages under 100 KB. On 5,000 items one `search` call took 80 ms, `ask` 8 ms and `links` 2 ms.

## What to keep in mind

- **Use retrieval where you own the files.** It is the cheapest route to an answer; a node is for content that others, and their agents, will read.
- **Digests are on the machine files.** The nine files the discovery document lists are covered; HTML pages are not. An agent that needs the check should read the machine files.
- **The local tool server reads your source folder**, drafts included, because it is the author's own tool. To offer tools to others, run it on an export of the published items, or use the tools on the published pages.
- **The injection check is a floor.** It stops the listed patterns; a paraphrase written to avoid them passes, as the specification says. Treat every tool result as untrusted text.
- **Large nodes start slowly.** At 5,000 items the local tool server took 35 seconds to start.
- **The two public nodes use few link types.** The typed-link results come from the engine's example Bundles, which use more of them.

## How it was measured

- The comparison studies scored answers by program against facts fixed before any run; a hand reading of 30 answers agreed with the program on all 30.
- The project wrote the questions, from the items' own text, which favours word-matching retrieval. The two nodes are small (50 and 14 items). Retrieval was BM25; no embedding search was tested.
- Each answer was limited to eight tool calls, and tool results were cut to 3,500 characters, for every route.
- The graph checks read the published `graph.ttl` and `graph.nq` files; the JSON-LD form was not parsed in that run.
- The engine's record states for each figure the command, the machine and what the figure does not establish.
- These are the project's own measurements. No third party has repeated them.
