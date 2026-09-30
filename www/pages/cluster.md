---
type: concept
title: Cluster
description: A navigational grouping of items. Membership is authored on the item, and nesting is expressed as membership.
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
  - resource: https://agenticsystemcore.com/specs/02-item/#AGSC-02-17
    title: AGSC-02-17
    grade: primary
  - resource: https://agenticsystemcore.com/specs/02-item/#AGSC-02-19
    title: AGSC-02-19
    grade: primary
  - resource: https://agenticsystemcore.com/specs/05-graph/#AGSC-05-18
    title: AGSC-05-18
    grade: primary
  - resource: https://agenticsystemcore.com/specs/05-graph/#AGSC-05-19
    title: AGSC-05-19
    grade: primary
---

A **Cluster** groups items for navigation. Membership is authored on the item, in `clusters[]`, never on the cluster file; the first cluster listed is the item's primary cluster.

In the graph a Cluster is an `asc:Cluster`, a subclass of `skos:Collection`, and membership is `skos:member`. A cluster may name at most one parent with `broader`, which is exported as membership of the parent, never as `skos:broader`.
