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
| `check.js` | the gate: two identical builds, the llms vectors, the discovery document at Levels 0 and 2, the vocabulary documents against the engine's generator taken from the same specification source as the build (the tag, or the working tree), the vocabulary copies under `/ns/<version>/` (each frozen copy by the SHA-256 of its four files), links, headers, contrast, the page tools, the content checks, public hygiene |
| `check-content.js` | the content checks `check.js` runs on the built site, also runnable alone (`node scripts/check-content.js [www]`): the sentences and routes that must stay true for the version the site publishes, such as the board page in the sitemap and linked, the touch icon, the home page's mode cards and planned version, the start page's reader paths, the `Policy:` of `security.txt`, and what the host may add to the served pages |
| `page-tools-check.js` | proves the seven page tools against the built site, with no browser |
| `community-files-check.mjs` | checks that the community files (`SECURITY.md`, `CONTRIBUTING.md`, the code of conduct, the issue and pull-request templates, the README) send a security report to private reporting first and name the `CA-v1` sign-off; `node scripts/community-files-check.mjs ../agsc-demo-node --repo andreibesleaga/agsc-demo-node` checks the demonstration node |
| `a11y.js` | optional: axe-core over every page in both colour schemes at a phone, a tablet and a desktop width (390, 768 and 1280 px), each file served with the content type `_headers` gives it, CSP, third-party requests, keyboard checks; no sideways scroll, prose lines of 80 characters or fewer, no word split in a table cell |
| `shots.js`, `compare-baseline.js` | optional: screenshots, and the "the site still looks the same" comparison against a baseline kept outside the repository (`AGSC_SITE_BASELINE`) |

```bash
node scripts/build.js && node scripts/check.js   # "check: pass" when everything holds
```
