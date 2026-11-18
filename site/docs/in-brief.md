---
title: "In brief"
summary: "The whole system on one page, in plain words: what it is in 25 and in 70 words, each part with what it does and why it matters, what each kind of user gains, how to check a published file yourself, what it does not do, and the measured numbers. Written to be quoted."
description: "A plain-language summary of AgenticSystemCore: short descriptions, every part with its purpose and benefit, benefits for each kind of user, a do-it-yourself integrity check, the limits, and the key measured numbers with links."
---

This page is for anyone who needs to describe AgenticSystemCore quickly: a reviewer, a journalist, a judge, a colleague. Every sentence can be quoted, and each links to the page that shows the detail.

## In 25 words

Turn a folder of notes into a checked website, a knowledge graph and assistant tools. People control every change; anyone can verify the listed files.

## In 70 words

AgenticSystemCore turns a folder of notes into a website, a knowledge graph and assistant tools. Each link says what kind of link it is. Anyone can check the machine files a node lists with a fingerprint. A change to the source is approved by a person, or by a rule that person wrote. People and agents read the same knowledge, and building it needs no server, database or language model.

## How it works, in one line

**Markdown folder → one command (`agsc build`) → a website for people, a graph and text files for agents, and ten tools an assistant can call.** The same folder serves all of them, so there is one place to correct a fact.

## The parts, and why each matters

| Part | What it does | Why it matters |
|---|---|---|
| Build | Turns the notes into a site and the files agents read | One folder serves people and software |
| Typed links | Each link names its kind, one of fourteen: requires, uses, verifies, supersedes, excludes and nine more | A program can answer "what does this depend on?" without guessing from prose |
| Graph and vocabulary | Publishes the links as RDF under a published vocabulary, with shapes to check them and ten ready questions | Any linked-data tool can read and query the node; try the [query page](/query/) |
| Discovery file | One address on the site lists the node's machine files, most with a fingerprint | An agent finds everything from one request and can tell that a file was not altered |
| Ledger | Records each change with the hash of the entry before it, from the version history | Anyone can recompute the chain and see where a record stops matching |
| Ten tools | Let an assistant search, read, follow links, ask, cite, check and propose | Answers come from the node, with their source, and not from the model's memory |
| Local tool server | Serves those tools on your own machine | Your assistant reads your notes without sending them anywhere |
| Tools in the page | Offer the same tools inside each published page | An assistant in the browser, such as [WebAIAssist](/webaiassist/), can ask the page itself |
| Proposals and review | Turn every change, by a person or an agent, into a request someone approves | Agents can help write; a person stays accountable |
| Passages for retrieval | Cuts every item into passages with an address, a fingerprint and a licence | Anyone can build a search index and cite the exact passage |
| Compose | Turns the items you tick into seven starting files for a project | An architect starts from sourced material; try it on the [compose page](/compose/) |
| Skill packs and instruction files | Write the node's procedures and decisions in the form coding assistants read | Assistants in eleven tools follow the project's own rules |
| Shared board | Lets agents and people pull, claim and finish tasks on one board | Work is visible, and a person decides what is done |
| Import and export | Reads and writes other formats: the Open Knowledge Format, SKOS, skill packs, the memory formats of Mem0, Letta and Zep, and task boards from GitHub, Jira, Trello and others | Nothing is locked in |
| Test vectors and checkers | Fix the expected output for 399 cases; a Python package checks a node independently | Another implementation can be built and compared |
| Peers | A node names other nodes; the reader's program visits them | Knowledge links across sites with no central service, and nodes never call each other |

The [six ways to use it](/docs/modes/) group these parts by purpose; the [graph explorer](/graph/) shows a node's graph in the browser.

## What each kind of user gains

- **A person with notes:** a linked, checked website from existing files in a few commands, with broken links and stale pages flagged.
- **A documentation team:** every edit is a reviewed change, and the site, the search and the files for assistants never drift apart.
- **A developer who uses coding assistants:** instruction files and skill packs keep the assistants on the project's decisions, and the assistant can query the project's memory locally.
- **A company with internal knowledge:** a node can be kept non-public, in your own files, read by assistants on your own machines.
- **A researcher:** cite a passage by address and fingerprint, and query the graph with SPARQL.
- **A publisher of public knowledge:** static files on any host, 0 USD a month on a free plan, already prepared for agents.
- **A builder of AI agents:** one memory with typed links, a tool server, and exports to the common memory tools.
- **Someone working on interoperability:** published rules, schemas, a vocabulary and test vectors to build against.
- **A security reviewer:** a scored set of refusals, a hash-linked ledger, and stated limits.

## Check a published file yourself

No tool from this project is needed. The discovery file gives a fingerprint (a SHA-256 digest) for most of the machine files it lists; compute the same fingerprint from the file and compare:

```bash
curl -s https://agenticsystemcore.com/.well-known/knowledge-linkset | grep -o 'sha-256=:[^:]*:"\],"href":"https://agenticsystemcore.com/llms.txt"' | cut -d: -f2
curl -s https://agenticsystemcore.com/llms.txt | openssl dgst -sha256 -binary | base64
```

Each command prints one line of Base64 text; the two lines are equal when the file is the one the node published. The [graph explorer](/graph/) does the same check for the graph before it draws it.

## What it does not do

- **It does not judge truth.** A fingerprint shows that a file is the published one, not that its content is right. Sources and the name of the accountable person are recorded so that a reader can judge.
- **It does not run a model.** Building and checking use none. An assistant brings its own model and uses the node's tools.
- **It does not replace a search index** over files you own; it publishes the passages such an index needs.
- **It does not run agents for you.** It declares what an agent may do and checks the result; the agent runs elsewhere.
- **It is not a standard of any standards body.** It is an independent specification with one reference implementation and a Python checker, maintained by one person.

The full list is under [Not shipped at this version](/docs/how-to-use/#not-shipped-at-this-version), and the [status page](/docs/status/) says what is live.

## The numbers most often asked for

| Question | Answer |
|---|---|
| Does an agent answer better from a node than from web pages? | 97–98 % correct against 67–83 %, with 31–56 % fewer tokens, for two hosted models with tools |
| Can a citation be checked? | 91 % of a capable model's answers carried a citation whose fingerprint matched the published file |
| Do standard linked-data tools read the graph? | 5 of 5 graphs pass the published shapes; 3,648 queries ran with 0 failures |
| How long to a first node? | 6 commands and 22 seconds from an empty folder |
| How large can it go? | 10,000 items build in 119 seconds |
| What does hosting cost? | 0 USD a month for both public nodes on a free plan |
| How is it tested? | 399 conformance cases: 376 pass, 0 fail, 23 withdrawn and kept for the record; 108 of 108 seeded security faults stopped |

Each number, its method and its limits are on the [benchmarks page](/docs/benchmarks/).

## Where to go next

- [Try it in five minutes](/docs/demos/), or follow a [guide](/docs/guides/) on your own files.
- [Start here](/docs/start-here/) for a reading path for each kind of reader.
- The source is on [GitHub](https://github.com/andreibesleaga/agentic-system-core), under Apache-2.0.
