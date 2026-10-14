# `site/diagrams/` — diagram sources

**Summary.** The site's diagrams, written in a small deterministic language and compiled
by `scripts/diagram.js` into SVG that is inlined into the page, so it follows the page's
colour scheme. A source is the diagram's specification; the SVG is never committed.

**Read after:** [site/README.md](../README.md).

A source starts with `canvas <width> <height>`, a `label` (the accessible name) and a
`caption`, then `region`, `box` and `arrow` lines; exactly one element carries `acc`,
the highlight. `{{diagram:<id>}}` in a guide page inlines `<id>.diagram`; the
specification pages use the `spec-nn-*` sources. The gate checks that every diagram has
a name and a caption, and that no arrow runs through a box, or over a label, that it does
not start or end at: route such an arrow round with `via=x,y` (one bend) or
`via=x1,y1;x2,y2`, or move the boxes. A `#` after a space starts a comment, even inside
quotes, so a label never contains one.
