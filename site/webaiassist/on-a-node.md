---
title: "WebAIAssist on an AgenticSystemCore node"
summary: "What the extension does on a site built with AgenticSystemCore that it cannot do on an ordinary site: it reads the node's own list of files, checks them, uses the node's ten tools and queries its graph."
description: "How the WebAIAssist browser extension works with an AgenticSystemCore node: what the node publishes, what the extension does with each part, what a publisher has to do, and what the checks do and do not prove."
---

On any site with WebMCP tools, WebAIAssist lists the tools and lets the model call them, one at a time, after you allow each call. On an AgenticSystemCore node it does more, because a node publishes a list of its own machine-readable files with a digest for each. This page says what that adds. The general description is on the [WebAIAssist page](/webaiassist/).

This site is a node, so you can try everything below here.

## What the node publishes, and what the extension does with it

| The node publishes | The extension |
|---|---|
| A discovery document at `/.well-known/knowledge-linkset`: the node's files, with a SHA-256 digest for each published file it lists | Recognises the site as a node and heads the card "AgenticSystemCore node, spec" with the node's own version. Shows the content version, the date, the item counts and the ledger head. |
| The files that list names (`graph.jsonld`, `graph.nq`, `llms.txt` and the others) | Compares each file it reads with its digest. When they agree, the card shows "matches the node's own list". A file that does not match is not given to the model. |
| Ten tools on every page, registered through WebMCP: `search`, `read`, `links`, `compose`, `propose`, `ask`, `remember`, `brief`, `explain`, `check` | Offers them to the model. A question is answered by searching and reading the node's items; the `ask` tool answers from published text only and cites the items it used. |
| The graph, as `graph.jsonld` and `graph.nq` | Opens the graph explorer from the card ("Graph: N items") and draws the graph in your browser. The **Query** tab runs a read-only SPARQL query (SELECT or ASK) over `graph.nq`, also in your browser. |
| The vocabulary and the node's peers | Lists the vocabulary in the explorer. Other nodes this one names are read only after you tick them and press **Read the ticked nodes**. |

The model also has one tool of the extension's own on a node, `webaiassist_query_graph`. It answers counts, lists and links that the page's tools cannot give, from the same graph file, and no page tool can take its name.

## Nothing is written

The ten tools do not change the node. `propose` and `remember` return a text for a person to save and send as a proposal; on a page they perform no write of any kind. A node changes only when a person merges a proposal in its repository.

## What a publisher has to do

Nothing beyond building the node with the engine at version 1.1.0 or later. The build writes the discovery document, the digests and the page script that registers the ten tools. A page registers them only in a browser that offers WebMCP, so a visitor without it sees an ordinary site.

To start a node from a folder of Markdown files, see [How to use](/docs/how-to-use/). To check a published node, the engine has a one-line check; the [conformance page](/conformance/) explains the Levels it reports.

## What the checks prove, and what they do not

- "Matches the node's own list" means the files are unchanged since the node published its list. The same site publishes both, so it does not say who wrote them or that they are true.
- Everything a node sends is treated as untrusted data. No file can add a tool, change a setting or name an address to fetch.
- The model is small and can pick the wrong tool or misread a result. Open the items an answer cites when it matters.
- "Works with" says the extension can read what a node publishes and call its tools. It does not say that any body or company has checked the extension or the node.

## Read next

- [WebAIAssist](/webaiassist/): install, first run, where the model runs and the limits.
- [What the extension reads](/webaiassist/what-the-extension-reads/): every file it reads from a site and what the model gets.
- [Discovery](/specs/agentic-knowledge/): the discovery document and its relations.
