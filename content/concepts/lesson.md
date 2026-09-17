---
type: concept
title: "Lesson"
description: "Knowledge distilled from one or more episodes, carrying a severity of info, warn or block."
kind: term
tags: [vocabulary, specification]
clusters: [vocabulary]
prov:
  origin: ai-assisted
  operator: "human:andreibesleaga"
sources:
  - resource: "https://agenticsystemcore.com/specs/02-item/#AGSC-02-16"
    title: "AGSC-02-16"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/02-item/#AGSC-02-21"
    title: "AGSC-02-21"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/05-graph/#AGSC-05-12"
    title: "AGSC-05-12"
    grade: primary
---

A **Lesson** is knowledge distilled from one or more Episodes. It carries a `severity` of `info`, `warn` or `block` and should name the Episode it derives from; its body uses the headings `Lesson`, `Evidence` and `Check before`.

In the graph a Lesson is an `asc:Lesson`, a subclass of `asc:Concept`: failure knowledge is kept as items, not in a separate error file.
