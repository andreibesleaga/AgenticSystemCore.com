---
title: "WebAIAssist privacy"
summary: "What leaves your computer, every host the extension can reach, what it stores and how to remove it. Last updated 16 November 2026."
description: "The privacy notice of the WebAIAssist browser extension: what leaves the computer, what is stored, every host reached."
---

Last updated 16 November 2026. This is the privacy notice of the WebAIAssist extension, version 0.1.0.

> **In short**
>
> - WebAIAssist has no account, no analytics, no crash reports and no server of its own.
> - With a model in the browser or Chrome's built-in model, no page text, chat or tool result leaves your computer.
> - With a chat endpoint, the whole conversation goes to the address you set, with your API key if set. A remote service may charge; the panel asks once per host.
> - Starting a model in the browser requests model files from Hugging Face. Nothing about you or the chat is sent, but the host sees your IP address.
> - The activity log stays in this browser, up to 8 MiB. Question text and results are stored just when you switch on Include content (off at the start).

WebAIAssist has no account, no analytics, no crash reports and no server of its own.

## What leaves your computer

| When                                                                          | What is sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | To                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| You press Start with a model in the browser                                   | Requests for the model weights and their small configuration files. Nothing about you, the page or the chat; the host sees your IP address and the model asked for. The model library (program code) is inside the extension and is never downloaded.                                                                                                                                                                                                                                                                                                                                                      | `huggingface.co` (the `mlc-ai` repositories, one fixed revision per model), which redirects the large files to Hugging Face's download network under `hf.co` (see below). Once per model. |
| You press Start with a model on the processor                                 | The same: requests for one model file (`.gguf`) from one fixed address (the `unsloth` repositories, one commit each; size and SHA-256 are checked after the download). Nothing about you, the page or the chat. The engine (program code) is inside the extension.                                                                                                                                                                                                                                                                                                                                         | `huggingface.co`, which redirects the large file to `*.hf.co`. Once per model.                                                                                                            |
| You use Chrome's built-in model                                               | Nothing from WebAIAssist: no request, to any host. Chrome downloads and runs its own model under Google's terms, and the prompt stays in the browser.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Chrome                                                                                                                                                                                    |
| You choose a chat endpoint in Options                                         | The whole conversation for each question: the instructions, the page's tool list, tool results, page text you read, the short facts from the site's published files (Options can turn them off), your questions, and the API key if set.                                                                                                                                                                                                                                                                                                                                                                   | The endpoint address you set, and nowhere else                                                                                                                                            |
| You allow a site and open a page of it, or click the toolbar button on a page | Up to nine requests to that site only, for its public files: `/.well-known/knowledge-linkset`, `/llms.txt`, `/robots.txt`, `/.well-known/tdmrep.json`, `/.well-known/security.txt`, `/.well-known/api-catalog`, `/.well-known/agent-card.json`, `/llms-full.txt`, `/.well-known/sustainability-data`. GET only, no cookies, no referrer. The card lists what was found. A toolbar click on a page (Chrome's `activeTab`) starts the same reads for that tab, without Allow, until the tab closes or moves to another site; the click also puts the site on the list of allowed sites, until you forget it. | Only that site, and only for the files listed                                                                                                                                             |
| A site asks for no AI input (`Content-Signal: ai-input=no`)                   | Nothing of the site's text or files goes to the model, unless you press **Use on this tab anyway**, which works with a model in the browser only. Results of the site's own tools still go to the model you chose, and to an endpoint if that is the model.                                                                                                                                                                                                                                                                                                                                                | The model you chose                                                                                                                                                                       |
| A tool runs on a page                                                         | Whatever that page's own tool code sends. WebAIAssist passes the arguments you saw and allowed; the page decides what its tool does.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The page's site                                                                                                                                                                           |

With a model in the browser or Chrome's built-in model, no page text, chat or tool result leaves
your computer.

## Every host the extension can reach

The code of the release package can contact these hosts, and no others:

| Host                                                                                  | When                                                                                                                    | Why                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `huggingface.co`                                                                      | Start with a model in the browser or on the processor, until it is cached                                               | The model's configuration, tokenizer and weights. Small files come from `huggingface.co` itself (it redirects to its own `/api/resolve-cache/` address).                                                                                                                                               |
| Hugging Face's download network, `*.hf.co`                                            | The same download                                                                                                       | `huggingface.co` redirects large files (the tokenizer, the weight shards) there. On 12 Nov 2026 the host was `us.aws.cdn.hf.co`; Hugging Face picks the host by region and may change it (earlier names include `cas-bridge.xethub.hf.co` and `cdn-lfs.hf.co`). The request carries no data about you. |
| The endpoint address you set (the presets: `localhost`, `127.0.0.1`, `openrouter.ai`) | A question, with a chat endpoint chosen in Options                                                                      | The conversation, as described above. Redirects are refused, so it goes to that address only.                                                                                                                                                                                                          |
| Chrome (built-in model)                                                               | You choose Chrome's built-in model and press Start                                                                      | Chrome downloads its model itself. WebAIAssist makes no request and has no address for it.                                                                                                                                                                                                             |
| The open page's own site                                                              | A tool you allowed runs, or you open a page of an allowed site or click the toolbar button on it (the nine files above) | The page's own tool code decides what it sends.                                                                                                                                                                                                                                                        |
| A node you tick in the graph explorer                                                 | You press the Graph button, tick a node the open node names as a peer, and press Read the ticked nodes                  | Up to three published files of that node (its link set, `graph.jsonld`, `chunks.jsonl`), over https, without cookies or a referrer. It sees your IP address and that a browser asked. Nothing is read before the click.                                                                                |

Chrome's built-in model is downloaded by Chrome, not by WebAIAssist. Other web addresses in the
bundles are never fetched: `github.com` is a base address the schema validator uses to name
schemas, `webgpureport.org` is part of an error message, `www.w3.org` is in a code comment,
`w3id.org` and `www.rfc-editor.org` are names the extension compares a site's published files
with (it never requests them), `purl.org`, `schema.org` and `www.w3.org` are identifiers of vocabularies inside the
graph explorer's code and `github.com` is the address of force-graph's source in its header, and addresses such as `github.com` and
`localhost:8080` appear in the comments of the model libraries (none of them is
contacted, they are names, not contact points), `agenticsystemcore.com` is the address of the links "Open the demo page, which offers tools" and "More at the AgenticSystemCore site" in the panel (the extension never requests it; your browser opens it only when you click the link), and WebLLM's own model list names `huggingface.co` repositories of models this extension does not
offer.

## What is stored, and where

| What                                                                                                                                                                                                                                                                                                                                          | Where                                                 | How long                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Options, including the endpoint address, model name and API key                                                                                                                                                                                                                                                                               | `chrome.storage.local` in this browser profile        | Until you change them, press Reset to defaults, or remove the extension. The key is not encrypted.                                                                                            |
| Sites whose tools you allowed in this session                                                                                                                                                                                                                                                                                                 | `chrome.storage.session`                              | Until the browser restarts                                                                                                                                                                    |
| Sites you allowed with Allow or with a toolbar click (the list)                                                                                                                                                                                                                                                                               | `chrome.storage.local`                                | Until you press Forget this site (that site) or Forget all sites                                                                                                                              |
| Remote endpoint hosts you agreed to                                                                                                                                                                                                                                                                                                           | `chrome.storage.local`                                | Until you press Forget all sites or Reset to defaults, or remove the extension                                                                                                                |
| Chat per site, with the tool results and the page text you read with Read this page (up to 4000 characters per read), and how often each tool worked per site (memory)                                                                                                                                                                        | The extension's IndexedDB                             | Until you press Clear memory in Options or remove the extension. Nothing is kept when memory is off.                                                                                          |
| The activity log: one entry per question (site, model, where it ran, counts of tokens, price when the service reports one, times, the tools called and whether you allowed them, an estimate of the window use). No question text, no argument values (the names are kept), no results and no error text unless you switch on Include content | The extension's own IndexedDB `webaiassist-activity`  | Until you press Clear in the Activity view, press Forget this site or Forget all sites, or remove the extension. The oldest entries go first above 8 MiB. Nothing is kept when memory is off. |
| Model weights                                                                                                                                                                                                                                                                                                                                 | The extension's Cache Storage (WebLLM's cache)        | Until you remove them in Options (Downloaded models) or remove the extension                                                                                                                  |
| Model file of the processor model                                                                                                                                                                                                                                                                                                             | The extension's private file storage (wllama's cache) | Until you remove it in Options (Downloaded models) or remove the extension                                                                                                                    |
| Whether the welcome screen was dismissed, and how long the first answer of your graphics card took                                                                                                                                                                                                                                            | `chrome.storage.local`                                | Until you remove the extension; the time is a number with the adapter's name, used only to pick the default model                                                                             |
| The last error text the panel showed (addresses and the endpoint key removed, cut to 300 characters), and whether persistent storage was asked for                                                                                                                                                                                            | `chrome.storage.local`                                | Until the next error replaces it, or you remove the extension; used only by Copy diagnostics                                                                                                  |
| Compat mode for a site                                                                                                                                                                                                                                                                                                                        | A content script registered for that site             | Until the browser restarts                                                                                                                                                                    |
| Access to a site (compat mode, endpoint)                                                                                                                                                                                                                                                                                                      | Chrome's permission list for the extension            | Until you remove it in `chrome://extensions`, under the extension's site access                                                                                                               |

