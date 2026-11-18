#!/usr/bin/env bash
# Repeats every command of the page "Recipe: ask a node's graph a question".
# Usage: ask-the-graph.run.sh <folder that holds node_modules with agentic-system-core@1.1.0>
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export GIT_AUTHOR_NAME=you GIT_AUTHOR_EMAIL=you@example.org GIT_COMMITTER_NAME=you GIT_COMMITTER_EMAIL=you@example.org
export GIT_AUTHOR_DATE=2026-11-18T09:00:00Z GIT_COMMITTER_DATE=2026-11-18T09:00:00Z
cd "$(mktemp -d)"
PS4='$ '
set -x

# 1. A node to ask
cp -r "$ENGINE/examples/demos/mode-2-project" my-node && cd my-node
mkdir -p .well-known && printf 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" .
git init -q -b main && git add -A && git commit -q -m 'a node'
agsc ci --quiet
agsc build --quiet
ls www/graph.jsonld www/graph.ttl www/graph.nq www/ns
node -e 'const l = JSON.parse(require("fs").readFileSync("www/.well-known/knowledge-linkset")).linkset[0]; for (const r of ["https://w3id.org/agentic-system-core/rel#graph", "https://w3id.org/agentic-system-core/rel#context"]) for (const t of l[r]) console.log(t.href, t.type)'
grep -c . www/graph.nq

# 2. The ten ready questions
node -e 'const q = require(process.argv[1]).questions; for (const x of q) console.log(x.number + ". " + x.question)' "$ENGINE/docs/ontology-questions.json"

# 3. Three questions in SPARQL, run locally
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
../venv/bin/python ../ask.py www/graph.nq 'SELECT DISTINCT ?task ?blocker WHERE { ?task asc:blockedBy+ ?blocker FILTER (?blocker != ?task) }'
../venv/bin/python ../ask.py www/graph.nq 'SELECT DISTINCT ?item WHERE { <https://project.example/clusters/login/> skos:member+ ?item } ORDER BY ?item'
../venv/bin/python ../ask.py www/graph.nq 'SELECT ?spec ?decision WHERE { ?s asc:decidedBy ?d . ?s skos:prefLabel ?spec . ?d skos:prefLabel ?decision }'

# 4. The shapes of the format, run over the same graph
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

# 5. Questions and shapes of your own, checked by the engine
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
sed -i.bak 's/"expected": true/"expected": false/' domain/questions.json
agsc verify --quiet || echo "verify exited $?"
# script-only check: the failing verify exits 1
set +x
code=0; agsc verify --quiet >/dev/null 2>&1 || code=$?
test "$code" -eq 1 && echo "checked: verify exits 1 on a wrong expected answer"
