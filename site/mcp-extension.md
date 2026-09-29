The identifier `com.agenticsystemcore/knowledge` names an unofficial extension of the Model Context Protocol. A server that serves a Bundle over MCP declares it to say that the same knowledge is also published as static files, and where the discovery document for those files is. This page is that extension's reference text. It is also the documentation route that a node declaring the `mcp` surface points at (AGSC-11-16).

{{status}}

## What the extension says

A connected client can list a server's tools. It cannot tell from the protocol whether the same content also exists as files it could fetch, cache, compare and verify without the server, nor check that a tool result matches what the publisher published. A server declaring this extension answers both questions: its knowledge is also published as a Bundle, and here is that Bundle's discovery document. The extension adds no method, no primitive and no message to the base protocol.

## How a server declares it

MCP carries optional extensions in the capabilities a party reports. The protocol says: "Extensions are advertised in the `extensions` field of capabilities, which is a map of extension identifiers to per-extension settings objects" (Model Context Protocol, *Versioning and Compatibility*, revision `2026-07-28`). A server declaring this extension puts the identifier in that map (AGSC-11-18).

Under that revision there is no moment at which the two sides agree on extensions once and for all. The same page says "There is no negotiation handshake. Every request carries its protocol version, and the server accepts or rejects each request independently", and "Servers **MUST** implement `server/discover`". So a server declaring this extension carries the identifier in the capabilities of its `server/discover` result and in the capabilities it reports per request; an `initialize` handshake belongs to the earlier revisions the same page calls legacy.

The settings object has exactly one member, `linkset`: the absolute `https` URL of the server's `/.well-known/knowledge-linkset`. A server must emit that member and must emit no other. That document is served as `application/linkset+json` with the profile `https://w3id.org/agentic-system-core/profile/agentic-knowledge` (AGSC-06-07, AGSC-11-04), and the [profile page](/specs/agentic-knowledge/) documents its shape. The specification pins the object and the way it is carried, and two conformance vectors hold the bytes (AGSC-11-18).

```json
{
  "capabilities": {
    "tools": {},
    "extensions": {
      "com.agenticsystemcore/knowledge": {
        "linkset": "https://agenticsystemcore.com/.well-known/knowledge-linkset"
      }
    }
  }
}
```

## The tools

A server declaring the extension exposes exactly seven tools, as ordinary core MCP tools. Their names, arguments and results are fixed by the specification (AGSC-09-13), and their results are equal as values to the same node's browser-side tools for the same input and the same Bundle: the same members, in the same order, with the same contents (AGSC-09-16).

| Tool | What it returns |
| --- | --- |
| `search` | Items matching a query, from the node's own index. |
| `read` | One item, by its identifier. |
| `links` | The typed links of one item. |
| `compose` | The verdict and the Harness for a selection of items. |
| `propose` | A proposal for review; it writes no content. |
| `ask` | An answer over the published exports, citing at least one item. |
| `remember` | A proposal that records one new item; it writes no content. |

Every result is a JSON envelope carrying `source`, `trust`, `license`, `type` and `body`, with `trust` fixed at `untrusted` (AGSC-08-18). Tools take item identifiers; `ask` and `remember` also take plain text, which is treated strictly as data (AGSC-09-14a, AGSC-09-14b). `propose` and `remember` are human-gated: each yields a proposal for review and never writes content (AGSC-11-18).

## Why an identifier and not a method

Everything the extension needs already exists. SEP-2133 defines the identifier form and permits unofficial extensions, and capabilities already carry a settings map. A new method would buy nothing that a URL does not.

The vendor prefix is a reversed domain name the author controls, as SEP-2133 asks: "To prevent identifier collisions, the vendor prefix SHOULD be a reversed domain name that the extension author owns or controls (similar to Java package naming conventions)."

## Compatibility

Nothing in the base protocol changes. A client that does not recognise the identifier ignores it and uses the seven tools as ordinary tools.

## Security considerations

Tool results are untrusted content. `trust` is fixed at `untrusted`; prose is never executed, never interpolated into a path, URL or shell string, and never resolved as an identifier (AGSC-08-18). Anything derived from another node keeps that marking and names its origin (AGSC-11-11).

Where a client fetches a URL this extension gave it, the specification's fetch rules apply: `https` only (AGSC-11-07); a closed refusal list of addresses derived from the IANA special-purpose address registries (AGSC-11-08); at most a fixed number of redirects, with both rules re-applied at every hop (AGSC-11-09); a connection to one of the addresses that was classified, and a re-check of the socket's remote address once the connection is open, as the rebinding guard (AGSC-11-08).

A surface never restates this floor. It inherits it (AGSC-11-18).

## Reference implementation

The reference engine's local tool server, `agsc mcp`, advertises the extension in its capabilities, with the `linkset` of the node it serves (AGSC-11-18); it runs on the reader's own machine over standard input and output. This node itself runs no tool server: it serves the discovery document and the static artefacts it names. The [status page](/docs/status/) says what is live and what is not.
