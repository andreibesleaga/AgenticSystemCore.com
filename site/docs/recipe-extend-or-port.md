---
title: "Recipe: extend the engine or write your own"
summary: "For a developer who wants to add a capability to the engine, or to implement the format in another language. Part A writes a plugin and shows where 1.1.0 loads one; part B runs the conformance vectors and reads the report."
description: "Write a plugin that agsc export loads, see what the engine refuses, then run the conformance vectors with agsc conform and plan a port in another language."
---

**Who it is for:** a developer who wants to add to the engine (part A), or to implement the format in another language (part B).

**What you get:** a working plugin and a plain statement of where 1.1.0 loads one; the conformance report of the reference engine and the order the implementers' guide recommends.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell, `pip` and `curl` for the last step.


## Before you start

Install the engine as in [the Mode 0 guide](/docs/guides/mode-0/). The commands work in the `mode-2-project` example that ships in the package (`$ENGINE`).

```bash
cp -r "$ENGINE/examples/demos/mode-2-project" my-node && cd my-node
mkdir -p .well-known && printf 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n' > .well-known/security.txt
cp "$ENGINE/LICENSE-CONTENT" .
git init -q -b main && git add -A && git commit -q -m 'a node'
```

## A1. The smallest plugin that works

A plugin is a CommonJS module with four declared members and the hook of its kind. This one is a memory adapter: it turns the items into a text file. It reads the items it is given and returns files; it never touches the file system, and the engine writes what it returns.

```bash
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
```

```text
adapter: titles (a plugin; 1 files, outside build.out)
export: pass (0 error, 0 warn)
cluster: Agent patterns
concept: Decide the login
concept: Handoff
```

It loaded and ran. The versions it declares are the ones it was written for: the specification version and the plugin API version. Add `importFiles(files)` to make `agsc import --from ./plugins/titles.js` work too.

## A2. What the engine refuses

A plugin is a file on your machine. A web address is refused, and so is a plugin written for a newer plugin API:

```bash
agsc export --to https://example.org/titles.js || echo "exit $?"
sed 's/plugin_api_version: .1.0.0./plugin_api_version: "9.0.0"/' plugins/titles.js > plugins/future.js
agsc export --to ./plugins/future.js || echo "exit $?"
```

```text
error: AGSC-E905 export --to "https://example.org/titles.js" names a remote plugin; this engine loads a plugin from a local path or an installed package and never from the network (AGSC-04-03, AGSC-00-24)
exit 1
error: AGSC-E004 the plugin targets plugin-API version "9.0.0", which this engine ("1.0.0") does not implement; the plugin API is additive within 1.x, so a newer MINOR may use a hook this host does not offer
exit 2
```

(The `"1.0.0"` in that message is the version of the plugin API, not of the engine, which is 1.1.0.)

## A3. Where a plugin is named

Not in the configuration. The file `agsc.config.json` is closed, and a `plugins` key is refused:

```bash
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync("agsc.config.json")); c.plugins = ["./plugins/titles.js"]; fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n")'
agsc lint --quiet 2>&1 | grep '^error:'
git checkout -q agsc.config.json
```

```text
error: AGSC-E004 plugins: must NOT have additional properties — agsc.config.json
```

At 1.1.0 the engine loads a plugin you write for three of the eight kinds, each from a command-line flag: `export --to` and `import --from` (memory adapter), `compose --emit` (composition emitter) and `agsc-host emit` (deployment profile). The package has a sample of each kind in `$ENGINE/examples/plugins/`. Two of them:

```bash
cp "$ENGINE/examples/plugins/composition-emitter.js" "$ENGINE/examples/plugins/deployment-profile.js" plugins/
agsc compose handoff supervisor --emit ./plugins/composition-emitter.js | tail -2
agsc build --quiet 2>/dev/null
agsc-host emit ./plugins/deployment-profile.js | tail -2
```

