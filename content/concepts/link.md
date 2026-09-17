---
type: concept
title: "Link"
description: "A typed relation between two items of one Bundle, written as a frontmatter key whose values are slugs."
kind: term
tags: [vocabulary, specification]
clusters: [vocabulary]
prov:
  origin: ai-assisted
  operator: "human:andreibesleaga"
sources:
  - resource: "https://agenticsystemcore.com/specs/03-links/#AGSC-03-01"
    title: "AGSC-03-01"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/03-links/#AGSC-03-02"
    title: "AGSC-03-02"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/11-boundary/#AGSC-11-12"
    title: "AGSC-11-12"
    grade: primary
---

A **Link** is a typed relation between two items of the same Bundle. It is written as a frontmatter array under one of fourteen keys: the nine core keys `related`, `broader`, `narrower`, `uses`, `requires`, `excludes`, `derived-from`, `contradicts` and `supersedes`, and the five Mode-2 keys `implements`, `verifies`, `covers`, `blocked-by` and `decided-by`.

Each value is a slug. A Link never crosses Bundles: a reference to another node is a citation in `sources[]`.
