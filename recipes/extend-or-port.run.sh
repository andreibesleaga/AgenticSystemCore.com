#!/usr/bin/env bash
# Repeats every command of the page "Recipe: extend the engine or port it to another language".
# Usage: extend-or-port.run.sh <folder that holds node_modules with agentic-system-core@1.1.0>
set -euo pipefail
HERE="$(cd "$1" && pwd)"
export PATH="$HERE/node_modules/.bin:$PATH"
export ENGINE="$HERE/node_modules/agentic-system-core"
export GIT_AUTHOR_NAME=you GIT_AUTHOR_EMAIL=you@example.org GIT_COMMITTER_NAME=you GIT_COMMITTER_EMAIL=you@example.org
export GIT_AUTHOR_DATE=2026-11-18T09:00:00Z GIT_COMMITTER_DATE=2026-11-18T09:00:00Z
cd "$(mktemp -d)"
PS4='$ '
set -x

# Before: a node to work in
cp -r "$ENGINE/examples/demos/mode-2-project" my-node && cd my-node
mkdir -p .well-known && printf 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" .
git init -q -b main && git add -A && git commit -q -m 'a node'

# A1. The smallest plugin that works
mkdir plugins
cat > plugins/titles.js <<'JS'
'use strict';
module.exports = {
  kind: 'memory-adapter',
  name: 'titles',
  agsc_spec_version: '1.0.0',
  plugin_api_version: '1.0.0',
  exportFiles(items) {
    const lines = items.map((item) => `${item.type}: ${item.title}`);
    return { files: [{ path: 'titles.txt', text: lines.join('\n') + '\n' }] };
  },
};
JS
agsc export --to ./plugins/titles.js
head -3 dist/export/titles/titles.txt

# A2. What the engine refuses
agsc export --to https://example.org/titles.js || echo "exit $?"
sed 's/plugin_api_version: .1.0.0./plugin_api_version: "9.0.0"/' plugins/titles.js > plugins/future.js
agsc export --to ./plugins/future.js || echo "exit $?"

# A3. Where a plugin is named
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("agsc.config.json")); c.plugins = ["./plugins/titles.js"]; fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n")'
agsc lint --quiet 2>&1 | grep '^error:' || true
git checkout -q agsc.config.json
cp "$ENGINE/examples/plugins/composition-emitter.js" "$ENGINE/examples/plugins/deployment-profile.js" plugins/
agsc compose handoff supervisor --emit ./plugins/composition-emitter.js | tail -2
agsc build --quiet 2>/dev/null
agsc-host emit ./plugins/deployment-profile.js | tail -2

# B1. The conformance vectors
ls "$ENGINE/tests/vectors" | head -5
find "$ENGINE/tests/vectors" -name '*.json' | wc -l
node "$ENGINE/tools/count-artifacts" | grep vectors_total

# B2. Run a Level and read the report
for level in 0 1 2 3; do agsc conform --level "$level" --to "reports/level-$level.json" | head -1; done
node -e 'const r = require("./reports/level-3.json"); console.log(Object.keys(r).join(" ")); console.log(r.class, r.impl, r.version, r.spec_version, JSON.stringify(r.summary)); console.log(JSON.stringify(r.results[0]))'
agsc conform --level 4 || echo "exit $?"

# B3. The Python package
pip index versions agentic-system-core 2>/dev/null | head -2 || true
curl -s -o /dev/null -w '%{http_code}\n' https://pypi.org/project/agentic-system-core/
