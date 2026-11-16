# `site/webaiassist/` — the WebAIAssist pages

**Summary.** The page of the WebAIAssist browser extension (`index.md`, `/webaiassist/`) and
five pages under it. `scripts/build.js` turns each `.md` file here into a page; this README is
skipped.

**Read after:** [site/README.md](../README.md).

| File | Page | Source |
|---|---|---|
| `index.md` | `/webaiassist/` | written here, from the extension's `README.md` |
| `on-a-node.md` | `/webaiassist/on-a-node/` | written here: what the extension does on an AgenticSystemCore node |
| `what-is-webmcp.md` | `/webaiassist/what-is-webmcp/` | mirror of the extension's `docs/WHAT-IS-WEBMCP.md` |
| `what-the-extension-reads.md` | `/webaiassist/what-the-extension-reads/` | mirror of `docs/WHAT-THE-EXTENSION-READS.md` |
| `standards.md` | `/webaiassist/standards/` | mirror of `docs/STANDARDS.md` |
| `privacy.md` | `/webaiassist/privacy/` | mirror of `docs/PRIVACY.md`, with a "last updated" line; this is the public privacy address for the store listing |

`img/` holds the ten pictures of the extension page, copied from the extension's `docs/images/`: three
(`real-*.png`) from the maintainer's real run of 16 Nov 2026, and seven taken by its browser tests with a
scripted model; `scripts/build.js` lists them with their alt texts, and
`scripts/check.js` accepts only this folder of pictures.

The mirrors keep the extension's text. Only the title block and the links change: links to
the other mirrored pages point here, and links to documents that are not mirrored lose
their link and keep their words. When the extension's document changes, copy it again.

The releases and issues links are written there as https://repo.invalid; the build replaces that with the constant
`WEBAIASSIST_REPO` in `scripts/build.js`; the owner confirms it at release. No link to a
Chrome Web Store listing exists until the listing is live.
