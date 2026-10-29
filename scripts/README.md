# `scripts/` — the generator, the gate and the optional lanes

**Summary.** The programs that build and check this site. All of them use the Node
standard library and the engine checked out beside this repository; the browser lanes
need `playwright-core` and `axe-core` installed outside the repository.

**Read after:** the repository [README](../README.md) and [docs/BUILD.md](../docs/BUILD.md).

| File | What it does |
|---|---|
| `build.js` | writes every HTML page and hands the Bundle to the engine for the machine files; copies the icon and the touch icon from `assets/`; serves each frozen copy of the vocabulary in `static/ns/<version>/` unchanged, beside the copy of the current version |
| `engine.js` | runs the reference engine over this repository's Bundle |
| `diagram.js` | compiles `site/diagrams/*.diagram` to inline SVG |
| `llms.js` | the byte layout of `/llms.txt`, kept to compare with the engine's bytes |
| `check.js` | the gate: two identical builds equal to the committed `www/` (built at the commit the output's content version names, when only `www/` changed since: `built-commit.js`), the llms vectors, the discovery document at Levels 0 and 2, the vocabulary documents against the engine's generator taken from the same specification source as the build (the tag, or the working tree), the vocabulary copies under `/ns/<version>/` (each frozen copy by the SHA-256 of its four files), links, the chunk anchors (`chunk-anchors.js`), the diagram geometry (no arrow through a box or over a label), headers, contrast, the page tools, the content checks, the release checks, the graph explorer (the vendored libraries by SHA-256, the SRI hash of each of its scripts, no host in its own code, the Content-Security-Policy of `/` and `/graph/` and of every other address), public hygiene |
| `check-content.js` | the content checks `check.js` runs on the built site, also runnable alone (`node scripts/check-content.js [www]`): the sentences and routes that must stay true for the version the site publishes, such as the board page in the sitemap and linked, the touch icon, the home page's mode cards and planned version, the start page's reader paths, the `Policy:` of `security.txt`, and what the host may add to the served pages |
| `check-release.js` | the release checks `check.js` runs on the built site, also runnable alone (`node scripts/check-release.js [www]`): no page calls a final specification version a release candidate, a site built from a tag dates the specification by the tag's day on every page (the specification pages, `/specs/`, the status row, `/legal/` and the citation line), the release task on the board is done once its version is tagged, the status page's rows agree with the engine (tool names, MCP revision, registry name, vocabulary counts, the conformance claim's heading) and carry exactly the three planned rows, and the releases feed `/changelog.xml` is well-formed RSS 2.0 with one item per release tag, named in every page head and served with its content type |
| `release-feed.js` | writes `/changelog.xml` from the engine's release tags and change log, with the five to ten summary lines of each release written in this file; a tag with no summary stops the build; tests in `release-feed.test.js` |
| `built-commit.js` | finds the commit a committed output was built from (the tag or the hash its content version names) and makes a scratch checkout of it, so `check.js` passes on the commit that holds its own `www/`; tests in `built-commit.test.js` |
| `chunk-anchors.js` | the in-page anchors of the chunk export: reads `/chunks.jsonl` (and its shards, when it is the manifest) and checks that every chunk has its item page and every chunk that begins with a heading has its `#chunk-<16 hex>` anchor opening that heading, once; it also hands `build.js` the engine's AGSC-03-13 ids for an item body's headings (`headingIds`), so a heading such as `Foo/Bar` is `#foobar` on the page as in the chunk's `section`; `build.js` places the anchors with the engine's own functions and `check.js` runs this check; tests in `chunk-anchors.test.js` |
| `page-tools-check.js` | proves the seven page tools against the built site, with no browser |
| `graph-explorer.test.js` | tests of the graph explorer's data half, `assets/graph-data.js`: a `graph.jsonld` as nodes and links, the peers read from a discovery document, the merged picture with its peer and cross-node links, the tree, the tooltip's summary and its http(s)-only link, the loader over a fake fetch (a failing peer, a timeout, a copy served elsewhere, the caps of 16 peers per node and 10 MB per file, and the picture cut to 5,000 nodes and 10,000 links), the short description of a Source or a Bundle; no network |
| `live-check.mjs` | read-only check of both live nodes: served pages against the committed `www/`, response headers, no edge-network header the statements do not name, `security.txt` expiry, the sustainability report's month, the w3id redirects, the npm and PyPI versions, both released checkers at Level 2 with the mutual check; run weekly by `.github/workflows/live.yml`; tests on recorded responses in `live-check.test.mjs` |
| `community-files-check.mjs` | checks that the community files (`SECURITY.md`, `CONTRIBUTING.md`, the code of conduct, the issue and pull-request templates, the README) send a security report to private reporting first and name the `CA-v1` sign-off; `node scripts/community-files-check.mjs ../agsc-demo-node --repo andreibesleaga/agsc-demo-node` checks the demonstration node |
| `a11y.js` | optional: axe-core over every page in both colour schemes at a phone, a tablet and a desktop width (390, 768 and 1280 px), each file served with the headers `_headers` gives it (the `! Name` detach line included), CSP, third-party requests (the graph explorer's reads of the declared peer nodes are answered offline and counted apart; on `/` and `/graph/` axe runs once the explorer has marked itself `data-state="ready"`), keyboard checks; no sideways scroll, one left edge for the logo, the title, the summary, the first wide block and the footer (`assets/layout.css`), prose lines of 80 characters or fewer, no word split in a table cell |
| `shots.js`, `compare-baseline.js` | optional: screenshots, and the "the site still looks the same" comparison against a baseline kept outside the repository (`SITE_BASELINE_DIR`) |

```bash
node scripts/build.js && node scripts/check.js   # "check: pass" when everything holds
```

The tests of the helpers (no network; CI runs exactly this):

```bash
node --test scripts/built-commit.test.js scripts/live-check.test.mjs scripts/release-feed.test.js scripts/graph-explorer.test.js scripts/chunk-anchors.test.js
```

## Environment variables

| Variable | What it sets | Read by |
|---|---|---|
| `SITE_ENGINE` | the engine repository; default `../agentic-system-core` | `build.js`, `check.js`, `check-release.js`, `page-tools-check.js`, `chunk-anchors.test.js` |
| `SOURCE_DATE_EPOCH` | the build instant, in seconds; default the commit instant of the specification tag in the engine repository (its last commit when `SITE_SPEC_SOURCE` is `worktree`) | `build.js` |
| `SITE_SPEC_TAG` | the specification tag the site is built from; default `1.0.0` | `build.js`, `check.js`, `check-release.js` |
| `SITE_SPEC_SOURCE` | `tag` or `worktree`; default `tag` when the tag exists, else `worktree` | `build.js`, `check.js`, `check-release.js` |
| `SITE_PAGE_BUDGET` | a page-size budget below the default 100,000 bytes, to exercise the split of long pages; a larger value changes nothing | `build.js` |
| `CHROME_EXE` | the Chromium binary of the browser lanes | `a11y.js`, `shots.js` |
| `NODE_PATH` | where Node finds `playwright-core` and `axe-core`, installed outside the repository | `a11y.js`, `shots.js` (through Node's module lookup) |
| `SITE_A11Y_WWW` | another built node's output for the accessibility lane | `a11y.js` |
| `SITE_BASELINE_DIR` | the baseline kept outside the repository | `compare-baseline.js` |
| `SITE_LIVE_NODE_CHECKER`, `SITE_LIVE_PYTHON` | the released checkers: the npm package's `tools/validate-wellknown`, and a Python with the PyPI package | `live-check.mjs` |
