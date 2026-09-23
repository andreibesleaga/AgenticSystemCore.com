---
type: concept
title: Source
description: An external work cited by an item, written inline as a sources[] entry and published under a fragment IRI.
kind: term
tags:
  - vocabulary
  - specification
clusters:
  - vocabulary
prov:
  origin: ai-assisted
  operator: human:andreibesleaga
sources:
  - resource: https://agenticsystemcore.com/specs/02-item/#AGSC-02-10
    title: AGSC-02-10
    grade: primary
  - resource: https://agenticsystemcore.com/specs/05-graph/#AGSC-05-14
    title: AGSC-05-14
    grade: primary
---

A **Source** is an external work an item cites. It has no file of its own: it is written inline as an entry of `sources[]`, whose `resource` is a web URL or a channel identifier.

In the graph each entry becomes an `asc:Source`, a subclass of `prov:Entity`, at the IRI `<item-IRI>#source-<n>`, and the item points to it with `asc:source`.