## Downloaded models

Before the first download of any model weights the panel shows the size, the host they come from
and that they are stored in this browser, and downloads nothing until you press Download. The
Options page lists what is stored, with sizes, and removes one model or all. Chrome's own model is
managed by Chrome (`chrome://on-device-internals`).

### Persistent storage, size and updates

After the first successful download of weights into this browser (never at install) the panel
calls `navigator.storage.persist()` once. That asks Chrome not to clear the downloads when disk
space runs low; Chrome decides, and the panel does not say whether it agreed. Options shows the
total size of the downloaded models beside **Remove downloaded models**.

What an update does to the downloads: an update keeps the extension's address
(`chrome-extension://<id>`), so its Cache Storage and private file storage are the same ones
afterwards. Chrome's documentation (storage page, read 14 Nov 2026) does not say in so many words
that this storage survives an update or an uninstall, and this was not tested here; treat
removal at uninstall as likely and survival of an update as expected, not guaranteed. What the
code does decide: the graphics-card models are looked up by the exact files of the pinned
revision, and the processor models by file address and recorded size. If an update pins a new
revision of a model, the new files download again (the panel asks first) and the old files stay
in the cache, not listed by Options, until the extension is removed or its data is cleared. This
case has not happened yet.

## Copy diagnostics

**Copy diagnostics** (Options, and "More" in the panel) first shows a preview of exactly what will
be copied, and copies it only on a second click. It holds: the extension version, the browser
version, the chosen model and where it runs, the graphics adapter's vendor and architecture and
whether it has `shader-f16`, the state of Chrome's built-in model, whether the open tab has WebMCP,
and the last error text. It holds no page text, no page title, no address (the open site's host
only if you tick the box), and no key. Nothing is sent anywhere: you paste it yourself.

