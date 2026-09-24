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

Most rules end with a bracketed note such as `[PRD-002]` or `[PRD-022, RFC 9264]`. It is the rule's traceability record: the requirement the rule serves and, where there is one, the external document it follows. It is shown small and grey on this site because it is not part of what the rule requires. Its parts are:

| Form | Meaning | Where to find it |
|---|---|---|
| `PRD-nnn`, `NFR-nn` | A product requirement, or a non-functional requirement, in EARS form | Published on the [requirements page](/docs/requirements/); the identifiers link there |
| `OKF v0.2`, `RFC 9264`, `A2A §8.4` | An external document the rule follows | The [standards page](/docs/standards/) lists each with its version and the date it was checked |
| `design` | The rule records a design choice of this specification rather than a requirement or an external document | The rule text itself |

Earlier release candidates also carried, in these notes, identifiers of the editors' internal working records — decisions, review findings and research memos. They were removed from the text of the current candidate; the earlier tagged candidates keep them unchanged, because a tag never moves. A reader who wants to implement the specification needs none of them: the rule text, the schemas, the ontology and the vectors are complete on their own (AGSC-00-01).

## Drafted rules

When a next release candidate is being drafted in the engine repository, its identifiers are shown here with a dotted underline and no link until it is tagged and published; none are pending now.

## Retired rules

A rule marked *(retired at rc.3 or rc.4 …)* was found to say nothing that another rule did not already say, and was merged into that rule. Its identifier is kept and never reused, so that older citations still resolve, and the note says where its content now lives. Retired rules impose nothing.

## Amendments

A rule marked *(added at rc.3 …)*, *(amended at rc.3 …)*, *(added at rc.4 …)* or *(amended at rc.4 …)* changed at the third or the fourth release candidate, and the note names the decision behind it. Released sections are immutable: a change ships as a new version (AGSC-00-16).

## Error codes

Every failure a conforming tool reports has a code of the form `AGSC-E<nnn>`, and each code has exactly one row in the [registry](/specs/09-conformance/#section-9-4) naming the rule that raises it. The hundreds digit is the area: 0 command line, 1 parsing, 2 schema, 3 links, 4 lint, 5 provenance and adoption, 6 determinism, 7 ledger, 8 composition, 9 input, output and federation.

## Vectors

A vector is one JSON file with an input and an expected result, proving one rule (AGSC-09-04). Vectors are grouped by area; a required vector that is skipped counts as a failure; a withdrawn vector is kept for history and never run. Vectors are what a conformance claim asserts.

## Levels

An implementation claims exactly one Level: 0 publisher, 1 reader, 2 writer, 3 full engine (AGSC-10-01). Each Level names the areas of vectors it must pass (AGSC-10-02 to AGSC-10-05), and each contains the one below. This site claims Level 0.

{{diagram:levels}}

## The plain-language boxes

Each section page opens with a summary and a box headed *In plain language*. Those explain; they never decide. Where a box and a rule disagree, the rule is right and the box is wrong. The diagrams are drawn from the rules and are informative in the same way.

## Finding things

The [search](/search/) indexes every page and every rule, so a search for `digest` finds the rules that use the word as well as the pages that explain it. The [glossary](/docs/glossary/) lists every term, and the [ontology page](/ns/) every vocabulary term with its definition.
