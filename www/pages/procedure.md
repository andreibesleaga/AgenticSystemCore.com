---
type: concept
title: Procedure
description: "A plan a reader can execute: a trigger, steps and checks. A procedure exports one to one to a skill file."
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

A **Procedure** is a plan a reader can execute. It may carry `when`, a one-line trigger that becomes the description of its exported skill file, and `inputs[]`; its body uses the headings `When`, `Steps` and `Checks`.

In the graph a Procedure is an `asc:Procedure`, a subclass of `prov:Plan`.
