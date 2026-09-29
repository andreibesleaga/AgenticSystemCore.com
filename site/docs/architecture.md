---
title: "Architecture"
summary: "The architecture of the reference implementation in the arc42 and C4 forms: quality goals, constraints, the system in its context, containers, five bounded contexts and their ports, the runtime sequences, deployment, the decisions of record and the threat model."
description: "arc42 and C4 architecture of AgenticSystemCore: quality goals, constraints, context, containers, bounded contexts, ports, runtime views, deployment, architecture decision records, quality lanes, risks and the STRIDE threat model."
---

This page restates the frozen architecture document of the project (its first architecture baseline, arc42 with C4 views and ISO 42010 correspondence rules) for readers who are not going to read the engine's source. It adds nothing to it. The architecture satisfies the [requirements](/docs/requirements/) and never overrides a rule of the [specification](/specs/); where this page and a rule disagree, the rule wins.

## 1. Quality goals, ranked

| # | Quality goal | Meaning here | Requirements |
|---|---|---|---|
| Q1 | Correctness and determinism | Byte-identical rebuilds on every operating system; every requirement has a test; the ledger re-verifies offline | NFR-03, NFR-04, NFR-05 |
| Q2 | Simplicity | Few, pinned, audited dependencies (C1 as amended below); one configuration file, at most three commands per feature, delete before adding | NFR-01, NFR-06 |
| Q3 | Agent safety | Published content is structurally data, never instruction; no agency is granted to text | NFR-07 |
| Q4 | Portability | Files and ontologies are the plane; any language reimplements from the specification and the vectors; offline on three operating systems | NFR-02, NFR-08, NFR-13 |
| Q5 | Cost near zero | No servers, no model on any gating lane, at most 10 dollars a month, visible on the NOW page | NFR-06, NFR-09, NFR-11 |

Two floors are never traded: the licence stack (NFR-10) and the clean-room rule (NFR-12).

## 2. Stakeholders

| Who | Primary concern |
|---|---|
| Human reader | Find a pattern with evidence; the site works without JavaScript |
| Human contributor | A legible, passable review gate with no hidden rules |
| Agent reader | Structured retrieval without scraping; trust labels on every result |
| Agent proposer, operator-signed | A write path that never pushes on its own |
| Architect | Closure and conflict explanations; a downloadable Harness |
| Integrator | Three install trees; inert skill packs |
| Project team (Mode 2) | Gates that become CI checks; a NOW page as working memory |
| Agent as memory (Mode 1) | Stable addresses, exports, offline verifiability |
| Owner as operator | A green site with zero maintenance and unattended crons |
| Port implementer | A normative specification plus vectors that make the reference code irrelevant |
| Standards implementer | One well-known file, registered relations, content negotiation |
| Maintainer as rights holder and approver | Every git write is the maintainer's; the licence stack; the clean room; the cost ceiling |
| Future port implementers in other languages | No hidden behaviour in the JavaScript; byte-level vectors; no build step |

## 3. Constraints

| # | Constraint | Consequence |
|---|---|---|
| C1 | Zero runtime dependencies: Node built-ins only, Node 22.14 or later *(superseded — see the amendment below)* | Every parser and writer is hand-written |
| C2 | The deployed system is static files plus CI: no servers, databases or queues | CI is the only backend; every write path ends in a pull request |
| C3 | Cloudflare Pages, deployed from `www/` | The output directory is `www/`; `_headers` and `_redirects` are generated |
| C4 | Content negotiation for `/ns/` through the w3id `.htaccess`, with no project-owned server code | Negotiation is a configuration file in a foreign repository |
| C5 | The maintainer runs every git write and every credentialed publish | `propose` writes patches and prints commands; CI never commits content |
| C6 | At most 10 dollars a month of model spend; the gating lanes stay lint-only | No model call on `ci`, `review` or anything reachable from them; the optional review lane never gates a merge |
| C7 | Clean room: the invariants are held outside every repository | One `clean-room` lint enforces the public derivations (AGSC-08-17): no book framing, no imposed sequence of pages, no whole-corpus emitter |
| C8 | The capability plane is language-independent: files and ontologies define the system | No behaviour may exist that the specification and the vectors do not pin |
| C9 | No network, wall clock or file system in the pure core; network only in `refresh` and `mcp` | Ports, enforced by tests |
| C10 | Determinism: canonical JSON, sorted keys, LF, NFC, UTC seconds, `SOURCE_DATE_EPOCH` | `verify` is a double build with a byte comparison, and it blocks merges |

