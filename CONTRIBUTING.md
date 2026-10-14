# Contributing

This repository is the source of agenticsystemcore.com. Its own content is the
Bundle's items in `content/` and the authored pages in `site/`; the specification,
the guides it renders from the engine's `docs/`, the scenarios and the vocabulary come
from the [engine repository](https://github.com/andreibesleaga/agentic-system-core),
and a correction to those is proposed there, as its
[CONTRIBUTING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/CONTRIBUTING.md)
describes.

## Proposing a change

Edit `content/` or `site/`, never the built output in `www/`. Every page carries a
"Propose an edit" link to its source file in this repository. A change arrives as a
pull request, the gate runs, and a person merges it. Before you open one, with the
engine checked out beside this repository and its `npm ci` done:

```bash
node scripts/build.js && node scripts/check.js   # "check: pass" when everything holds
```

For an item, keep its provenance (`prov`) honest: it says how the text was made and
names the person accountable for it. For anything larger than a correction, describe
the change in an issue first.

## Signing off

An outside contribution, a commit from anyone other than the maintainer, signs off
under the contributor agreement `CA-v1`, the file
[`CONTRIBUTOR-AGREEMENT`](https://github.com/andreibesleaga/agentic-system-core/blob/main/CONTRIBUTOR-AGREEMENT)
in the engine repository. Read it before your first commit. Each commit message ends
with a line of this shape:

```
Signed-off-by: Ada Lovelace <ada@example.org> (CA-v1)
```

`git commit -s` writes the first part of that line; add ` (CA-v1)` at its end. The
maintainer's own commits are exempt. You keep the copyright in your text and grant the
maintainer a non-exclusive licence to publish it here and in other collections and
editions the maintainer makes from this node's items; you may choose, contribution by
contribution, to assign it instead. A contribution to prose also certifies that you may
submit it under the Content Use Terms in `LICENSE-CONTENT`, whose clause 5 covers
contributions. The engine's CONTRIBUTING.md, "Signing off", says what the agreement
means.

Your name, the address you commit under and your sign-off become part of this
repository's public history and of the change ledger the site publishes. If you would
rather not publish an address, GitHub's `users.noreply.github.com` address works.

## Conduct and security

The [code of conduct](CODE_OF_CONDUCT.md) applies everywhere the project is
represented. A security problem is never an issue or a pull request: report it
privately, as [SECURITY.md](SECURITY.md) says.
