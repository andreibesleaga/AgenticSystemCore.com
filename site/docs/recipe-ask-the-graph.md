---
title: "Recipe: ask a node's graph a question"
summary: "For a developer or analyst who wants answers from a node's knowledge graph. You end up with SPARQL questions run on your own machine, the shipped shapes checked, and a question of your own that the engine verifies."
description: "Load a node's graph.nq into rdflib, run questions in SPARQL, check the graph with the shipped SHACL shapes, and add questions of your own to agsc verify."
---

**Who it is for:** a developer or analyst who has a built node and wants to query its graph.

**What you get:** three SPARQL answers on your machine, the shipped shapes run over the graph, and a question of your own that `agsc verify` checks on every build.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell, Python 3 with `venv` and `pip`.


## Before you start

Install the engine as in [the Mode 0 guide](/docs/guides/mode-0/). Start in an empty folder; the node is the `mode-2-project` example that ships in the package (`$ENGINE`).

## 1. Build a node and see what it publishes

Copy the example, add a security contact and the licence text, commit once, then check and build:

```bash
cp -r "$ENGINE/examples/demos/mode-2-project" my-node && cd my-node
mkdir -p .well-known && printf 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" .
git init -q -b main && git add -A && git commit -q -m 'a node'
agsc ci --quiet
agsc build --quiet
ls www/graph.jsonld www/graph.ttl www/graph.nq www/ns
```

```text
build: pass (0 error, 1 warn)
www/graph.jsonld
www/graph.nq
www/graph.ttl

www/ns:
1.0.0
context.jsonld
```

