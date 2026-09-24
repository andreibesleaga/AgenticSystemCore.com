# `scripts/` — the generator, the gate and the optional lanes

**Summary.** The programs that build and check this site. All of them use the Node
standard library and the engine checked out beside this repository; the browser lanes
need `playwright-core` and `axe-core` installed outside the repository.

**Read after:** the repository [README](../README.md) and [docs/BUILD.md](../docs/BUILD.md).

| File | What it does |
|---|---|
| `build.js` | writes every HTML page and hands the Bundle to the engine for the machine files |
| `engine.js` | runs the reference engine over this repository's Bundle |
| `diagram.js` | compiles `site/diagrams/*.diagram` to inline SVG |
| `llms.js` | the byte layout of `/llms.txt`, kept to compare with the engine's bytes |
| `check.js` | the gate: two identical builds, the llms vectors, the discovery document at Levels 0 and 2, links, headers, contrast, the page tools, public hygiene |
| `page-tools-check.js` | proves the seven page tools against the built site, with no browser |
| `a11y.js` | optional: axe-core over every page in both colour schemes, CSP, third-party requests, keyboard checks |
| `shots.js`, `compare-baseline.js` | optional: screenshots, and the "the site still looks the same" comparison against a baseline kept outside the repository (`AGSC_SITE_BASELINE`) |
| [legacy/](legacy/README.md) | the previous generator, frozen as a fallback |

```bash
node scripts/build.js && node scripts/check.js   # "check: pass" when everything holds
```