**Copy details** on an error message copies the extension version and the error text, with web addresses and the
API key removed.

## Forget all sites

**Forget all sites** in Options removes every saved chat and tool count, every "use the tools of
this site" answer, the list of sites you allowed, the list of remote endpoint hosts you agreed to, every
compat script and every site access you granted, except the host access of your chat endpoint. **Reset to
defaults** also clears the list of remote endpoint hosts and removes the endpoint's host access, unless
the same host is also a site you allowed.
**Forget this site** (below) does the same for the open site, except the endpoint lists.

## Forget this site

**Forget this site** in the panel removes, for the open site: its chat and tool counts, the
"use the tools of this site" answer of this session, the site's place in the list of sites you allowed, compat
mode, and the site access you granted. The panel then neither lists nor calls that site's tools until you
allow it again, even in tabs already open. Clear memory in Options removes the chat and counts of every site.

## Export

**Export** in the panel saves the conversation as a Markdown file on your computer, only when you
press it. It starts with a short block that marks the text as AI-generated (`ai-generated: true`, the extension version, the model and where it ran) and says so in a sentence: a local model, or the endpoint host when an endpoint wrote the answers. It contains your questions, the answers, the tool calls and the tool results (marked as
untrusted page content). Argument values whose names look like secrets (password, token, API key,
auth, bearer, private key, session, cookie, credential) are replaced with `[redacted]`, and so is
the endpoint API key wherever it appears, even in text you typed.

