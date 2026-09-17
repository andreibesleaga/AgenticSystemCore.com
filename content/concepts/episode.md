---
type: concept
title: "Episode"
description: "A recorded occurrence, such as a session, a run or an incident, with a start instant, an actor and an outcome."
kind: term
tags: [vocabulary, specification]
clusters: [vocabulary]
prov:
  origin: ai-assisted
  operator: "human:andreibesleaga"
sources:
  - resource: "https://agenticsystemcore.com/specs/02-item/#AGSC-02-14"
    title: "AGSC-02-14"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/05-graph/#AGSC-05-12"
    title: "AGSC-05-12"
    grade: primary
---

An **Episode** records something that happened: a session, a run or an incident. It carries `started`, `actor` and an `outcome` of `success`, `partial` or `failure`, and may carry `ended`, `refs[]` and token accounting in `usage{}`.

In the graph an Episode is an `asc:Episode`, a subclass of `prov:Activity`. Knowledge distilled from Episodes is written as a Lesson.