> **Amendment 2026-09-18 (ADR-019).** The "zero runtime dependencies" constraint (C1, ADR-002) is superseded. The reference engine uses actively maintained, permissively licensed libraries at exact pinned versions for the standard formats and protocols it reads and writes, with a committed lockfile, `npm ci` installs and an `npm audit` gate; only what the specification pins byte-for-byte and no library produces is written by hand. The specification itself never required zero dependencies; a port from the vectors alone (NFR-02) and every determinism rule are unchanged.
>
> **Amendment 2026-09-18.** The reference engine is CommonJS and its floor is Node 22.12; the browser bundle stays ESM. The module system is a property of this one implementation, not of the specification — a conforming engine may be written in any language and any module system, and is judged only by the conformance vectors. *Note 2026-09-24: the floor was raised to Node 22.13.0, the first 22.x release that requires an ES-module library without printing a warning.*


## 4. Context

{{diagram:c4-context}}

People read the pages and machine surfaces over HTTPS and open proposals as pull requests. Agents call the local tool server over standard input and output, fetch the discovery document, the graph, llms.txt and the skill packs over HTTPS, and use the page tools where a browser exposes them. The owner performs every git write. Standards implementers request the link set and negotiate the vocabulary through w3id. Port implementers read the specification and the vectors. GitHub holds the repositories and runs the pipeline; Cloudflare Pages serves the site; w3id.org resolves the namespace; the npm registry distributes the engine. External interfaces are files and URLs only: there is no API to call.

## 5. Solution strategy

A functional core compiles a folder of Markdown into every surface the product has. The content directory and the configuration file are the sole system of record; the engine is a pure compiler behind ports; GitHub Actions is the only thing that ever writes; Cloudflare Pages serves the output byte for byte. Every interactive path, in the browser, over MCP, over WebMCP or on the command line, ends in a local patch that a person turns into a proposal, and nothing publishes until a person merges.

| Context | Responsibility | Aggregates | Verbs owned |
|---|---|---|---|
| Knowledge | Parse, validate, link, ontology, graph; the vectors | Bundle, item (six types), Link, Source | Serves all |
| Provenance and Governance | `prov`, gates, proposals and reviews, all lints, the ledger | Proposal, Review, Gate, ledger entry | `lint`, `propose`, `review`, `verify --ledger` |
| Composition | The closure algebra and the seven Harness emitters | Composition, Harness | `compose` |
| Distribution | The project's own surfaces, output only | Site build, graph export, discovery link set, NOW | `build`, `verify`, `ci`, `init`, `mcp`, `refresh` |
| Interchange | Foreign formats, both directions | Foreign bundle, steer bundle, skill pack | `import`, `export` (including `--steer`), `skills` |

The boundary rule between the last two: Interchange is foreign formats in both directions; Distribution is the project's own surfaces, output only. Skill packs are emitted by Interchange, because `SKILL.md` is a foreign format that round-trips, and merely served from `/skills/` by Distribution.

{{diagram:bounded-contexts}}

The context map: Knowledge feeds Distribution as a conformist supplier (Distribution renders what Knowledge validated and adds nothing); Knowledge feeds Composition as customer and supplier (Composition consumes the resolved graph; Knowledge does not know compositions exist); Governance feeds Distribution a published language of trailers and ledger entries. The Boundary context is an anti-corruption layer around every external surface, so that an external draft moving (the MCP handshake changed between its 2025 and 2026 revisions; the WebMCP report date moved) changes a declared version string and a plugin, never the core. Its interface is the four-rule plugin contract: declare, pin, inherit, prove (AGSC-11-16 to AGSC-11-19).

