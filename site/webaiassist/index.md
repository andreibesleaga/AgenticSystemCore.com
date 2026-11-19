---
title: "WebAIAssist"
summary: "A chat in your browser's side panel, with a small AI model that runs on your own computer. It can use the tools a web page offers through WebMCP, and asks you before each one runs."
description: "WebAIAssist is the browser client of the AgenticSystemCore project, by the same author: what it does on a node and on any site with WebMCP tools, where the model runs, what leaves the computer, its limits and how to install it."
---

WebAIAssist is the browser client of the AgenticSystemCore project, by the same author. [WebMCP](https://webmachinelearning.github.io/webmcp/) is a draft of the W3C Web Machine Learning Community Group.

What you get:

- **One assistant for many sites.** It works with AgenticSystemCore nodes, such as this site, and with any site that offers WebMCP tools. On any other page it can read the page text and answer from it, unless the site asks for no AI input.
- **Your choice of model.** The model runs in the browser on your graphics card or processor, or it is Chrome's built-in model, or a chat endpoint you choose.
- **No server to install, no account, no analytics.**
- **You decide every tool call.** Each call is shown first and waits for your answer.
- **Nothing goes to a model service unless you choose one.** With a model in the browser or Chrome's built-in model, no page text, chat or tool result leaves your computer for the model. A tool you allow still sends whatever its page's own code sends, and the extension reads a few public files of a site you allowed. The [privacy page](/webaiassist/privacy/) lists every case.

## Install

From the Chrome Web Store: [WebAIAssist](https://chromewebstore.google.com/detail/webaiassist/mekikidmpikblfalilhckiadncbjfppi).

Or load the release zip yourself:

1. Download `webaiassist-0.1.1.zip` from the [releases page](https://repo.invalid/releases) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and pick the unzipped folder.

The source is in the [repository](https://repo.invalid), under the Apache-2.0 licence.

## Turn on the Chrome switch

WebMCP is off in Chrome until you turn it on. Open `chrome://flags/#enable-webmcp-testing`, set **WebMCP for testing** to Enabled and relaunch Chrome. Without the switch, sites' tools do not appear in the panel. An extension cannot open that page for you, so the panel shows the address with a Copy button. [What is WebMCP](/webaiassist/what-is-webmcp/) explains the switch and the draft.

Two routes need no switch: **Read this page** gives the model the page text, and **Add WebMCP to this site** loads the WebMCP polyfill on that one site, after you allow access to it.

## First run

1. Open a web page and click the WebAIAssist button in the toolbar. The side panel opens and WebAIAssist may use that page.
2. Press **Start**. The panel has picked a model for this computer and says why in one sentence. Before the first download it shows the size and the address the model comes from, and downloads nothing until you press **Download**.
3. Ask a question about the open page.

The card at the top of the panel follows the tab in front. It shows the site, whether WebAIAssist may work on it, the page's WebMCP tools (each with what it does and whether it only reads or may change something) and what the site publishes for machines.

## What you can do with it

On an AgenticSystemCore node, which this site is:

- Ask questions that the model answers through the node's ten tools: search, read an item, follow its links, and the others the node lists.
- Open the graph explorer from the card, which shows **Graph: N items**. It draws the node's graph in your browser from the node's own `graph.jsonld`, checked against the digest in its link set.
- Use the **Query** tab of the same view to run a read-only SPARQL query (SELECT or ASK) over the node's `graph.nq`. It runs in your browser and sends nothing. An update or a `SERVICE` clause is refused.
- Let the model use its own built-in tool, `webaiassist_query_graph`, for counts, lists and links that the page's tools cannot give.
- Read the node card, headed "AgenticSystemCore node, spec" with the node's own version, which also has the command to start your own node and four starter questions that fill the box and send nothing.

On any site with WebMCP tools, once you have turned on the Chrome switch: the panel lists the tools the page registers itself, and the model can call them one at a time.

- Each tool is read against nine written rules before it is offered. A tool with a finding is marked **check** with its reasons and is always asked about. A finding is a reason to look twice, not proof of harm.
- Click a tool's name to see everything the page said about it, and run it by hand; you are asked first, as for any call.
- The **Activity log** lists each question with its model, where it ran, the tokens and the tool calls. It stays in your browser; the text of questions and results is kept only if you switch that on.

On any other page, **Read this page** gives the model the page text to answer from.

## What it looks like

From a real run in Chrome 157 on Windows, 16 November 2026, on this site and on a public WebMCP demo page (Chrome's built-in model in the first picture, a chat endpoint in the other two). Select a picture to see it whole.

WEBAIASSIST-PICTURES-REAL

The next pictures come from the extension's automated browser tests: a scripted test model and test pages that stand for a node. They show the interface, not a real model's answers.

WEBAIASSIST-PICTURES

## Where the model runs, and what leaves the computer

Pick one in the panel or in Options. The panel picks one for you and says why.

| Where it runs | What runs it | What leaves the computer |
|---|---|---|
| In the browser, on the graphics card | llama.cpp in WebAssembly with WebGPU: Qwen3 1.7B (the default), Qwen3 0.6B, Qwen3.5 2B or Llama 3.2 3B; Gemma 4 E2B, marked slow (Chrome 137 or newer) | Only the download of the model files, once, from `huggingface.co`. Your questions, the page text and the results stay. |
| In the browser, on the processor and memory | llama.cpp in WebAssembly: Qwen3 0.6B, Qwen3 1.7B or Qwen3.5 2B (Chrome 137 or newer) | The same: the model download only. |
| Chrome's built-in model | Chrome's own model (Gemini Nano), under Google's terms | Nothing from this extension. Chrome downloads and runs the model. |
| Your own server on this computer | An address on `localhost` or `127.0.0.1`: Ollama, LM Studio or another OpenAI-style server | The conversation goes to that local address. It does not leave the computer. |
| A remote service | Any `https` OpenAI-style address, for example OpenRouter | Your questions, the page's tool list, tool results, any page text you read and your API key go to that host, which may charge. The panel asks first, once per host. |

There is no account and no analytics. Every host the extension can reach, and what it stores, is on the [privacy page](/webaiassist/privacy/).

## What it does and does not do

- It calls only the WebMCP tools that the open page registers itself, one call at a time. Each call is shown first (tool, site, arguments) and runs only after you press **Allow once**. By default it asks for every call; the Options setting "once per site per session" skips the question only for tools the page marks read-only.
- The extension itself does not navigate, click, fill in forms, download files or read other sites for the model. The only way it acts on a page is a tool the page offers, and it has no access to a site until you allow that site.
- What a tool does is the page's code, which the extension cannot check.
- For a site you allowed, the panel reads a fixed list of public files from that same site. [What the extension reads](/webaiassist/what-the-extension-reads/) lists them and says why.
- A site that says it wants no AI input (`Content-Signal: ai-input=no` in `robots.txt`) gets no text sent to the model and no **Read this page**.

## Limits

- Chromium browsers only. Chrome 126 or later; the models in the browser, on the graphics card or the processor, need Chrome 137. Tried: Chrome 157.0.8103.52 on Windows (built-in model, 15 November 2026) and Chromium 156.0.8078.4 (automated tests).
- WebMCP is a draft, not a W3C Standard, and its shape may still change. In Chrome it needs the switch above.
- A page has tools only if its own scripts register them through WebMCP.
- Answers can be wrong, because they come from an AI model. Check anything that matters.
- Small models pick tools less reliably than large ones. On 15 November 2026, Chrome's built-in model used a tool in 5 of 5 questions on the test node and in 5 of 5 on the live node, and called the whole expected sequence in 4 of 5 on each. On one laptop with two graphics cards (18 November 2026, version 0.1.1), the default model, Qwen3 1.7B, picked the right tool in 8 of 10 test-node questions and in 5 of 10 on the live node, on both cards, with a median answer of 9 to 20 seconds. Of the models in the browser, Llama 3.2 3B picked the right tool most often (live node: 8 of 10 on the NVIDIA card, 7 of 10 on the AMD one); it is a 2.0 GB download that you choose yourself. On 19 November 2026 Chrome's built-in model, with version 0.1.1, answered 10 of 10 questions through a tool the question accepts, in a median of 15 to 17 seconds.
- A model on the graphics card needs WebGPU. Qwen3 0.6B needs about 0.7 GB of graphics memory, Qwen3 1.7B about 1.4 GB, Qwen3.5 2B about 1.6 GB, Llama 3.2 3B about 2.4 GB, Gemma 4 E2B about 3.5 GB. Gemma 4 E2B is marked slow in the list: on one laptop it took 1 to 2.5 minutes an answer.
- On a laptop with two graphics cards the browser decides which one the extension gets; the extension cannot choose. On the measured Windows laptop Chrome 157 gave the card inside the processor. Started with the switch `--force_high_performance_gpu` (close every Chrome window first, then run `chrome.exe --force_high_performance_gpu`), it gave the faster card, and the default model's median answer took 9 seconds instead of 14. `chrome://gpu` shows which card is active.
- The extension asks before tool calls, but it cannot check what a page's tool really does.

## Works with

| Part | Version |
|---|---|
| This extension | 0.1.1 (19 November 2026): one engine, llama.cpp, for every model in the browser. 0.1.0 was the first release |
| AgenticSystemCore specification | 1.1.0, the version the two public nodes (agenticsystemcore.com and patterns.agenticsystemcore.com) state on 14 November 2026 |
| Chrome | 126 or later; the models in the browser need 137 |
| WebMCP draft | Draft Community Group Report of 13 November 2026, Web Machine Learning Community Group. A draft: not a W3C Standard |

"Works with" says the extension can read what a node publishes and call its tools. It does not say that any body or company has checked the extension, or that it meets a specification.

## Read next

- [On an AgenticSystemCore node](/webaiassist/on-a-node/): what the extension does on a node that it cannot do on an ordinary site.
- [What is WebMCP](/webaiassist/what-is-webmcp/): what a page's tools are, the draft's status and the Chrome switch.
- [What the extension reads](/webaiassist/what-the-extension-reads/): what it reads from a site and why, what stays in the browser and what can leave.
- [Standards table](/webaiassist/standards/): every standard, draft and profile it reads, and what it does with each.
- [Privacy](/webaiassist/privacy/): what leaves your computer and what is stored.

To report a problem or ask a question, use the [GitHub issues](https://repo.invalid/issues) of the [repository](https://repo.invalid). To reach the author, use [andreibesleaga.com](https://andreibesleaga.com/contact/).

WebAIAssist is licensed under the Apache License 2.0. AgenticSystemCore is a trademark of Andrei N. Besleaga. WebAIAssist is not from Google and is not an official WebMCP extension.
