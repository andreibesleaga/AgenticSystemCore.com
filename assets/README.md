# `assets/` — the stylesheet, the scripts and the icon

**Summary.** The files the build publishes by name: `site.css` under `/assets/site.css`, `search.js` under `/assets/search.js`, `favicon.svg` under `/favicon.svg`, the graph explorer's three files and the two libraries in `vendor/` with their licence texts, each under `/assets/` at the same path. The build copies those files and nothing else from this folder, so this README is not published.

**Read after:** the repository [README](../README.md).

| File | What it is |
|---|---|
| `site.css` | the engine's default theme, byte for byte: the build stops if it differs from the engine's stylesheet, so change both together |
| `search.js` | the script of this site's `/search/` page, over the index of every page, rule and error code the build writes to `/assets/search-site.json` |
| `favicon.svg` | the site icon |
| `graph-data.js` | the graph explorer's data half: pure functions over a node's discovery document, `graph.jsonld` and `chunks.jsonl`, and the loader that follows the node's peer links (at most 16 peers per node and 10 MB per file, each cut reported); tested by `scripts/graph-explorer.test.js` |
| `graph-explorer.js`, `graph-explorer.css` | the graph explorer's page half: the picture on the front page and the page `/graph/` (tooltip, side panel, splitter, 2D and 3D) |
| `vendor/` | force-graph 1.52.0 and 3d-force-graph 1.80.1 (MIT), downloaded once from unpkg at those versions and kept byte for byte, with their licence texts; `scripts/check.js` asserts the SHA-256 of each file, so replacing one means changing the pin there |

After an edit, run `node scripts/build.js && node scripts/check.js` from the repository root.
