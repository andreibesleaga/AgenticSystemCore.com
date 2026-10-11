---
type: concept
title: "Release version 1.0.0 of the specification"
description: "The items recorded against the release candidates were applied, the whole vector set was run with the reference engine, and version 1.0.0 was tagged, with the reference engine's own conformance claim."
kind: task
task_state: TASK_STATE_COMPLETED
tags: [specification, procedure]
clusters: [project-board]
prov:
  origin: ai-assisted
  agent: "Claude Code"
  model: "Claude (Anthropic)"
  operator: "human:andreibesleaga"
sources:
  - resource: "https://agenticsystemcore.com/specs/10-implementation-profiles/#AGSC-10-05"
    title: "AGSC-10-05"
    grade: primary
  - resource: "https://agenticsystemcore.com/specs/00-overview/#AGSC-00-16"
    title: "AGSC-00-16"
    grade: primary
---

Version 1.0.0 of the specification was released and tagged, and with it the reference engine published its own conformance claim: a claim needs a green run of that Level's whole vector set at a released version, which a release candidate is not (AGSC-10-05).

## What done means

- Every item recorded against the release candidates is either applied, with a dated amendment note on each changed rule, or moved to a later version with a reason.
- A vector found wrong is withdrawn and replaced by a new one, never edited (AGSC-00-16).
- The reference engine passes every required vector of the Level-3 set, and the report is published with the claim.
- The specification's tag and the engine's tag are pushed on one commit by the maintainer.

## Who does it

The maintainer decides and tags. Anyone may propose a correction to a rule through the forge; an agent may prepare a proposal, and a person reviews it.
