---
title: "What is WebMCP"
summary: "What a web page's tools are, where the WebMCP draft stands, and the one Chrome switch you must turn on before WebAIAssist can see them."
description: "Plain explanation of WebMCP, a W3C Community Group draft, and the Chrome switch that WebAIAssist needs."
---

> **In short**
>
> - WebMCP lets a web page tell an AI assistant what it can do, as a list of tools such as a search or a form.
> - WebMCP is a draft. It is not a W3C Standard and it can change.
> - In Chrome it is off until you turn on `chrome://flags/#enable-webmcp-testing`. Without the switch, sites' tools do not appear in the panel.
> - Before each call you see the tool, the site and the exact arguments. The call does not run until you press Allow once.
> - The extension cannot check what a tool does. It is not an MCP client and it is not from Google.

WebMCP lets a web page tell an AI assistant what it can do. The page lists "tools": a search, a
form, a calculation. The assistant picks one, the page runs it, and the result goes back to the
assistant.

Without WebMCP, an assistant has to read the page like a person does and guess where to click.
With it, the page says "I can search; give me a query".

## Where it stands

WebMCP is a draft. It is published by the Web Machine Learning Community Group, a group that works
in the open under the W3C. The newest version when this page was written is the Draft Community
Group Report of 13 Nov 2026
([webmachinelearning.github.io/webmcp](https://webmachinelearning.github.io/webmcp/)). The document
says of itself: "It is not a W3C Standard nor is it on the W3C Standards Track." It can change.
This extension was written against the draft of 13 Nov 2026.

Chrome documents WebMCP as an early feature: an origin trial for sites from Chrome 149, and a
local switch for development
([developer.chrome.com/docs/ai/webmcp](https://developer.chrome.com/docs/ai/webmcp), last
updated 7 Oct 2026). Other browsers are not covered here; see BROWSERS.md.

## The Chrome switch you must turn on

In Chrome, WebMCP is off until you turn it on. **Without the switch, sites' tools do not appear
in the panel.** The panel says so, in plain words, when it finds none.

1. Open a new tab and paste `chrome://flags/#enable-webmcp-testing` into the address bar.
   (An extension cannot open that page for you. The panel shows the address with a Copy button.)
2. Set **WebMCP for testing** to **Enabled**.
3. Press **Relaunch** at the bottom of that page.

Two other routes exist, and neither needs the switch. Press **Read this page** in the panel and
the model gets the page's text. Or press **Add WebMCP to this site**: the extension then loads the
W3C WebMCP polyfill into that one site, after you allow access to it.

## What a page does

A page registers a tool in JavaScript:

```js
await document.modelContext?.registerTool({
  name: 'add',
  description: 'Add two numbers and return the sum.',
  inputSchema: {
    type: 'object',
    properties: { a: { type: 'number' }, b: { type: 'number' } },
    required: ['a', 'b'],
  },
  annotations: { readOnlyHint: true },
  execute: ({ a, b }) => String(a + b),
});
```

Each tool has a name, a description for the assistant, a JSON Schema for its input, optional
hints (for example `readOnlyHint`, which says the tool changes nothing) and an `execute` function.
The page can also mark an HTML form as a tool. The specification has the full interface.

## What WebAIAssist does with it

- It lists the open page's tools in a card: name, what it does, and whether the page marks it
  read-only.
- A small AI model, in your browser or on a server you chose, picks a tool and the arguments.
- **Before each call you see the tool, the site and the exact arguments.** The call runs only
  after you press **Allow once**. Nothing runs on a page's say-so.
- The result comes back marked as untrusted page content, not as instructions.

What a tool really does is the page's own code. The extension cannot check it.

## What WebAIAssist does not do

- It does not speak the Model Context Protocol to servers. It is a client of WebMCP, the tools a page
  registers in the browser, and not an MCP client.
- It is not an official WebMCP extension and it is not from Google.
- It does not register tools on a page, click, fill in forms or navigate by itself.
- It does not make a tool safe. It makes every call visible and optional.

## Who made this, and how it fits

WebAIAssist is the browser client of the AgenticSystemCore project, by the same author. Pages
published with the AgenticSystemCore engine offer ten WebMCP tools, and the panel marks such a
site as a node. WebAIAssist works with sites that offer WebMCP tools, once you allow them (see Limits in the README).

## Next

- [What the extension reads from a site, and why](/webaiassist/what-the-extension-reads/)
- [The standards table](/webaiassist/standards/): each standard, draft and profile the extension reads
- [Privacy](/webaiassist/privacy/) and the threat model