## 6. Containers

{{diagram:c4-containers}}

| Container | What it is |
|---|---|
| `agsc` CLI | Node ≥ 22.13, CommonJS, a small set of pinned and audited libraries; sixteen verbs, exit codes 0, 1 and 2, `--json` everywhere; five context directories under `src/` plus ports and Node adapters |
| `agsc mcp` | A local stdio JSON-RPC server exposing seven tools: search, read, links, compose, propose, ask, remember |
| Browser bundle | `www/js/agsc-core.js`: the same composition modules with no Node imports, plus the WebMCP page tools |
| GitHub Actions | `ci.yml`, `release.yml`, `refresh.yml`: the only backend |
| Static site | `www/`: pages, graph files, per-item Markdown and JSON-LD, the search index, llms.txt, skills, `/ns/`, the discovery document, the NOW page |
| Bundle | `content/**/*.md` plus `agsc.config.json`: the system of record; the ledger is derived into `www/`, not stored here |

### Ports and adapters

| Port | Purpose | Reference adapter | Plugin adapters, never required |
|---|---|---|---|
| FileSystem | Read and write files | Node `fs` | In-memory (tests), Deno, Bun, Workers |
| Clock | Time | Node clock; the build reads `SOURCE_DATE_EPOCH`, only `refresh` reads a real clock | Fixed-clock test adapter |
| ProcessRunner | Spawn (git log pre-step, tar) | Node, allow-listed | Sandboxed runner (`run`) |
| Network, CI only | HTTP | Node fetch, permitted in `refresh` and `mcp` only; a test fails if it is reachable from the knowledge context | none |
| ContentStore | The Bundle | Local git working tree | GitHub API, Obsidian, Solid |
| GraphExport | Items to RDF | JSON-LD, Turtle, N-Quads (RDF/XML reserved) | SPARQL dump, Wikibase |
| ToolTransport | Tools to agents | Local stdio MCP, seven tools | Remote responder (declared now, served later) |
| PageTools | Tools in the page | WebMCP `document.modelContext`, the same seven tools, degrading to plain JavaScript | none |
| Reviewer | Proposal verdict | Lint only, no model on a gating lane | The optional, non-gating model review lane (AGSC-08-27), off by default |
| Host | Where `www/` lands | Cloudflare Pages | GitHub or GitLab Pages, Netlify |
| Forge | Pull-request and CI shim | GitHub, at most twenty lines of workflow | GitLab, Forgejo |
| Federation | The peer walk | The client-side walk of `validate-wellknown --peer` and the site client | none |
| Identity, PersonalStore | Hooks for later | none | Later servers only |

### Correspondence rules

One bounded context corresponds to one `src/` directory, one specification section and one vector area, and a CI script asserts every row: Knowledge to `01-bundle`, `02-item`, `03-links`, `05-graph` and the `bundle`, `frontmatter`, `slug`, `links`, `graph` areas; canonical form to `04-canonicalization` and `jcs`; Provenance and Governance to `08-governance` and `lint`, `ledger`, `prov`; Composition to `07-composition` and `compose`; Distribution to `06-surfaces` and `discovery`, `build`, `adopt`; Interchange to `01-bundle` import and export and `import`, `export`, `skills`; the CLI contract to `09-conformance` and `cli`. A module with no specification section and no vector fails the lint.

## 7. Runtime views

**The pipeline (`agsc ci`).** Load and validate the configuration; discover the files in code-point order; parse, validate, resolve the fourteen link keys, compute inverses, detect orphans and cycles; run the lints, including the injection, secrets, personal-data and clean-room scans; compile diagrams; build the SKOS collections and the graph; emit the three graph views and the per-item files; render the pages, the search index, the headers, the sitemap, llms.txt, the discovery document and the NOW page, every instant from `SOURCE_DATE_EPOCH`; enforce the budgets; build again into a temporary directory and compare bytes; export and attest; derive the whole ledger from git history into `www/`, re-verify the chain and compare its head with the published attribute; exit 0 with the verdict in `dist/gate.json`.

