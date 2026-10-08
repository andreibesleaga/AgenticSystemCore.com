---
type: concept
title: Procedure
description: "A plan a reader can execute: a trigger, steps and checks. Procedures are published in skill packs, one pack per cluster."
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
  - resource: https://agenticsystemcore.com/specs/02-item/#AGSC-02-15
    title: AGSC-02-15
    grade: primary
  - resource: https://agenticsystemcore.com/specs/02-item/#AGSC-02-21
    title: AGSC-02-21
    grade: primary
  - resource: https://agenticsystemcore.com/specs/05-graph/#AGSC-05-12
    title: AGSC-05-12
    grade: primary
---

A **Procedure** is a plan a reader can execute. It may carry `when`, a one-line trigger saying when it applies, and `inputs[]`; its body uses the headings `When`, `Steps` and `Checks`. Procedures are published in skill packs, one pack per cluster holding the cluster's published items, and the pack takes its description from the cluster; a skill imported from elsewhere arrives as a Procedure whose `when` is that skill's description.

In the graph a Procedure is an `asc:Procedure`, a subclass of `prov:Plan`.
