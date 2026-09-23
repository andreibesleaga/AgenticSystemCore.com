# The previous generator, frozen

This directory holds the site generator as it stood **before the reference engine built this
site** (SITE-4, 2026-09-23), so that the site can still be produced the old way while the new
build is being watched. It is a fallback, not a second generator to maintain.

Four files, copied from commit `7a4caa3` and not developed further:

| file | what it is |
|---|---|
| `build.js` | the whole generator: it reads the specification text from a **git tag** of the engine repository and writes every page and every machine file itself |
| `check.js` | the gate that went with it |
| `llms.js` | the byte layout of `/llms.txt` and `/llms-full.txt` as that generator wrote it |
| `diagram.js` | the diagram compiler that generator used |

One line was changed in `build.js` and in `check.js` when the copies were frozen: the repository
root is now two directories up instead of one, because the files moved one level deeper. Nothing
else was touched.

## What it does not do

It predates three pieces of work, so its output is **smaller** than the current one — 76 files and
52 pages, against 128 files and 62 pages:

* it has no page tools, no `/compose/` page and no `/pages/<slug>.md` or `.jsonld` item views;
* it writes the graph, the search index, `llms.txt` and the discovery document itself, rather than
  publishing the bytes the engine emits, so it has no `/graph.nq`, no `/graph.ttl`, no
  `/chunks.jsonl`, no skill packs, no `/now/`, no `/tags/` and no `/exports/`;
* it reads the specification only from a **tag**, and only from the tag whose `spec_version`
  matches `agsc.config.json`. Run against content that declares a later candidate than the tag
  does, it stops with `build: tag <tag> declares spec_version …, config says …` and writes
  nothing. That is the guard working, not a defect.

## Running it

Against a tag whose candidate the content declares:

```sh
AGSC_SPEC_TAG=<tag> node scripts/legacy/build.js --out www-legacy
```

To reproduce exactly the site that commit `7a4caa3` published, build that commit's own tree, which
also carries the configuration and the content of the time:

```sh
mkdir /tmp/site-old && git archive 7a4caa3 | tar -x -C /tmp/site-old
cd /tmp/site-old && AGSC_ENGINE=<path to the engine repository> node scripts/build.js
```

`--out` is honoured, and `www/` is never written by either copy unless `--out www` is asked for.

## When this directory goes

It is kept until **thirty days after launch** and then deleted, together with this README. Until
then, the live generator is `scripts/build.js`; the current gate is `node scripts/check.js`, and
`node scripts/compare-baseline.js` proves that the new build still looks like the old one.