{{diagram:build-pipeline}}

**The proposal lifecycle.** An author, human or operator-run agent, edits an item with a provenance record. `lint --fix` normalises; `propose` writes a patch and a pull-request body and prints the commands, with no network write. The person runs them; the pull request carries the sign-off trailer. CI runs the pipeline with read-only permissions; pull requests from forks are lint-only until labelled, with at most five open bot pull requests; findings appear as annotations; no model runs. The owner reviews and records a `verified` entry, which is the review. The ruleset requires a pull request, one approval, a code owner and a green pipeline; the owner merges; agents never approve. The merge deploys, and the build re-derives the ledger with the merge as an entry; the commit and the reviewer are derived at build and never written into files.

{{diagram:proposal-lifecycle}}

**Browser composition.** `/compose/` loads the graph and the browser bundle, which is the same composition module set with no Node imports. The user ticks Concepts; the closure runs client-side in the normative order (AGSC-07-04 to AGSC-07-08); the user names the Harness; the seven files are generated in memory and downloaded as a store-only zip, or file by file as the documented fallback. The bytes equal those of the command-line invocation for the same selection, and a vector asserts it (AGSC-07-13).

## 8. Deployment

| Lane | Trigger | Permissions | Result |
|---|---|---|---|
| Engine CI | Push, pull request | Read only | Tests with a fixed clock and no network, coverage, self-lint, vectors, every independent validator |
| Engine release | A version tag pushed by the maintainer | Identity token and attestation write | Trusted publishing of the packages to npm with provenance attestations |
| Content CI and deploy | Push to the main branch, pull request | Read only; the deploy job holds the host token | The pipeline, then publication of `www/` to Cloudflare Pages |
| Refresh and channel ingest | Weekly cron; per-channel schedule | Read plus issue creation; the ingest job has no repository write of its own | Staleness and link checks producing at most one issue and never a commit; channel ingest under the guards of AGSC-01-30 and AGSC-08-26 |

Every action is pinned by commit hash; `pull_request_target` is never used; there is no cache step; each secret lives only in the job that needs it and expires within ninety days. Content negotiation for the namespace is a fixed table in the w3id `.htaccess` mapping `Accept` to same-origin static files, with immutable versioned copies; until the w3id pull request merges, the namespace simply does not resolve, which blocks nothing else.

### Where a node can live

*Added 2026-09-24.* A node is a set of files, and so is its build; neither depends on a transport. It can be served from a web host, a laptop or a small device, a clone of its repository, IPFS behind an HTTP gateway, or a web interface in front of a store anchored in a ledger. What the rules ask of the place is fixed: an HTTPS origin that serves the discovery document and the routes with the response headers the build wrote (AGSC-06-01, AGSC-06-17, AGSC-11-05). How each kind of place is told is a *hosting profile*, one of the plugin kinds (AGSC-00-24): the reference engine's `agsc-host` command carries seven, from Cloudflare Pages (the reference, and this site's host) to nginx and Apache, GitHub Pages behind a proxy, a local server, a clone, IPFS and a ledger anchor that records the bundle hash and the content version of each build (AGSC-04-25). Each profile states what its place cannot do, and a conformance claim names its profile. No rule of version 1.x pins a transport other than HTTP.

## 9. Crosscutting concepts

