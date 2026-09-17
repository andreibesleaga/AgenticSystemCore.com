---
title: "Reading the specification"
summary: "A key to the specification's notation: what the rule identifiers mean, how the key words MUST and SHOULD are used, what the small bracketed references at the end of each rule are, why some rules are marked retired, and how error codes, vectors and Levels fit together."
description: "How to read the AgenticSystemCore specification: rule identifiers, BCP 14 key words, the bracketed trace references, retired rules, error codes, test vectors and conformance Levels."
---

The specification is exact so that two implementers in two languages produce the same bytes. That exactness makes it dense. This page explains its conventions, so that the rule text can be read for what it says.

## Sections and rules

The specification has twelve sections, `AGSC-00` to `AGSC-11`, each a page under [/specs/](/specs/). Every rule has a stable identifier of the form `AGSC-<section>-<number>`, for example AGSC-03-01, which is the first rule of the links section. Identifiers are never reused or renumbered (AGSC-00-16). On this site every identifier is a link: click one to reach the rule, and copy the address to cite it.

## The key words

MUST, MUST NOT, REQUIRED, SHALL, SHOULD, SHOULD NOT and MAY are used as defined in BCP 14 (RFC 2119 and RFC 8174), and only when written in capitals. MUST is an obligation whose violation is non-conformance; SHOULD is a recommendation that may be set aside for a stated reason; MAY is a permission.

## The small bracketed references

Every rule ends with a bracketed note such as `[PRD-002 ← D41, G04, research/16 §3.3]`. It is the rule's traceability record: why the rule exists and where it came from. It is shown small and grey on this site because it is not part of what the rule requires. Its parts are:

| Form | Meaning | Where to find it |
|---|---|---|
| `PRD-nnn`, `NFR-nn` | A product requirement, or a non-functional requirement, in EARS form | Published on the [requirements page](/docs/requirements/); the identifiers link there |
| `Dnn`, `D41(4)` | A numbered decision of the project's decision register, sometimes with a sub-item | The editors' internal working record; not published |
| `Rnn`, `Gnn`, `Vn-nn`, `AR2-nn`, `SO-nn`, `Mn`, `Un` | Findings of review, gap, verification, adversarial and minimality passes over earlier drafts | The editors' internal working record; not published |
| `audit/X §n`, `research/nn §n` | Sections of the project's audit and research memos | The editors' internal working record; not published |
| `Art. XI` | An article of the project's development constitution | The editors' internal working record; not published |
| `OKF v0.2`, `RFC 9264`, `A2A §8.4` | An external document the rule follows | The [standards page](/docs/standards/) lists each with its version and the date it was checked |

A reader who wants to implement the specification needs none of the internal references: the rule text, the schemas, the ontology and the vectors are complete on their own (AGSC-00-01). The references exist so that the editors can show, for every rule, what requirement it serves and which review put it there.

## Drafted rules

An identifier shown with a dotted underline and no link is drafted for the next release candidate in the engine repository and is not yet in the published specification; the [status page](/docs/status/) says what the draft adds. It becomes a link when that release candidate is tagged and published here.

## Retired rules

A rule marked *(retired at rc.3 …)* was found to say nothing that another rule did not already say, and was merged into that rule. Its identifier is kept and never reused, so that older citations still resolve, and the note says where its content now lives. Retired rules impose nothing.

## Amendments

A rule marked *(added at rc.3 …)* or *(amended at rc.3 …)* changed at the third release candidate, and the note names the decision behind it. Released sections are immutable: a change ships as a new version (AGSC-00-16).

## Error codes

Every failure a conforming tool reports has a code of the form `AGSC-E<nnn>`, and each code has exactly one row in the [registry](/specs/09-conformance/#section-9-4) naming the rule that raises it. The hundreds digit is the area: 0 command line, 1 parsing, 2 schema, 3 links, 4 lint, 5 provenance and adoption, 6 determinism, 7 ledger, 8 composition, 9 input, output and federation.

## Vectors

A vector is one JSON file with an input and an expected result, proving one rule (AGSC-09-04). Vectors are grouped by area; a required vector that is skipped counts as a failure; a withdrawn vector is kept for history and never run. Vectors are what a conformance claim asserts.

## Levels

An implementation claims exactly one Level: 0 publisher, 1 reader, 2 writer, 3 full engine (AGSC-10-01). Each Level names the areas of vectors it must pass (AGSC-10-02 to AGSC-10-05), and each contains the one below. This site claims Level 0.

## The plain-language boxes

Each section page opens with a summary and a box headed *In plain language*. Those explain; they never decide. Where a box and a rule disagree, the rule is right and the box is wrong. The diagrams are drawn from the rules and are informative in the same way.

## Finding things

The [search](/search/) indexes every page and every rule, so a search for `digest` finds the rules that use the word as well as the pages that explain it. The [glossary](/docs/glossary/) lists every term, and the [ontology page](/ns/) every vocabulary term with its definition.
