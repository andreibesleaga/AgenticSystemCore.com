# desk/: the Brief Desk, an open agentic website page

The page `/desk/` of agenticsystemcore.com. A visitor searches the passages a knowledge node
publishes, checks each against the SHA-256 digest the node published for it, and keeps a
brief of cited cards. An assistant of two agents does the same in the visitor's browser,
on the AI provider and key the visitor chooses.

It follows the [Worldwide Agentic Web MVP specification](https://github.com/cognizant-ai-labs/agentic-web/blob/fd872b9/docs/worldwide_agentic_web_mvp_spec.md)
(Profile 0.2) and was built with that repository's `agentify-website` skill.

## Files

| Path | What it is |
|---|---|
| `section.html` | the page body; `scripts/build.js` draws it in the site's frame at `/desk/` |
| `page.js` | the page logic: search, read with the digest check, the brief; the page's buttons and the assistant call the same methods |
| `site-actions.js` | the six actions the page's own agents get (`website_*` tools) |
| `bridge/bridge-actions.js` | the two reads shared with every calling site: search and read, this node only |
| `site.js` | boots the runtime, the confirmation dialog, the consent card's focus |
| `brief_desk.hocon` | the agent network, source of truth |
| `brief_desk.network.json`, `agent-mcp.json`, `.well-known/`, `bridge/action-bridge.html`, `bridge/agent-manifest.json` | written by `tools/build_network.mjs`; do not edit |
| `agent-manifest.json`, `links.json` | the site's index of networks, and the peer link map |
| `desk.css` | the assistant's layout with this site's colours |
| `runtime/` | the browser runtime, copied unchanged from the skill (see below) |
| `tools/`, `templates/` | the skill's build, partner-check and serve scripts, and the templates the build reads |
| `tests/` | the skill's test template filled in for this page, `desk.test.mjs` (the page's own rules), `interop.test.mjs` (the seven interoperability checks of the specification's section 6, on this site's built files and the two peers' published networks in `fixtures/peers/`), `fixtures.mjs`, the skill's DOM stand-ins, the organisers' in-process web and scripted router in `linking/`, and `browser-check.mjs` |

The network's address is `https://agenticsystemcore.com/desk/brief_desk`. It can call the
networks of the two peer nodes, each after the visitor agrees:
`https://patterns.agenticsystemcore.com/agents/pattern_cards` and
`https://standards.agenticsystemcore.com/agents/standards_map`. Those are written by
`../tools/agentify-node.mjs` in each node's repository.

## Commands

From the repository root:

```sh
node desk/tools/build_network.mjs desk/brief_desk.hocon --manifest desk/agent-manifest.json   # after editing the .hocon or the manifest
node --test "desk/tests/*.test.mjs"                                                            # no browser, no network, no model
node scripts/build.js && node scripts/check.js                                                 # the site, with /desk/
node scripts/serve-www.mjs --port 8090                                                         # the built site with its real headers
CHROME_EXE=<chromium> PW_MODULES=<folder with node_modules/playwright-core> node desk/tests/browser-check.mjs --base http://127.0.0.1:8090
node desk/tools/check_partner.mjs https://agenticsystemcore.com/desk/brief_desk                 # as another site sees this network
```

`browser-check.mjs` needs no key and makes no model call: it checks that the page and the
runtime load under the page's Content-Security-Policy, the page's own search and brief,
the confirmation dialog, the consent card, and that no other site is contacted before the
visitor acts.

## What the visitor's provider receives

The assistant sends the visitor's messages, and the passages it reads, to the AI provider
the visitor picks. The key stays in this browser's storage for this site and goes only to
that provider, never to a peer site. To stop using it, select **Delete setup** under
**Advanced settings** and close the tab.

## Licences

`runtime/`, `tools/`, `templates/`, the DOM stand-ins in `tests/` (`stub_*.mjs`,
`scripted_model.mjs`) and `tests/linking/` come from
[cognizant-ai-labs/agentic-web](https://github.com/cognizant-ai-labs/agentic-web) at commit
`29a4226`, Apache-2.0 (`runtime/LICENSE.txt`, `tools/LICENSE.txt`); they are not changed, except one import path in
`tests/linking/example_web.mjs`, which points at `../../runtime/`.
The rest of this folder is this repository's own code, Apache-2.0.