```text
emit: dist/harness/3e6d036859f29f61.index.md (example-index, a plugin)
compose: pass (0 error, 0 warn)
agsc-host emit: pass (0 error, 0 warn)
wrote dist/hosts/example-host/example-host.toml
claim: deployment profile example-host
```

The other five kinds have a registry and a sample, but no flag or configuration key loads one: a channel's `adapter` in `agsc.config.json` is a name that the configuration accepts and nothing looks up. [The plugin guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/PLUGINS.md) lists the three rules every plugin obeys: no network, writes just the outputs its kind names, and no change to the bytes of a published surface.

## B1. The conformance vectors

A second implementation needs two folders: `spec/` and `tests/vectors/`. The vectors ship in the package. Count them:

```bash
ls "$ENGINE/tests/vectors" | head -5
find "$ENGINE/tests/vectors" -name '*.json' | wc -l
```

```text
README.md
adopt
boards
boundary
build
399
```

Each file is one JSON case that cites one rule and states the expected result. You read them with your language's own JSON parser.

## B2. Run a Level and read the report

There are four Levels: 0 publisher, 1 reader, 2 writer, 3 full engine. Each runs more areas of vectors than the last. Run all four on the reference engine and read the report of the last:

```bash
for level in 0 1 2 3; do agsc conform --level "$level" --to "reports/level-$level.json" | head -1; done
node -e 'const r = require("./reports/level-3.json"); console.log(Object.keys(r).join(" ")); console.log(r.class, r.impl, r.version, r.spec_version, JSON.stringify(r.summary)); console.log(JSON.stringify(r.results[0]))'
```

```text
vectors: 35 pass, 0 fail, 2 skip (2 withdrawn, 0 pending) of 37
vectors: 113 pass, 0 fail, 3 skip (3 withdrawn, 0 pending) of 116
vectors: 266 pass, 0 fail, 18 skip (18 withdrawn, 0 pending) of 284
vectors: 376 pass, 0 fail, 23 skip (23 withdrawn, 0 pending) of 399
class impl results spec_version summary version
full-engine agentic-system-core 1.1.0 1.1.0 {"fail":0,"pass":376,"skip":23}
{"id":"adopt-0001","status":"pass"}
```

A withdrawn vector counts in neither direction. The report holds one `pass`, `fail` or `skip` for each vector id, and your own runner writes the same shape. The path after `--to` must lie inside the folder; an absolute path is refused.

## B3. The order to follow

[The implementers' guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/IMPLEMENTERS-GUIDE.md) says to start at Level 1, the reader, and then go up. It says to read `spec/00-overview.md` first, then the vector format in `tests/vectors/README.md`, then `spec/01` and `spec/02`, `spec/03`, `spec/04`, `spec/09` and `spec/10`. Run the vector areas as you read each part: start with `frontmatter` and `slug`, then `links`, `jcs`, `lint`. Then say which Level and version you ran, with the sentence in [How to say you conform](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONFORMANCE-STATEMENTS.md).

The README names a Python package, `agentic-system-core`, for the checkers and the reading API. Check that it exists:

```bash
pip index versions agentic-system-core 2>/dev/null | head -2
curl -s -o /dev/null -w '%{http_code}\n' https://pypi.org/project/agentic-system-core/
```

```text
agentic-system-core (1.1.0)
Available versions: 1.1.0, 1.0.1, 1.0.0
200
```

## Check that it worked

A.1 wrote `dist/export/titles/titles.txt`. B.2 printed `376 pass, 0 fail` for Level 3 and wrote four report files under `reports/`.

## What this does not do

- A plugin cannot go in the configuration at 1.1.0, and just three kinds load from a flag.
- This recipe did not install or run the Python package; it checked that the name exists.
- A passing run states a Level and a version. Neither is a certification.

## Where to go next

- [Mode 1: your own classes and rules](/docs/guides/mode-1/).
- [Stop a broken change before it is merged](/docs/recipe-ci-gate/).
- [The plugin guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/PLUGINS.md).

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/extend-or-port.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/extend-or-port.run.sh). More recipes: [the list](/docs/recipes/).
