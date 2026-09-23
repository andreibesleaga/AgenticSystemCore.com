---
type: concept
title: Item
description: One Markdown file with YAML frontmatter whose type is concept, episode, procedure, lesson, cluster or gate.
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
  - resource: https://agenticsystemcore.com/specs/00-overview/#AGSC-00-05
    title: AGSC-00-05
    grade: primary
  - resource: https://agenticsystemcore.com/specs/01-bundle/#AGSC-01-11
    title: AGSC-01-11
    grade: primary
  - resource: https://agenticsystemcore.com/specs/02-item/#AGSC-02-07
    title: AGSC-02-07
    grade: primary
  - resource: https://agenticsystemcore.com/specs/05-graph/#AGSC-05-13
    title: AGSC-05-13
    grade: primary
---

An **item** is one `.md` file with YAML frontmatter whose `type` is one of `concept`, `episode`, `procedure`, `lesson`, `cluster` or `gate`.

"Item" is a term of the specification only: the ontology has no common superclass for the six types, because an Activity is not an Entity. Every item carries `type`, `title` and `prov`; its slug is the file stem and the last path segment of its IRI, and a slug is permanent.
