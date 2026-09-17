---
type: concept
title: "Harness"
description: "Generated output: the file map a valid composition of selected items produces. A Harness is never authored."
kind: term
tags: [vocabulary, specification]
clusters: [vocabulary]
prov:
  origin: ai-assisted
  operator: "human:andreibesleaga"
sources:
  - resource: "https://agenticsystemcore.com/specs/00-overview/#AGSC-00-06"
    title: "AGSC-00-06"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/07-composition/#AGSC-07-01"
    title: "AGSC-07-01"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/07-composition/#AGSC-07-12"
    title: "AGSC-07-12"
    grade: primary
---

A **Harness** is generated output. A composition takes an ordered selection of item slugs and the resolved graph and produces a verdict plus a Harness: exactly seven files, written outside `content/`, that describe a system built from the selected items: a JSON-LD record of the selection and its closure, a context file for agents, a Structurizr model, a Mermaid diagram, an arc42 skeleton, one decision record per selected item and one skill file per selected Procedure.

In agentic systems the word *harness* names the frame an agent runs inside: the scaffolding that embeds the agents and dictates the rules they follow. The specification uses the word in that sense, with one precision: a Harness here is that frame written down as files, not the running process. A runtime such as GABBE, kaiban-distributed, CrewAI or LangGraph renders the seven files into its own form and executes them; those renderings are never part of the Harness itself. In the ontology a Harness is a plan (`asc:Harness`, a kind of `prov:Plan`).

A composition needs no network, key or server. A Harness is never authored and never stored as an item, and an invalid composition yields no Harness at all.
