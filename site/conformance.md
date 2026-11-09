A conformance claim says that an implementation produces the bytes the specification's test cases expect, for one version of the specification and one Level. This page says what a claim contains, how many cases the specification this site publishes has, which claims this project makes, and where anyone can record a claim of their own. The rules are in [section 9](/specs/09-conformance/) and [section 10](/specs/10-implementation-profiles/) of the specification; the engine repository's [guide to writing a claim](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONFORMANCE-STATEMENTS.md) gives the sentence to use.

## What a claim says

A claim names the implementation and its version, the version of the specification, exactly one Level, and the cases it passed (AGSC-00-12, AGSC-09-01, AGSC-10-01). The Levels build on each other:

- **Level 0, publisher:** a node's static files — the discovery document, `graph.jsonld` and `llms.txt` (AGSC-10-02).
- **Level 1, reader:** Level 0 and the parsing and checking of any conforming Bundle (AGSC-10-03).
- **Level 2, writer:** Level 1 and the deterministic writing of every surface, with export and import (AGSC-10-04).
- **Level 3, full engine:** Level 2 and composition, governance, the command line and the tool server (AGSC-10-05).

A claim exists only after a green run of its Level's cases. It is its author's own assertion: this project certifies nobody, and a claim says nothing about security, speed or correctness beyond the bytes the cases compare (AGSC-09-03).

## The cases

{{counts}}

## The reference engine's claim

{{claim}}

## The nodes this project runs

{{nodes}}

## Record a claim of your own

Run the cases with the reference engine's runner, `agsc conform --level <n>`, or with a runner of your own: the cases define the expected bytes and nothing else, so either is valid, and nobody needs permission to run them or to publish the result. Then open an issue in the [engine repository](https://github.com/andreibesleaga/agentic-system-core/issues) with a link to your software or node, the version and Level you claim, and your results. The issue records what was checked, by whom and on what date, and it records failures as readily as passes. Being recorded is not a certification and confers nothing.
