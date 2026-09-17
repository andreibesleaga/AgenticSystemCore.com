---
type: concept
title: "Concept"
description: "A unit of knowledge in a Bundle, qualified by kind: pattern, taxonomy, explainer, principle, decision, spec, task, term or architecture."
kind: term
tags: [vocabulary, specification]
clusters: [vocabulary]
prov:
  origin: ai-assisted
  operator: "human:andreibesleaga"
sources:
  - resource: "https://agenticsystemcore.com/specs/02-item/#AGSC-02-12"
    title: "AGSC-02-12"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/05-graph/#AGSC-05-12"
    title: "AGSC-05-12"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/05-graph/#AGSC-05-17"
    title: "AGSC-05-17"
    grade: primary
---

A **Concept** is a unit of knowledge in a Bundle. Its `kind` says what sort of knowledge it is: a pattern, a taxonomy, an explainer, a principle, a decision, a spec, a task, a term or an architecture.

In the graph a Concept is an `asc:Concept`, a subclass of `skos:Concept`, and carries `skos:inScheme` the Bundle, its title as `skos:prefLabel` and its description as `skos:definition`. Every term on this site is a Concept of kind `term`.
