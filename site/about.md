AgenticSystemCore is written and maintained by Andrei N. Besleaga. The vocabulary and guide pages of this site were written with AI assistance and reviewed and published by the operator; every item says so in its provenance record.

## How to read this node

People start at the [guide](/docs/), then the [specification](/specs/) and the [vocabulary](/concepts/). Software agents start at the discovery document, [/.well-known/knowledge-linkset](/.well-known/knowledge-linkset), which links the [graph](/graph.jsonld), the [agent-facing text file](/llms.txt) and the [ontology](/ns/). Every HTML page links the discovery document with `rel="describedby"`.

## For agents and tools

Everything a program needs is a static file it can fetch without a key, an account or a request to anyone; [the list of machine-readable files](/exports/) names each one and says what it is for. The short version: [the discovery document](/.well-known/knowledge-linkset) first, and from it the graph as [JSON-LD](/graph.jsonld), [N-Quads](/graph.nq) or [Turtle](/graph.ttl), the node in one page as [llms.txt](/llms.txt), one line per passage in [chunks.jsonl](/chunks.jsonl) for anything that needs to cite what it found, the [skill packs](/skills/) an agent runtime can load, the [search index](/search.json), each item's own [source file and RDF view](/pages/bundle.md), and [the state of this node at the last build](/now/). [The tag pages](/tags/) gather items by label.

All of those files are written by the reference engine from this repository's own content, so they are the same bytes any other node built with the same engine would carry.

Two more files under [/exports/](/exports/) are additive: a tabular index of the passages and a skim view of them. No rule pins their bytes and nothing depends on them; they exist because they are cheaper to read than the files they come from. If what you want is a Harness — the small file set a runtime loads to work on a chosen set of items — [the compose page](/compose/) computes one in the browser and offers each file for download; nothing is uploaded, and no key or account is needed.

## Tools for browser assistants

Every item page, every guide page and the [compose page](/compose/) offer seven named tools — search, read, links, ask, compose, propose and remember — to an assistant running inside the visitor's own browser, so it can ask this node questions instead of scraping the page. The tools run in the page itself. They read only this site's own published files: the search index, each item's Markdown and JSON-LD view, and the discovery document. They contact no other host, they carry no key and need no account, and the two that prepare a change — propose and remember — hand the prepared text back to the caller and write nothing, here or anywhere else; a change to this node still becomes a pull request that a person reviews and merges. Nothing runs unless the browser supports the WebMCP feature, which today means Chrome 149 or later with `chrome://flags/#enable-webmcp-testing` switched on, or a browser that ships it. In every other browser the page registers nothing, behaves exactly as it did before and shows no error. WebMCP is a draft report of a W3C Community Group; it is not a W3C standard and is not on the W3C standards track.

## Status

The specification is at release candidate `1.0.0-rc.6`. It is an independent specification: it is not a standard of the IETF, the W3C or any other body, and no standards body has reviewed or adopted it. Every machine-readable file on this site is written by the reference engine, from this repository's own content: the graph in its three forms, the search index, the chunk export, the skill packs, the item source views, the NOW state, the derived ledger and the discovery document. The pages you are reading are written by this repository's own generator, which keeps this site's own page layout. The [status page](/docs/status/) lists what is live and what is not.

## Limits

The specification states its own limit (AGSC-08-19):

> These lints prove neither safety nor the absence of novel injection; hashes and attestations prove only that an artefact is what was published. An implementation MUST NOT claim more.

## Who stands behind this

AgenticSystemCore is maintained by one person, with no company, no funding and no organisation behind it. What you can rely on: the specification, the schemas, the vocabulary and the conformance vectors are published under licences that let you continue without anyone's permission, and conformance is defined by published bytes, not by anyone's opinion. What you cannot rely on: a release schedule, a support channel, or a quick answer. Depend on the format and the vectors, which survive this project, and treat the reference implementation as one implementation among the ones that could exist.

How decisions are made, what is promised and what happens if the maintainer stops are set out in [the governance file](https://github.com/andreibesleaga/agentic-system-core/blob/main/GOVERNANCE.md). How the name may be used is in [the trademark policy](https://github.com/andreibesleaga/agentic-system-core/blob/main/TRADEMARK-POLICY.md), and the exact sentence for saying that an implementation conforms is in [how to state conformance](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONFORMANCE-STATEMENTS.md). The [code of conduct](https://github.com/andreibesleaga/agentic-system-core/blob/main/CODE_OF_CONDUCT.md) applies to everyone taking part.

## Contact

- Web: [andreibesleaga.com/contact](https://andreibesleaga.com/contact/)
- ORCID: [0009-0001-3464-5283](https://orcid.org/0009-0001-3464-5283)
- GitHub: [andreibesleaga](https://github.com/andreibesleaga)
- Security reports: privately, through the project repository's vulnerability reporting, or the contact page; both are in [security.txt](/.well-known/security.txt)
