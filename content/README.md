# `content/` — the Bundle

**Summary.** The knowledge items of this node, one Markdown file each with a YAML block
at the top, in one folder per item type, plus `index.md`, the Bundle's root document.
The generator and the engine build every item page, the graph, the text files for
agents, the skill packs and the boards from these files.

**Read after:** the repository [README](../README.md). The file format is the
specification's chapter on items (`spec/02-item.md` in the engine repository).

| Folder | What it holds |
|---|---|
| `concepts/` | the vocabulary terms (kind `term`) and the project's tasks (kind `task`) |
| `clusters/` | the groupings: the vocabulary, the guides and the project board |
| `procedures/` | step-by-step guides, published as skill packs |

A README is kept only at this level: a `README.md` inside a type folder would be read as
an item. Every item names its provenance (`prov`), two to five tags from the list in
`agsc.config.json`, and, for a concept, its `kind`. To change an item, edit its file and
run `node scripts/build.js && node scripts/check.js`; the page's "Propose an edit" link
opens the same file on the forge.
