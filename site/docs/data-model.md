---
title: "Data model"
summary: "Six kinds of item, one file shape, fourteen typed links, clusters for navigation, sources for evidence and a provenance record on everything: this is the whole vocabulary a node needs."
description: "The AgenticSystemCore data model: the six item types, Concept kinds, the fourteen link keys and their inverses, clusters, sources, provenance and status."
---

{{diagram:data-model}}

## One file shape

An item is one Markdown file with a YAML header between `---` lines (AGSC-02-01). The YAML is a small, safe subset: no anchors, no aliases, no tags, no flow mappings (AGSC-02-02). The body is CommonMark; headings become anchors and, for the chunk export, cut points; fenced code stays code (AGSC-02-20). Lengths are counted in Unicode code points (AGSC-02-24). Unknown keys are kept and reported as warnings, never errors (AGSC-02-05).

## The six types

| Type | What it records | Notes |
|---|---|---|
| Concept | A unit of knowledge | Qualified by `kind`: `pattern`, `taxonomy`, `explainer`, `principle`, `decision`, `spec`, `task`, `term` (AGSC-02-12) or, since rc.3, `architecture` (AGSC-02-97) |
| Episode | Something that happened: a session, a run, an incident | Start, actor, outcome |
| Procedure | Steps a reader can run | Exports one-to-one to a skill file |
| Lesson | Knowledge distilled from one or more Episodes | Carries a severity; the set of Lessons is the node's error record |
| Cluster | A navigational grouping | Membership is authored on the item; at most one parent, at most three levels (AGSC-03-08) |
| Gate | Checks a change must pass | Compiles to CI status checks (AGSC-08-09); its runs are Episodes |

There is deliberately no common `Item` class in the ontology; "item" is a term of the specification only (AGSC-00-05). Words like card, page, deck or note are never types (AGSC-00-08).

## The fourteen links

A link is a header key whose values are slugs of other items in the same Bundle; a link never crosses Bundles (AGSC-03-01, AGSC-03-02). Inverses are computed at build and never authored (AGSC-03-04).

| You write | The build adds | What it means | Effect in composition |
|---|---|---|---|
| `related` | `related` | Loosely connected | Advisory only |
| `broader` | `narrower` | Is a narrower topic of | None; no cycles |
| `narrower` | `broader` | Has this narrower topic | None; no cycles |
| `uses` | `used-by` | Draws on | Warn when the target is absent |
| `requires` | `required-by` | Cannot work without | Pulls the target in (closure); no cycles |
| `excludes` | `excludes` | Cannot be combined with | Invalidates a selection that has both |
| `derived-from` | `derivation-of` | Was derived from | None; target must exist |
| `contradicts` | `contradicts` | Asserts the opposite | Warn when both are selected |
| `supersedes` | `superseded-by` | Replaces | Hides the superseded item |
| `implements` | `implemented-by` | Realises a spec or a decision | None (Mode 2) |
| `verifies` | `verified-by` | Checks that something holds | None (Mode 2) |
| `covers` | `covered-by` | A test or document covering a requirement | None (Mode 2) |
| `blocked-by` | `blocks` | Cannot proceed until | None (Mode 2) |
| `decided-by` | `decides` | Was settled by a decision | None (Mode 2) |

An inline Markdown link between items becomes an untyped `mentions` edge, never a link key (AGSC-03-11). Foreign names such as `refines`, `alternative-to` or `composed-of` are mapped on import, not added to the vocabulary (AGSC-03-19).

## Sources and reviews

A source is an inline `sources[]` entry: a resource address, an optional title and an evidence grade, primary, secondary or tertiary (AGSC-02-10). A review is a `verified[]` entry added by a person, with who and when (AGSC-08-03). Neither has a file of its own; both become nodes in the graph so they can be reached from their item (AGSC-05-14, AGSC-05-15).

## Provenance

Every item carries `prov` with an origin (`human`, `ai-assisted`, `ai-generated` or `imported`) and an operator, the person accountable for it, of the form `human:<id>` (AGSC-02-07, AGSC-08-01). When a model wrote or helped write an item, the agent and the model are recorded too. The commit and the reviewer are derived at build from git history and from `verified[]`, never written into the file (AGSC-08-02).

## Status

`draft`, `stable`, `deprecated` and, since rc.3, `retired`. A retired item keeps its page and its address and leaves every export (AGSC-11-22). Slugs are never reused; a renamed or superseded slug produces a redirect (AGSC-06-04).

## Added at rc.3

Items may declare ports, `produces` and `consumes` type names, that the combiner wires (AGSC-02-96); a Concept of kind `architecture` stores a selection the combiner re-runs (AGSC-02-97); items may carry attachments under a safety allow-list, and a pattern's images must be SVG (AGSC-02-98); a task may carry one of the nine Agent2Agent task states verbatim (AGSC-02-99).

Rules: [AGSC-02](/specs/02-item/), [AGSC-03](/specs/03-links/), [AGSC-05](/specs/05-graph/). Terms: the [glossary](/docs/glossary/) and the [ontology](/ns/).
