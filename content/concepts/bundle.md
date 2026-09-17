---
type: concept
title: "Bundle"
description: "One directory tree of Markdown items plus exactly one agsc.config.json: the unit of publication and of conformance."
kind: term
tags: [vocabulary, specification]
clusters: [vocabulary]
prov:
  origin: ai-assisted
  operator: "human:andreibesleaga"
sources:
  - resource: "https://agenticsystemcore.com/specs/00-overview/#AGSC-00-04"
    title: "AGSC-00-04"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/01-bundle/#AGSC-01-01"
    title: "AGSC-01-01"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/01-bundle/#AGSC-01-04"
    title: "AGSC-01-04"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/05-graph/#AGSC-05-03"
    title: "AGSC-05-03"
    grade: primary
---

A **Bundle** is one directory tree of Markdown items plus exactly one `agsc.config.json`. It is the unit of publication and the unit of conformance: one repository is one Bundle.

Items live at `content/<type-plural>/<slug>.md`. The Bundle root document, `content/index.md`, carries `spec_version`, `okf_version`, `title`, `description` and `base`, and is not itself an item. The Bundle IRI is the site base followed by `/`, and in the graph the Bundle is an `asc:Bundle`, the concept scheme every Concept is in.
