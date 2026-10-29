# AGENTS.md — orientation for AI agents and coding assistants

This file is for an agent working in this repository. People may read it too; the human
front door is [README.md](README.md). Where this file and the README differ, the README
wins; report the difference.

## What this repository is

The source of **agenticsystemcore.com**, a static site and a node of the specification it
publishes. The specification, the guides that come from the engine's `docs/` and the
vocabulary live in the engine repository (`andreibesleaga/agentic-system-core`), checked
out beside this one at `../agentic-system-core` with its `npm ci` done. Folders:

- `content/` the Bundle's items; `site/` the authored pages, diagram sources and the agent
  skill; `assets/` and `static/` files the build copies; `scripts/` the generator, the
  gate and the optional lanes; `docs/` how the site is built and what CI runs.
- `www/` the built site, committed. It is output, not source.

## How to check your work

From the repository root, with Node 22.13 or later:

```bash
node scripts/build.js && node scripts/check.js   # "check: pass" when everything holds
node scripts/page-tools-check.js                 # the seven page tools, no browser
node --test scripts/built-commit.test.js scripts/live-check.test.mjs scripts/release-feed.test.js scripts/graph-explorer.test.js scripts/chunk-anchors.test.js
node ../agentic-system-core/tools/public-hygiene .   # nothing private or forbidden is public
```

`node scripts/build.js` rewrites `www/`. Do not include that in a source change: the
maintainer rebuilds `www/` and commits it on its own ([docs/BUILD.md](docs/BUILD.md),
"Committing the output").

## Rules

- Edit `content/`, `site/`, `scripts/`, `assets/` or `static/`; never `www/` by hand.
- `assets/site.css` is the engine's default theme byte for byte; the vendored libraries in
  `assets/vendor/` are pinned by SHA-256 in `scripts/check.js`. Never edit either alone.
- Never edit a signed file in `static/` or a frozen vocabulary copy in `static/ns/`
  ([static/README.md](static/README.md)).
- An item's `prov` says how its text was made and names the person accountable for it.
- A security problem is reported privately, as [SECURITY.md](SECURITY.md) says, never in an
  issue or a pull request. Put no secret, token or personal address in any file.
- Do not run `git commit`, `git push` or `git tag` unless the person who asked you to
  work here tells you to. Outside contributions sign off under `CA-v1`
  ([CONTRIBUTING.md](CONTRIBUTING.md)).
