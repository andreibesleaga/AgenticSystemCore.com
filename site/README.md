# `site/` — the authored pages that are not items

**Summary.** Everything a person writes for this site that is not a knowledge item: the
plain-language guide, the about, privacy and profile pages, the MCP extension page, the
diagram sources and the one-sentence summary each generated page opens with.
`scripts/build.js` turns them into pages; nothing here is copied to the site as it is.

**Read after:** the repository [README](../README.md).

| Path | What it is |
|---|---|
| [docs/](docs/README.md) | the guide: one Markdown file per page under `/docs/` |
| [diagrams/](diagrams/README.md) | diagram sources, compiled to inline SVG |
| `about.md`, `privacy.md` | `/about/` and the privacy section of `/legal/` |
| `profile.md` | `/specs/agentic-knowledge/`, the page the discovery profile URI resolves to |
| `mcp-extension.md` | `/specs/mcp/`, the reference text of the MCP extension identifier |
| `summaries.json` | the one-sentence summary of every generated page, keyed by URL |
| [agent-skill/](agent-skill/agentic-system-core/SKILL.md) | the agent skill, published byte for byte under `/agent-skill/`; `/docs/agent-skill/` explains it |

`{{name}}` placeholders in these files are filled by the generator from the engine's
documents (for example the status table); an unknown placeholder stops the build. After
an edit, run `node scripts/build.js && node scripts/check.js` from the repository root.
