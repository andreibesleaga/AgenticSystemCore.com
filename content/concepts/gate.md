---
type: concept
title: "Gate"
description: "A declared set of checks that a change must pass, at level L1 or L2. Its runs are recorded as episodes."
kind: term
tags: [vocabulary, specification]
clusters: [vocabulary]
prov:
  origin: ai-assisted
  operator: "human:andreibesleaga"
sources:
  - resource: "https://agenticsystemcore.com/specs/02-item/#AGSC-02-18"
    title: "AGSC-02-18"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/05-graph/#AGSC-05-12"
    title: "AGSC-05-12"
    grade: primary
---

A **Gate** declares the checks a change must pass. It carries a `level` of `L1` (schema and links) or `L2` (which adds provenance, determinism and review), and may say how it is enforced.

In the graph a Gate is an `asc:Gate`, a subclass of `prov:Plan`; its runs are Episodes.