- **Determinism.** Canonical JSON, sorted keys, LF, NFC, UTC seconds, `SOURCE_DATE_EPOCH`, code-point file ordering, no blank nodes; `verify` blocks merges ([AGSC-04](/specs/04-canonicalization/)).
- **Agent safety, four mitigations.** Trust marking: every tool result is `{source, trust: "untrusted", license, type, body}`, and skill packs, steer bundles and llms.txt fence prose as data. Structural lints against agent-directed imperatives, hidden text, long encoded blobs and unusual URL schemes, warning for humans and failing for agent-authored proposals. Least agency: tools take identifiers, never paths, URLs or shell strings; `propose` writes locally. Inert artefacts: content-only skills with a hash lockfile. Hashes and attestations prove tampering, not injection ([AGSC-08 §8.4](/specs/08-governance/#section-8-4)).
- **Error handling.** Exit 0 for success, 1 for findings or a failed gate, 2 for a usage error; diagnostics as JSON lines on standard error sorted by file, line, column and code; one code format, `AGSC-E<nnn>` ([AGSC-09 §9.3](/specs/09-conformance/#section-9-3)).
- **Configuration.** Exactly one schema-validated `agsc.config.json`; precedence flags, then environment, then project, then user; unknown keys are errors.
- **Logging.** None at runtime, because there is no runtime; the durable record is the ledger, git history and Episode items; no telemetry, cookies or beacons.
- **Internationalisation.** Language variants of an item share its slug and address and are served under a language path with `hreflang` alternates (AGSC-01-13).

## 10. Decisions of record

| ADR | Decision |
|---|---|
| 001 | Agent safety by structural defence, not by a classifier and not by sandboxing: trust-marked results, fenced prose, deterministic lints, identifier-only tools, inert skills, human merge; with the honest limit that hashes prove tampering, not safety |
| 002 | Zero runtime dependencies, forever: Node built-ins only; a trivially auditable supply chain and portability to other runtimes — superseded 2026-09-18 by ADR-019 |
| 003 | Static only: Cloudflare Pages from `www/`, no servers, databases, queues or Workers; CI is the only backend |
| 004 | One vocabulary, fourteen links: six item types with a `kind` qualifier on Concept, nine core keys with composition meaning and five Mode-2 keys for navigation |
| 005 | Namespace content negotiation through the w3id `.htaccess`: zero project-owned server code and permanent addresses independent of the domain |
| 006 | A derived, hash-chained ledger recomputed from git history on every build, never appended, with its head published in the discovery document |
| 007 | The Content Use Terms — or the prose licence the node names in their place — travel inside every export that carries prose |
| 008 | JavaScript with JSDoc types and a language-independent capability plane: the definition is the specification, the schemas, the ontology and the vectors |
| 009 | Five contexts rather than four; deferred, to be reopened only if the Interchange and Distribution boundary leaks |
| 010 | Part II scope under the simplicity rule: `run` and `trace` opt-in and off by default, `conform` a thin verb over the vector runner, federation as a validator flag, runtime emitters as template renderings of the seven Harness files |
| 011 | A link set instead of a vendor manifest: the discovery document is an RFC 9264 link set with integrity on the links, one profile URI, no new media type or scheme |
| 012 | Plugins are declared surfaces under the contract declare, pin, inherit, prove |
| 013 | Two reference plugins, local MCP and WebMCP, with the same seven tools; the Agent Card only as an optional card beside a responder |
| 014 | The agent federates; nodes never call nodes: nine static, client-side parts, citation instead of cross-Bundle links |
| 015 | Visibility and dynamic hooks are specified now and built later |
| 016 | Ports are wired verdict-neutrally in the fifth composition step |

## 11. Quality lanes

| Requirement | Proved by |
|---|---|
| NFR-01 pinned, audited dependencies | The production dependency list is pinned to exact versions with a committed lockfile, `npm ci` installs and an `npm audit` gate |
| NFR-02 language-independent plane | The vectors lane with no engine-private state, the correspondence-rule script and the independent validators |
| NFR-03 coverage at least 99 percent | The coverage lane and a golden-thread check from every requirement to a test |
| NFR-04 byte-identical builds | The determinism lane: double build and hash comparison, blocking merges, on three operating systems at tags |
| NFR-05 deterministic tests | A fixed clock, and a test that no wall clock or network is reachable from the knowledge context |
| NFR-06 budgets | A budget step in the pipeline |
| NFR-07 agent safety | The lint lane, tool-shape tests and the skills-inertness test |
| NFR-08 WCAG 2.2 AA | An accessibility lane over the golden build, with alt text asserted |
| NFR-09 unattended operation | An idempotence test for the refresh workflow and a restore-from-zero drill before launch |
| NFR-10 licence stack | An SPDX header on every browser script and a terms-embedded assertion on every prose export (a REUSE layout is a 1.1 item) |
| NFR-11 cost ceiling | No model call reachable from the launch lanes, asserted by grep, and a spend line on the NOW page |
| NFR-12 clean room | The clean-room lint and an importer that refuses book references |
| NFR-13 offline and cross-platform | A portability checklist on three operating systems |

## 12. Risks

| Risk | Mitigation |
|---|---|
| The hand-written Markdown renderer, which must render every imported body | Golden tests over the whole corpus; unsupported syntax is a lint error, never a rendering surprise |
| Subtle errors in Turtle, RDF/XML and N-Quads escaping and datatypes | One offline validation with independent tools, then golden fixtures |
| Browser and command-line composition with no bundler, plus a hand-written zip writer | One module entry copied to the site; a test forbids Node imports; per-file download as the fallback |
| Schedule pressure on the launch scope | Pre-agreed ordered trims; sample first, then batch |
| Latency of the w3id pull request | The namespace is fixed in the ontology; launch does not depend on it |
| False positives of the injection scan deterring contributors | A severity split, a labelled override, configuration-owned word lists |
| Parsers and the classic parser attacks | Index-based state machines, null-prototype objects, identifier-only paths, a 1 MiB cap, a seeded fuzz lane; archives refused entirely |
| Drift between modules, specification sections and vectors | The correspondence rules are machine-checked in CI |

## 13. Threat model

The assets are the content repository, the engine repository and its packages, the published site and exports, the CI secrets, the accounts, the domains and the w3id prefix, contributor personal data, the memories of downstream agents, and the clean-room invariants. The threats and their mitigations, in STRIDE terms:

| Threat | Mitigation |
|---|---|
| Prompt injection through merged content reaching agents | Trust-marked results, fenced prose, the injection scan at error severity for agent-authored changes, identifier-only tools, inert skills, human merge |
| A malicious proposal editing schemas, the ontology, types or identifiers, or an ingest pull request posing as a channel | A ruleset requiring a pull request, one approval, a code owner and a green pipeline; a single bypass identity that the ingest job cannot reach; code owners on the schema and ontology; forks lint-only until labelled |
| A look-alike package name | Trusted publishing with attestations on both packages; canonical names documented |
| Theft of a CI token | Read-only defaults with per-job elevation, actions pinned by hash, never `pull_request_target`, secrets only in the deploy job |
| Tampering with the w3id redirects | A fixed table of same-origin targets reviewed by the w3id maintainers; immutable versioned copies; a digest on the ontology link |
| A deploy from a compromised CI run | A scoped, short-lived host token; an attested weekly snapshot as the known-good redeploy; `verify` reproduces the site from any clone |
| Malicious parser input | The parser controls above and a single parse-error type |
| Secrets or personal data merged into a page | The secrets and personal-data lints; push protection once public |
| A skill pack carrying executables | The content-only rule on both export and install, a hash lockfile, a diff before every update |
| Repudiation or a silent rewrite of history | Provenance on every item, the pull request as the record, force pushes blocked, the hash-chained ledger, mirrors and attested snapshots |

Six further threats (request forgery through peer fetch, exfiltration from a wrongly public restricted node, spam through contribution channels, surface spoofing, successor impersonation after a tombstone, and SVG attachments as carriers) are on the [compliance and security page](/docs/compliance/#security-considerations) with the rules that close them. Two residual risks are accepted and named: novel injection phrasing that no lint recognises, and the owner as the single approver.

## 14. The model in Structurizr DSL

The context and container views above in the textual form that C4 tooling consumes, as recorded in the architecture document.

```structurizr
workspace "AgenticSystemCore" "Distributed Ontological Agentic Memory engine — reference node of the Agentic Knowledge Web" {
  model {
    reader = person "Human reader / contributor" "P1, P2"
    agent = person "Agent (reader, proposer, integrator)" "P3, P4, P6, P8"
    owner = person "Maintainer (approver, git-write authority)" "S12, P9"
    implementer = person "Standards / port implementer" "P10, P11, S13"

    asc = softwareSystem "AgenticSystemCore" "Compiles a Markdown Bundle into a wiki, an RDF graph, agent memory, skills and Harnesses" {
      cli = container "agsc CLI" "Node >=22.13, CommonJS, pinned audited dependencies" "Node.js" {
        knowledge = component "Knowledge" "parse, validate, link, ontology, graph" "src/knowledge/"
        governance = component "Provenance & Governance" "prov, Gates, Proposals, lints, ledger" "src/governance/"
        composition = component "Composition" "closure algebra + Harness emitters" "src/composition/"
        distribution = component "Distribution" "site, exports, discovery, NOW, ci, init, mcp" "src/distribution/"
        interchange = component "Interchange" "import/export/steer/skills" "src/interchange/"
        ports = component "Ports & Node adapters" "FileSystem, Clock, ProcessRunner, Network[CI-only]" "src/ports/, src/adapters/"
      }
      mcpserver = container "agsc mcp" "Local stdio JSON-RPC server: search read links compose propose ask remember" "Node.js"
      browser = container "Browser bundle" "www/js/agsc-core.js — same composition core, no node: imports; WebMCP page tools" "JavaScript (ESM)"
      site = container "Static site" "www/: pages, graph.*, pages/*.md|.jsonld, search.json, llms.txt, skills/, /ns/, /.well-known/knowledge-linkset, now.md" "Static files"
      pipeline = container "GitHub Actions" "ci.yml, release.yml, refresh.yml — the only backend" "YAML workflows"
      bundle = container "Bundle" "content/**/*.md + agsc.config.json — the system of record (ledger.jsonl is derived into www/, not stored here)" "Markdown + YAML + git"
    }

    github = softwareSystem "GitHub" "Repos, Proposals (PRs), Actions, Releases" "External"
    pages = softwareSystem "Cloudflare Pages" "Static host serving www/" "External"
    w3id = softwareSystem "w3id.org" ".htaccess content negotiation for /ns/" "External"
    npmreg = softwareSystem "npm registry" "agentic-system-core, agsc-cli" "External"

    reader -> site "Reads pages and machine surfaces" "HTTPS"
    reader -> github "Opens a Proposal (fork-and-edit)" "HTTPS"
    agent -> mcpserver "Calls seven tools" "stdio JSON-RPC"
    agent -> site "Fetches linkset, graph, llms.txt, skills" "HTTPS"
    agent -> browser "Uses page tools" "WebMCP"
    owner -> github "All git writes, merges, tags" "git/HTTPS"
    implementer -> asc "Reimplements from spec/ + tests/vectors/" "files"
    cli -> bundle "Reads content, derives ledger" "FileSystem port"
    cli -> site "Emits www/" "FileSystem port"
    browser -> site "Loads graph.jsonld; downloads Harness" "HTTPS"
    mcpserver -> site "Reads published exports" "HTTPS (mcp only)"
    pipeline -> cli "Runs agsc ci" "npx"
    pipeline -> pages "Publishes www/" "wrangler / Pages"
    pipeline -> npmreg "Trusted publishing + attestations on tag" "OIDC"
    github -> pipeline "Triggers on push, PR, tag, cron"
    pages -> site "Serves"
    w3id -> site "303 to /ns/agsc.ttl, /ns/context.jsonld" "Accept-based"
  }

  views {
    systemContext asc "Context" { include * autolayout tb }
    container asc "Containers" { include * autolayout tb }
    component cli "Components" { include * autolayout tb }
    styles {
      element "Person" { shape person }
      element "External" { background #999999 }
    }
  }
}
```