## A remote chat endpoint (OpenRouter and similar)

- **Where the model runs.** The OpenRouter preset is `https://openrouter.ai/api/v1`; any other
  `https` address works the same way. An address on this computer (`localhost`, `127.0.0.1`) keeps the chat on
  it. Any other address is a remote service: the model runs there, and your questions, the
  page's tool list, tool results and any page text you read go to that host. The service may
  charge for it and may keep what it receives under its own terms; WebAIAssist cannot see or change
  that.
- **One question first.** Before a remote host is used for the first time, the panel says so in
  plain words and waits for **Use this service**. Nothing is sent before. The answer is kept per
  host in `chrome.storage.local` (the list of hosts you agreed to); a different host asks again.
  An address on this computer never asks. A site that asks for no AI input has its page text and site
  files withheld; its tool list and the results of its tools you allow still go to the model you chose,
  including a remote endpoint.
- **Access.** Saving a remote address asks Chrome, from the Save click, for access to that one host
  (an optional permission; it is not granted at install). That access is for the chat only: the toolbar
  number, the automatic tool listing and the nine file reads happen only on sites you allowed. A
  first connection that takes longer than 15 seconds fails, and a reply that sends no data for 60 seconds
  stops; an error body is read only up to 2 KB.
- **What is sent besides the chat.** Only `Authorization: Bearer <key>` (when you set a key) and
  `Content-Type`. No app name, referrer or other identifying header is sent. The request asks the
  service to include token counts (`stream_options.include_usage`).
- **The key** stays in `chrome.storage.local`, unencrypted. It is never in the export, an error text or the activity log; text you type into the chat is saved as you
  typed it, and so is a key you paste there. A service's error text is cut to 200 characters and has the key
  and bearer-shaped strings removed before it is shown.
- **What is read back.** The reply text, and the token counts and price the service reports for
  the call. They are kept in the activity log in this browser and shown in its Activity view; nothing
  is sent anywhere.

## The graph explorer tab (14 Nov 2026)

The "Graph: N items" button on the card opens `explorer.html` in a new tab. The tab reads the open
node's `/.well-known/knowledge-linkset`, `/graph.jsonld` and, when you select an item, `/chunks.jsonl`
through the tab you opened it from, the same way the panel reads the nine site files: only for an
allowed site, with no cookie and no referrer, and nothing is sent anywhere else. The explorer keeps one
thing: the width you give its side list, as `agsc-graph-panel` in this page's local storage (a number).
Other nodes are read only after you tick them and press the button (see the host table above); a node is
checked by its name (a public name, port 443), not by the address the name resolves to; the
ticked origins are kept in memory for the life of the tab and are never stored.

## Query and semantic tools (14 Nov 2026)

The Query tab and the model's graph tool read two more files of the open node through the same tab, the same way,
and only for an allowed site: `/graph.nq` (at most 4 MiB) and, when you open the Vocabulary tab, `/ns/agsc.ttl`
(at most 1 MiB). Each is used only when the node's linkset names it with a SHA-256 digest and the bytes match it.
The questions are answered by a SPARQL engine inside the extension (Oxigraph, WebAssembly, from the package): the
query text and the rows never leave the computer, and a query cannot ask any address (`SERVICE` is refused, a
`FROM` address is only the name of a graph in the store). Nothing is stored: the graph lives in the memory of the
query worker and is dropped when the tab or the panel moves to another site. The text of a query, and the rows the
model reads, go where the model runs: the same rule as every other tool result, including the one-time question
before a remote chat service gets page content.

