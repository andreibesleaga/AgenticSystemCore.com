# AgenticSystemCore.com

The source of **agenticsystemcore.com**, the first public AgenticSystemCore node: the
specification's own pages and plain-language guide, and a small Bundle of vocabulary
Concepts, Clusters, one procedure and the project's own board. It is a node of the
specification it publishes: its discovery document, graph, text files for agents, skill
packs, boards and ledger are written by the reference engine, and the site is checked at
Level 2 before every publish. Cloudflare Pages serves the static files.

**Who this is for:** a contributor to the site's content or its generator. Readers of
the site want [the site itself](https://agenticsystemcore.com); implementers want the
[engine repository](https://github.com/andreibesleaga/agentic-system-core).

## How it is built

`scripts/build.js` writes the HTML pages (their look is the engine's default theme,
`assets/site.css`) and hands the Bundle to the engine (`scripts/engine.js`), which writes
every machine file whose bytes a rule pins. It reads the engine repository checked out
beside this one — `spec/`, `docs/`, `features/`, `ontology/` — from the working tree
until the specification's tag exists, and says which in its first output line.
[docs/BUILD.md](docs/BUILD.md) has the picture.

```bash
node scripts/build.js      # writes build.out (www/)
node scripts/check.js      # the gate: reproducible build, llms vectors, discovery at Level 2,
                           # links, headers, contrast, page tools, public hygiene
```

Needs Node 22.13 or later and the engine repository at `../agentic-system-core` (or
`SITE_ENGINE=<path>`), with its `npm ci` done. `SOURCE_DATE_EPOCH` fixes the build
instant; without it the instant comes from the last commit.

Optional browser lanes, with `playwright-core` and `axe-core` installed **outside** this
repository (see each file's header):

```bash
NODE_PATH=<dir>/node_modules CHROME_EXE=<chromium> node scripts/a11y.js   # both colour schemes at 390, 768 and 1280 px, 0 violations expected
node scripts/page-tools-check.js                                        # the seven page tools, no browser needed
```

## Where things are

| Folder | What it holds |
|---|---|
| [content/](content/README.md) | the Bundle's items: vocabulary Concepts, Clusters, a procedure, the project board |
| [site/](site/README.md) | the authored pages that are not items: the guide, about, privacy, the profile page, diagrams, summaries |
| [scripts/](scripts/README.md) | the generator, the gate and the optional lanes |
| [assets/](assets/README.md) | the stylesheet (the engine's default theme, byte for byte), the search script, the icon, as SVG and as the 180-pixel PNG touch icon |
| [docs/](docs/README.md) | how the site is built, with a diagram |
| `www/` | the built site, committed; Cloudflare Pages serves it as is |

## Two switches

- **Output directory.** `build.out` in `agsc.config.json` is `www`, the folder Cloudflare
  Pages publishes: a push to `main` publishes the site. Rebuild and run the gate before
  every commit.
- **The patterns node.** `"x-patterns-node": false` in `agsc.config.json` drops the peer
  link and the sentences that name the second node; `true` (or absent) keeps them.

## Contributing

Edit `content/` or `site/`, never the built output. Every page carries a "Propose an edit"
link to its source file here; a change arrives as a pull request, the gate runs, and a
person merges it. [CONTRIBUTING.md](CONTRIBUTING.md) says how, and the
[code of conduct](CODE_OF_CONDUCT.md) applies. Security reports go to this repository's
private vulnerability reporting, as [SECURITY.md](SECURITY.md) says, never to a public issue.

By contributing you sign off under the contributor agreement of the format,
`CONTRIBUTOR-AGREEMENT` in the engine repository (token `CA-v1`): you keep the copyright
in your text and grant the maintainer a non-exclusive licence to publish it here and in
other collections and editions the maintainer makes from this node's items; you may
choose, contribution by contribution, to assign it instead. Your name stays on the item.

## How this is made

This work is written and maintained by Andrei N. Besleaga with the help of AI
assistants. A person decides what is written, an assistant drafts and checks it, and a
person reads, edits and approves everything that is published and answers for it. Every
published item records how its text was made and names the person accountable for it.
Written with AI assistance, reviewed and published by a person.
The assistance covered text, code, figures and diagrams alike. No model runs on the site,
in its build or in its checks. What an assistant or agent writes from this work is its
own output, not a statement by the author.

## What this does not claim

This is the independent work of one person, published as it is, with no warranty of any
kind and no liability for anything that follows from using it. Nothing in it is legal or
professional advice. No standards body, foundation, company or institution named in this
repository has reviewed, approved or is connected with this work, and it is not a document
of the IETF, of the W3C or of any other body. Other product and organisation names are the
marks of their owners and are used only to say what is being talked about.
Every right not expressly granted by the licences is reserved, and nothing here promises
that the work or its addresses will stay available.

## Notice

AgenticSystemCore™ is a trademark of Andrei N. Besleaga. Other names belong to their owners.

---

© 2026 Andrei N. Besleaga. Code: Apache-2.0 (`LICENSE`). Schemas, ontology, identifiers and
the discovery document: CC0-1.0. Prose: the Content Use Terms in `LICENSE-CONTENT`.
