---
title: "What the extension reads from a site and why"
summary: "The public files WebAIAssist reads from a site you allowed, why it reads each, what stays in the browser and what can leave."
description: "What WebAIAssist reads from a site, why, what stays in the browser and what can leave."
---

> **In short**
>
> - WebAIAssist reads a short, fixed list of things a site publishes about itself, to show you what the site offers and to give the model a few facts.
> - It reads them for a site you allowed, or after you click the toolbar button on that page. Nothing is read in the background or from other tabs.
> - Requests go to the open site as a plain GET with no cookies and no referrer, and no redirect is followed.
> - With a model in the browser or Chrome's built-in model, your questions, page text and tool results stay on your computer. A remote chat endpoint receives them.
> - It does not read your cookies, other tabs, your history or files on your computer.

WebAIAssist reads a short, fixed list of things that a site publishes about itself. It reads them to
show you what the site offers and to give the model a few facts, so the model asks the page's
tools instead of guessing. Each thing it reads is in the [standards table](/webaiassist/standards/), with its
status.

## When it reads

- Only for a site you allowed. Pressing **Allow** in the panel asks Chrome for access to that one
  site. At install the extension has access to no site.
- Or after you click the toolbar button on a page. Chrome then lets the extension work on that tab
  until it closes or moves to another site.
- Nothing is read in the background, for pages you did not open, or for other tabs.

## What it reads

All requests go to the open site only, as a plain GET with no cookies and no referrer. Each reply is
size-limited and must have the expected type.

| What                                                       | Why                                                                               | What you see                                                         | What the model gets                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| The page's WebMCP tools                                    | These are the only actions the model can ask for.                                 | Each tool, what it does, read-only or not.                           | The tool list, as untrusted data.                          |
| `/.well-known/knowledge-linkset`                           | A site's own list of its machine-readable files; marks an AgenticSystemCore node. | Version, counts, relation names, "matches the node's own list" chip. | Up to 20 same-site rows (relation, path, label).           |
| `/llms.txt`                                                | The site's own summary for AI tools.                                              | Title, link counts.                                                  | Title, summary, section names and link titles.             |
| `/llms-full.txt`                                           | Shows that a longer version exists.                                               | That it exists, and its size.                                        | Nothing.                                                   |
| `/robots.txt`                                              | Honours the site's AI-input choice (`Content-Signal`).                            | The choice.                                                          | Nothing. If `ai-input=no`, no site text goes to the model. |
| `/.well-known/tdmrep.json`                                 | Shows whether the site reserves text-and-data-mining rights.                      | A policy line.                                                       | Nothing.                                                   |
| `/.well-known/security.txt`                                | Shows the site's security contact.                                                | The first contact; "expired" when so.                                | Nothing.                                                   |
| `/.well-known/api-catalog`, `/.well-known/agent-card.json` | Shows what APIs and agent skills the site lists.                                  | Counts and names. Many sites publish neither.                        | Nothing.                                                   |
| `/.well-known/sustainability-data`                         | Shows the site's own energy and carbon statement.                                 | Provider, method, period, values; "signed" shown only as present.    | Nothing.                                                   |
| The page's own data: JSON-LD, Open Graph, `<link rel>`     | What the page says about itself.                                                  | Type, name, description, date, licence, creator.                     | A short line, as untrusted data.                           |
| A node's graph, ontology and chunks (explorer tab)         | Draw and query an AgenticSystemCore node's knowledge graph.                       | The graph, a query box, a vocabulary list.                           | Answers to the one built-in query tool (rows, as text).    |

"Nothing" in the last column means the file is shown to you only. What the model does get is given
in short form, unless you turn that off in Options ("Give the model short facts from what the
site publishes"). Everything from a site is marked as untrusted data: no file can add a tool,
change a setting or name an address to fetch.

The exact paths, size limits and code are in [STANDARDS.md](/webaiassist/standards/) and
`src/core/site-files.ts`.

## What stays in the browser

- Your questions, the page text you read, the tool results and the model's answers stay on your
  computer when the model runs in the browser (graphics card or processor) or is Chrome's built-in
  model.
- SPARQL queries over a node's graph run in your browser. The query text and the rows are not sent
  anywhere by the extension.
- Saved chats and tool counts live in the extension's own storage. **Forget this site** and
  **Forget all sites** remove them. There is no account and no analytics.

## What can leave, and when

| When                                        | What leaves, and where to                                                                                                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First start of a model in the browser       | Requests for the model files to `huggingface.co` and its download network. Nothing about you or the chat. Once per model.                                                                                                                       |
| You set a chat endpoint on this computer    | The conversation goes to `localhost` or `127.0.0.1`.                                                                                                                                                                                            |
| You set a remote chat endpoint              | Your questions, the page's tool list, tool results and any page text you read go to that host, and your API key as a header. The panel asks first, once per host. The service may charge for it and keeps what it receives under its own terms. |
| A tool you allowed runs                     | Whatever the page's own tool code sends. The extension passes the arguments you saw.                                                                                                                                                            |
| You tick another node in the graph explorer | Up to three published files are read from that node (an `https` site with a public name).                                                                                                                                                       |
| A site says `ai-input=no`                   | Nothing of the site's page text or files goes to the model. Its tool list and the results of its tools you allow still go to the model you chose, including a remote endpoint.                                                                  |

Results of a site's own tools still go to the model you chose, because you asked for the call.
The full list of hosts and every stored item is in [PRIVACY.md](/webaiassist/privacy/).

## What it does not read

It does not read your cookies, other tabs, your history, files on your computer or any site you did
not allow. It does not read the paths it does not list. It follows no redirect for a site file.

## Related

- [What is WebMCP](/webaiassist/what-is-webmcp/)
- [Standards table](/webaiassist/standards/)
- Threat model: what the extension protects against and what it does not