## The activity log (14 Nov 2026)

Every question you ask in the panel adds one entry to a log that stays in this browser and is sent nowhere. The
**Activity log** button in the panel's More area opens `explorer.html` on the Activity view; it works on any page,
not only on a node.

- **What is stored.** The time, the site, the model, where it ran (graphics card, processor, Chrome's model, your
  own server or a remote service, with the host for the last two), the number of model calls, the tokens
  (counted by the runtime when it reports them, otherwise estimated from the text and then marked "estimated"),
  the price when the service reported one, the times, how the answer ended, and for every tool call: its name,
  whether it is a tool of WebAIAssist, whether you were asked and what you answered, how long it took, whether it
  worked, and the sizes of its arguments and result. The context numbers (instructions, tool list, site text, chat,
  reply) are estimates. The text of a page you read is never stored, only counted.
- **What is stored whatever the setting.** The names of a tool's arguments, and whether a call worked or failed.
- **What is not stored by default.** The question, the argument values, the tool results and the error text of a
  failed call (the entry says only "failed"). They are kept only
  while **Include content** is on (off at the start; the switch is in the Activity view and applies to new
  entries only). Even then the endpoint API key is removed wherever it appears, argument values whose names look like
  secrets become `[redacted]`, results are cut to 4,000 characters and arguments over 4,000 characters are dropped.
- **Where.** An IndexedDB database of the extension, `webaiassist-activity`. It is a separate database from the
  chat memory, so removing one does not touch the other. It needs no permission beyond the ones the extension has.
- **How much.** At most 8 MiB. When a new entry would pass the cap the oldest entries are removed first; the newest
  is never removed.
- **How to clear it.** **Clear** in the Activity view (it asks first, inside the page); **Forget this site** in the
  panel removes the entries of that site; **Forget all sites** removes all of them; turning memory off in Options keeps
  nothing new. Removing the extension removes the database.
- **Export.** **Export JSON** and **Export CSV** save what the filters show, only when you press them. The CSV puts an
  apostrophe before a cell that starts with `=`, `+`, `-`, `@`, a tab or a line break, so a spreadsheet does not read
  a model name or tool name as a formula.
- **Run again.** The button next to a past tool call asks the same question as the side panel (the full arguments
  with hidden characters shown, review findings, hints, form lines, and a second question for a tool the page
  marks consequential) and runs the tool only after Allow, only when the site is allowed in this session, only in
  the tab the Activity view was opened for and only when the page still lists the same tool. It is offered only
  where the arguments were saved, and never with redacted or removed arguments.

## Tool review and the toolbar number (14 Nov 2026)

The tool review (TOOL-REVIEW.md) reads what a page wrote about its tools (name, title,
description, fields, hints) inside this browser. It makes no request and sends nothing. The first definition of
each tool, used to notice a later change, is kept in the panel's memory only and is gone when the panel closes.

The number on the toolbar icon is the count of tools the open page offers. It is read only for a site you
allowed, uses no new permission, and is stored nowhere.

A tool you run by hand from its detail view goes through the same questions as a call by the model, and is
written to the activity log as one entry marked "Run by hand (no model)", under the same rules as a question.

## Chrome Web Store: Limited Use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy,
including the Limited Use requirements.

In plain words: WebAIAssist uses what it reads (the open page's tools, the site's public files, page text
you ask it to read) only to answer your question. It goes only to the model you chose. Nothing is sent to
the developer, sold, used for advertising or for credit decisions, and no person reads it.

## Conformance page and demo pages

The conformance page (`conformance/`) is not part of the extension and sends nothing. The one host
`googlechromelabs.github.io` is an install-time host permission of the evaluation build made with
`--demos` only; the released extension has no install-time host and contacts a site only after you
allow it.
