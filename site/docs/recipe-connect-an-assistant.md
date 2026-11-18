---
title: "Recipe: connect a coding assistant to your notes"
summary: "For anyone who uses Claude Code, Cursor, VS Code or Codex and wants it to search and read a folder of notes. You end with a local tool server and the setting each tool needs."
description: "Start the local tool server of a node with one command, check it by hand, then add it to Claude Code, Cursor, VS Code or Codex."
---

**Who it is for:** a developer whose coding assistant should look things up in a node's notes.

**What you get:** a tool server that runs on your machine, checked by hand, and the setting that adds it to four coding tools.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell, and one of the four tools.


## Before you start

Install the engine as in [Mode 0](/docs/guides/mode-0/#before-you-start). Start in an empty working folder.
The server side below was run with engine 1.1.0. The four tools were not run: their settings are quoted from the engine's document [USING-WITH-ASSISTANTS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USING-WITH-ASSISTANTS.md).

## 1. Make a small Bundle

A Bundle is a folder of Markdown notes with one `agsc.config.json`. Make three notes and adopt them, as in [Mode 0](/docs/guides/mode-0/#1-adopt-your-notes):

```bash
mkdir my-notes && cd my-notes
printf '# Sourdough starter\n\nFlour and water, fed once a day. How runny it is depends on its [hydration](%s).\n' hydration.md > sourdough.md
printf '# Hydration\n\nThe weight of the water divided by the weight of the flour.\n' > hydration.md
printf '# Oven spring\n\nThe last rise of a loaf, in the first minutes in a hot oven.\n' > oven-spring.md
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'my notes'
```

Nothing is printed. `agsc mcp` serves the Bundle it is started in: the folder that holds `agsc.config.json`.

## 2. Ask the server for its tools

Send two requests to `agsc mcp` on standard input. The first is the handshake. The second asks for the tool list.

```bash
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
} | agsc mcp > init-and-list.jsonl
node -e '
const lines = require("fs").readFileSync("init-and-list.jsonl", "utf8").trim().split("\n").map(JSON.parse);
console.log("server:", lines[0].result.serverInfo.name, lines[0].result.serverInfo.version);
console.log("tools:", lines[1].result.tools.map((t) => t.name).join(" "));'
```

```text
server: agentic-system-core 1.1.0
tools: ask brief check compose explain links propose read remember search
```

Ten tools, listed in alphabetical order. The server reads files and writes none. `propose` and `remember` only return text.

## 3. Call two tools

`search` finds items by words. `read` returns one item and a citation record for each of its chunks.

```bash
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}'
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search","arguments":{"query":"hydration"}}}'
  echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read","arguments":{"slug":"hydration"}}}'
} | agsc mcp > calls.jsonl
node -e '
const lines = require("fs").readFileSync("calls.jsonl", "utf8").trim().split("\n").map(JSON.parse);
const search = lines[1].result.structuredContent;
for (const h of search.body.hits) console.log("hit:", h.slug, h.iri);
console.log("trust:", search.trust);
const read = lines[2].result.structuredContent;
console.log("read members:", Object.keys(read.body).join(" "));
console.log("chunk record:", JSON.stringify(read.body.chunks[0]));'
```

```text
hit: hydration http://localhost/concepts/hydration/
hit: sourdough http://localhost/concepts/sourdough/
trust: untrusted
read members: body chunks frontmatter iri slug
chunk record: {"algorithm":"sha-256","bundle_version":"0.0.0+1.gd43d2142952c","coverage":"text","digest":"46dde87aa5ae029a776dcc75b3cfff135db801b14f6708dbee5680f0c8070f6d","id":"395ec28f998bd7f694188d0112cb90c48b4122f5db16d3949b46969939868c5e","iri":"http://localhost/concepts/hydration/","item":"hydration","license":"LicenseRef-AgenticSystemCore-Content-Use-1.0","ordinal":0,"section":"","terms":"LicenseRef-AgenticSystemCore-Content-Use-1.0"}
```

Every result is marked `trust: "untrusted"`. The assistant reads the text as data, never as instructions. The version in your `bundle_version` differs: it comes from your commit. To use the `digest` in a citation, see [Cite one passage](/docs/recipe-cite-a-passage/).

## 4. Add the server to your tool

Open the Bundle as the project in the tool. The server starts in that folder and serves it. The engine's document gives these settings:

| Tool | Setting |
|---|---|
| Claude Code | run `claude mcp add --transport stdio my-knowledge -- npx -y agsc-cli mcp` from inside the Bundle. Add `--scope project` to write a `.mcp.json` for everyone who clones the repository. |
| Cursor | a file `.cursor/mcp.json` in the Bundle (or `~/.cursor/mcp.json` for every project) |
| VS Code | a file `.vscode/mcp.json` in the Bundle. Its top-level key is `servers`, not `mcpServers`. |
| Codex | run `codex mcp add my-knowledge -- npx -y agsc-cli mcp` from inside the Bundle, or write `~/.codex/config.toml` |

The file for Claude Code (with `--scope project`) and for Cursor:

```json
{
  "mcpServers": {
    "my-knowledge": {
      "command": "npx",
      "args": ["-y", "agsc-cli", "mcp"]
    }
  }
}
```

The file for VS Code:

```json
{
  "servers": {
    "my-knowledge": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agsc-cli", "mcp"]
    }
  }
}
```

The Codex configuration file:

```toml
[mcp_servers.my-knowledge]
command = "npx"
args = ["-y", "agsc-cli", "mcp"]
```

`npx -y agsc-cli mcp` fetches the command the first time. If the Bundle is a folder inside a larger workspace, `agsc mcp /path/to/your-bundle` names the folder. Restart the server after you edit a note: it reads the Bundle once, at start.

Each tool's own page on adding a tool server:
[Claude Code](https://code.claude.com/docs/en/mcp), [Cursor](https://cursor.com/docs/context/mcp), [VS Code](https://code.visualstudio.com/docs/copilot/customization/mcp-servers), [Codex](https://developers.openai.com/codex/mcp).

## 5. Option: the same server over HTTP

For a tool that reaches servers by a web address, `agsc mcp --http <port>` serves the same ten tools on the loopback address only. The port `0` lets the system choose one.

```bash
agsc mcp --http 0 2> http.log &
sleep 2
sed -E 's#:[0-9]+/mcp#:PORT/mcp#' http.log
```

```text
agsc mcp: the ten tools over Streamable HTTP at http://127.0.0.1:PORT/mcp (loopback only, read-only); stop with Ctrl-C
```

`PORT` stands for the number the system chose; `http.log` holds it. Stop the server with `kill %1`.

## Check that it worked

Step 2 printed `server: agentic-system-core 1.1.0` and ten tool names. If it did and your tool shows no tools, the cause is in the tool's setting. Check that the working folder is the Bundle, and restart the tool after you change its configuration.

## What this does not do

- The four tool settings were not run for this page. They are quoted from the engine's document and may change with each product.
- The server never writes. A change a tool proposes comes back as text; you save it and open the pull request ([Mode 1](/docs/guides/mode-1/)).
- It serves one Bundle, read at start. It makes no network connection and calls no model.

## Where to go next

- [Give every assistant the project's decisions](/docs/recipe-steering-files/) as files in the repository.
- [Cite one passage](/docs/recipe-cite-a-passage/) of a node so a reader can check it.
- The full text: [USING-WITH-ASSISTANTS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USING-WITH-ASSISTANTS.md).

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/connect-an-assistant.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/connect-an-assistant.run.sh). More recipes: [the list](/docs/recipes/).