The graph comes in three forms of the same facts: JSON-LD, Turtle and N-Quads (`graph.nq`, every statement in the node's named graph). Under `/ns/` a node publishes the JSON-LD context. The vocabulary itself is published once, at [agenticsystemcore.com/ns/](https://agenticsystemcore.com/ns/), and the shapes ship in the package as `$ENGINE/schema/item-shapes.ttl`.

## 2. The ten ready questions

The engine names ten questions the graph answers. Print them:

```bash
node -e 'const q = require(process.argv[1]).questions; for (const x of q) console.log(x.number + ". " + x.question)' "$ENGINE/docs/ontology-questions.json"
```

```text
1. If I choose X, what else must I take?
2. What can never go with X?
3. What replaced X, directly or through a chain?
4. What does X need that nobody in my selection provides?
5. What verifies X, and what does X verify?
6. What blocks task T, directly or through a chain?
7. Where did lesson L come from?
8. Which items sit under cluster C and its sub-clusters?
9. Which of my selected items are stale, draft or deprecated?
10. Which sources back X, and which other items share them?
```

The same file holds the SPARQL of each; [the engine's list](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ONTOLOGY-QUESTIONS.md) prints all ten.

## 3. Ask in SPARQL, on your machine

Make a Python environment with `rdflib`. In the script, `default_union=True` makes the node's named graph the default graph, so a query needs no `GRAPH` clause.

```bash
python3 -m venv ../venv
../venv/bin/pip install --quiet rdflib==7.6.0 pyshacl==0.40.2
cat > ../ask.py <<'PY'
import sys
from rdflib import Dataset
ds = Dataset(default_union=True)      # the node's named graph becomes the default graph
ds.parse(sys.argv[1], format="nquads")
prefixes = "PREFIX asc: <https://w3id.org/agentic-system-core/ns#> PREFIX skos: <http://www.w3.org/2004/02/skos/core#> "
for row in ds.query(prefixes + sys.argv[2]):
    print("  ".join(str(cell).replace("https://project.example/", "") for cell in row))
PY
```

Ask question 6 (what blocks what), question 8 (what sits under a cluster), and one of your own (which decision settled which specification):

```bash
../venv/bin/python ../ask.py www/graph.nq 'SELECT DISTINCT ?task ?blocker WHERE { ?task asc:blockedBy+ ?blocker FILTER (?blocker != ?task) }'
../venv/bin/python ../ask.py www/graph.nq 'SELECT DISTINCT ?item WHERE { <https://project.example/clusters/login/> skos:member+ ?item } ORDER BY ?item'
../venv/bin/python ../ask.py www/graph.nq 'SELECT ?spec ?decision WHERE { ?s asc:decidedBy ?d . ?s skos:prefLabel ?spec . ?d skos:prefLabel ?decision }'
```

```text
concepts/task-login-tests/  concepts/task-login-form/
concepts/decide-the-login/
concepts/login-spec/
concepts/task-login-form/
concepts/task-login-tests/
procedures/run-the-tests/
Login specification  Decide the login
```

The login tests wait for the login form, five items sit under the login board, and one specification was settled by one decision.

## 4. Run the shipped shapes over the graph

The shapes state what a well-formed graph looks like. rdflib keeps `"x"` and `"x"^^xsd:string` apart, which RDF 1.1 does not, so the script converts the former into the latter.

```bash
cat > ../shapes.py <<'PY'
import sys
from rdflib import Dataset, Graph, Literal, XSD, SH
from pyshacl import validate

def as_xsd_string(triples):               # rdflib keeps "x" and "x"^^xsd:string apart; RDF 1.1 does not
    g = Graph()
    for s, p, o in triples:
        if isinstance(o, Literal) and o.datatype is None and o.language is None:
            o = Literal(str(o), datatype=XSD.string)
        g.add((s, p, o))
    return g

ds = Dataset(default_union=True)
ds.parse(sys.argv[1], format="nquads")
data = as_xsd_string(ds.triples((None, None, None)))
shapes = as_xsd_string(Graph().parse(sys.argv[2], format="turtle"))
_, report, _ = validate(data, shacl_graph=shapes, inference="none")
for r in report.subjects(SH.resultSeverity, None):
    print(report.value(r, SH.resultSeverity).split("#")[1], "-", report.value(r, SH.resultMessage))
print("violations:", len(list(report.subjects(SH.resultSeverity, SH.Violation))))
PY
../venv/bin/python ../shapes.py www/graph.nq "$ENGINE/schema/item-shapes.ttl"
```

```text
Warning - AGSC-E305: no item or collection points at this item (AGSC-05-21, missing in-links; AGSC-03-10)
violations: 0
```

No violation. The one warning is the one `agsc ci` printed in step 1: the gate has no link pointing at it.

## 5. Questions and shapes of your own

Name them in `agsc.config.json` under `domain`, and `agsc verify` and `agsc ci` run both on every build. A question is a SPARQL `ASK` or `SELECT` with its expected answer; a shape is a Turtle file.

```bash
mkdir domain
cat > domain/questions.json <<'JSON'
[{"id": "a-task-is-blocked", "question": "Does at least one task wait for another?", "expected": true,
  "query": "ASK { ?task <https://w3id.org/agentic-system-core/ns#blockedBy> ?other }"}]
JSON
cat > domain/shapes.ttl <<'TTL'
@prefix asc: <https://w3id.org/agentic-system-core/ns#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
<https://example.org/ns/shapes#ConceptHasDefinition> a sh:NodeShape ; sh:targetClass asc:Concept ;
    sh:property [ sh:path skos:definition ; sh:minCount 1 ; sh:message "Every concept has a definition."@en ] .
TTL
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("agsc.config.json")); c.domain = { shapes: "domain/shapes.ttl", questions: "domain/questions.json" }; fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n")'
agsc verify --quiet
```

```text
verify: pass (0 error, 0 warn)
```

Now make the expected answer wrong, so the check fails on purpose:

```bash
sed -i.bak 's/"expected": true/"expected": false/' domain/questions.json
agsc verify --quiet || echo "verify exited $?"
```

```text
verify: fail (1 error, 0 warn)
error: AGSC-E422 the competency question a-task-is-blocked ("Does at least one task wait for another?") is answered true, not the expected false (AGSC-05-41) — domain/questions.json
verify exited 1
```

[The Mode 1 guide](/docs/guides/mode-1/) lists the part of SPARQL and SHACL the engine runs here.

## In the browser

[The query page](/query/) needs nothing installed: it loads `/graph.nq` into a query engine compiled to WebAssembly in your browser and sends and stores nothing. It has an editor, the ten questions as examples that fill the editor, a result table with CSV and JSON downloads, and a share link that holds the query.

## Check that it worked

Step 3 printed the three answers, step 4 printed `violations: 0`, and step 5 failed with `AGSC-E422` and exit code 1 after you flipped the answer.

## What this does not do

- The engine does not run your SPARQL. The query page, rdflib or another store does. `agsc verify` runs the questions of the file at `domain.questions` and nothing else.
- rdflib 7.6.0 treats a plain string and an `xsd:string` as different terms, so question 9 answers differently there than in a store that follows RDF 1.1.
- `agsc lint` and `agsc build` never run your shapes or questions; `verify` and `ci` do.

## Where to go next

- [The graph explorer](/graph/) and [the domain layer](/docs/guides/mode-1/).
- [The shapes in detail](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/SHACL-SHAPES.md).
- [Stop a broken change before it is merged](/docs/recipe-ci-gate/).

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/ask-the-graph.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/ask-the-graph.run.sh). More recipes: [the list](/docs/recipes/).
