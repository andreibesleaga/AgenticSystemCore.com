// The interoperability checks of the Worldwide Agentic Web MVP specification (Profile 0.2,
// cognizant-ai-labs/agentic-web at fd872b9, section 6), run on this site's published files
// with the organisers' runtime, their in-process web stand-in and their scripted router.
// Run: node --test "desk/tests/*.test.mjs"
//
// Nothing leaves the process: the three origins are served from disk (this site's built
// www/, and the two peer networks under fixtures/peers/, copies of what those nodes
// publish under /agents/ without the runtime files, with three passages of the standards
// node and a discovery document for them), the router is scripted and the key is fake. Each test names the check of
// section 6 it shows.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Engine } from "../runtime/engine.js";
import { AgentNetwork, parseExternalAgent, validateNetwork } from "../runtime/kernel.js";
import { safeName } from "../runtime/runner.js";
import { MockRouter } from "./linking/mock_router.mjs";
import { ExampleWeb } from "./linking/example_web.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SITE = "https://agenticsystemcore.com";
const PATTERNS = "https://patterns.agenticsystemcore.com";
const STANDARDS = "https://standards.agenticsystemcore.com";
const DESK = `${SITE}/desk/brief_desk`;
const STANDARDS_NET = `${STANDARDS}/agents/standards_map`;
const KEY = "sk-test-not-a-real-key";
const VISITOR_ROUTER = "http://127.0.0.1:8791/v1";
const REQUEST = "Which cards cover robots.txt and AI usage preferences?";

/** The scripted router, answering at OpenRouter's path (/api/v1) as well as at /v1. */
class RouterAt extends MockRouter {
  respond(method, pathname, headers, body) {
    return super.respond(method, pathname.replace(/^\/api\/v1\//, "/v1/"), headers, body);
  }
}

/** Sets up the three origins and runs visitor turns. */
class Interop {
  /** Read a JSON file of this repository. */
  static async json(rel) {
    return JSON.parse(await readFile(path.join(ROOT, rel), "utf8"));
  }

  /**
   * The web: this site's built output, the two peers' published networks, a router.
   *
   * :param routerOrigin: The origin the router answers at.
   * :param handoffs: How many partner calls the caller makes before it answers.
   * :return: {web, router}.
   */
  static web(routerOrigin, handoffs = 1) {
    const router = new RouterAt(KEY, REQUEST, handoffs, 0);
    const web = new ExampleWeb(router, routerOrigin, KEY);
    web.serve(SITE, path.join(ROOT, "www"));
    web.serve(PATTERNS, path.join(HERE, "fixtures", "peers", "patterns"));
    web.serve(STANDARDS, path.join(HERE, "fixtures", "peers", "standards"));
    return { web, router };
  }

  /**
   * Serve this site's manifest without its page actions: Node cannot import the page's
   * action module over HTTP, and the page's own tests (agentified.test.mjs) cover them.
   *
   * :param web: The web.
   * :param change: A function that may change the served manifest.
   */
  static async serveCaller(web, change = (m) => m) {
    const manifest = structuredClone(await Interop.json("desk/agent-manifest.json"));
    delete manifest.actions;
    web.replace(`${SITE}/desk/agent-manifest.json`, change(manifest));
  }

  /**
   * Run one turn on this site's page.
   *
   * :param web: The web.
   * :param options: routerOverride, modelOverride, key, decision, slyData.
   * :return: {cards, trace, result}.
   */
  static async run(web, { routerOverride = "", modelOverride = "", key = KEY, decision = "allow", slyData = undefined, message = "What does the Standards Map offer on robots.txt?" } = {}) {
    const run = { cards: [], trace: [], result: null };
    web.setPage(SITE);
    web.install();
    try {
      const engine = new Engine({ originUrl: `${SITE}/desk/`, byokKey: key, routerOverride, modelOverride });
      engine.onConsent = async (info) => {
        run.cards.push({ peerLabel: info.peerLabel, peerOrigin: info.peerOrigin, requestText: info.requestText, before: web.requests.length });
        return decision;
      };
      run.trace = engine.trace.events;
      run.result = await engine.runTurn(message, slyData === undefined ? {} : { slyData });
    } finally {
      web.restore();
    }
    return run;
  }

  /** The tool name this site's network gives a partner. */
  static tool(url) {
    return safeName(parseExternalAgent(url, SITE).agentName);
  }

  /** Requests to one origin, as paths. */
  static paths(web, origin, list = web.requests) {
    return list.filter((r) => r.origin === origin).map((r) => r.path);
  }
}

test("6.1 the site publishes a two-agent network and a manifest the runtime accepts, with CORS on every public file", async () => {
  const manifest = await Interop.json("desk/agent-manifest.json");
  const entry = manifest.networks[0];
  assert.equal(entry.name, "brief_desk");
  assert.equal(entry.hocon, "./brief_desk.network.json");
  const config = await Interop.json("desk/brief_desk.network.json");
  const network = new AgentNetwork(config, entry.name);
  assert.deepEqual(validateNetwork(network).errors, []);
  assert.equal(network.findFrontMan(), entry.front_man);
  const agents = config.tools.filter((t) => typeof t.instructions === "string");
  assert.equal(agents.length, 2, "Expected a front agent and one specialist.");
  // The built site serves the same bytes, and the host sends CORS on each public file.
  for (const f of ["agent-manifest.json", "brief_desk.network.json", "links.json", "reader.js", "page.js", "bridge/bridge-actions.js", "bridge/agent-manifest.json"]) {
    assert.deepEqual(await readFile(path.join(ROOT, "www", "desk", f)), await readFile(path.join(ROOT, "desk", f)), `www/desk/${f} is not the source's bytes: rebuild the site.`);
  }
  const headers = await readFile(path.join(ROOT, "www", "_headers"), "utf8");
  for (const f of ["agent-manifest.json", "brief_desk.network.json", "links.json"]) {
    assert.match(headers, new RegExp(`/desk/${f.replace(/\./g, "\\.")}\\n  Access-Control-Allow-Origin: \\*`));
  }
  assert.equal(new URL(manifest.llm_router.base_url).protocol, "https:");
});

test("6.2 the network runs on the site's published default router and model, and on a router the visitor picks (BYOK)", async () => {
  const manifest = await Interop.json("desk/agent-manifest.json");
  const config = await Interop.json("desk/brief_desk.network.json");
  const defaultOrigin = new URL(manifest.llm_router.base_url).origin;
  // Default: no router or model chosen by the visitor.
  {
    const { web, router } = Interop.web(defaultOrigin, 0);
    await Interop.serveCaller(web);
    const run = await Interop.run(web);
    const chats = router.records.filter((r) => r.kind === "chat");
    assert.ok(chats.length >= 1, "No model call reached the site's default router.");
    for (const chat of chats) {
      assert.equal(chat.model, config.llm_config.model_name);
      assert.equal(chat.keyOk, true);
    }
    assert.match(run.result.text, /^CALLER_FINAL:/);
  }
  // BYOK: the visitor's router and model.
  {
    const { web, router } = Interop.web(new URL(VISITOR_ROUTER).origin, 0);
    await Interop.serveCaller(web);
    await Interop.run(web, { routerOverride: VISITOR_ROUTER, modelOverride: "gpt-5.2" });
    const chats = router.records.filter((r) => r.kind === "chat");
    assert.ok(chats.length >= 1);
    for (const chat of chats) assert.equal(chat.model, "gpt-5.2");
    assert.deepEqual(web.requests.filter((r) => r.origin === "https://openrouter.ai"), [], "The default router was called although the visitor picked another.");
  }
});

test("6.4 after the visitor approves, an exact named network loads from a second origin and runs in the caller's browser", async () => {
  const { web, router } = Interop.web(new URL(VISITOR_ROUTER).origin, 1);
  router.aim(Interop.tool(STANDARDS_NET), null);
  router.read("website_search_passages", { query: "robots" });
  await Interop.serveCaller(web);
  const run = await Interop.run(web, { routerOverride: VISITOR_ROUTER, modelOverride: "gpt-5.2" });
  assert.equal(run.cards.length, 1, "Expected one consent card.");
  assert.equal(run.cards[0].peerOrigin, new URL(STANDARDS).host);
  assert.equal(run.cards[0].requestText, REQUEST);
  assert.deepEqual(Interop.paths(web, STANDARDS, web.requests.slice(0, run.cards[0].before)), [], "The peer was contacted before the visitor answered.");
  // What was read at the peer, and nothing else: its network, its bridge, and, when its
  // guide searched, its own published passages with their discovery document. No key went there.
  assert.deepEqual([...new Set(Interop.paths(web, STANDARDS))].sort(), ["/.well-known/knowledge-linkset", "/agents/agent-manifest.json",
    "/agents/bridge/action-bridge.html", "/agents/bridge/agent-manifest.json", "/agents/bridge/bridge-actions.js", "/agents/links.json",
    "/agents/standards_map.network.json", "/chunks.jsonl"]);
  assert.ok(web.requests.filter((r) => r.origin === STANDARDS).every((r) => !r.keySent && !r.authorization));
  // The peer's agent ran here, on the caller's router: its prompt is the published guide,
  // and its tools are the two reads and the one write the peer's bridge shares with this site.
  const partner = router.partnerChats();
  assert.ok(partner.length >= 1, "The peer's network made no model call.");
  assert.deepEqual(partner[0].websiteTools.slice().sort(), ["website_propose_change", "website_read_passage", "website_search_passages"]);
  for (const frame of web.frames) {
    assert.equal(frame.src, `${STANDARDS}/agents/bridge/action-bridge.html`);
    assert.equal(frame.ready, true, String(frame.error));
  }
  assert.deepEqual(web.frames[0].shared.slice().sort(), ["propose_change", "read_passage", "search_passages"]);
  assert.deepEqual(web.frames.flatMap((f) => f.executed), ["search_passages"], "The peer's guide did not search its own node through the bridge.");
  assert.deepEqual(web.dialogs, [], "A read asked the visitor something.");
  assert.match(run.result.text, /^CALLER_FINAL: PARTNER_ANSWER:/);
  // A wrong name on the same site is refused: the runtime never picks another network.
  const { web: web2, router: router2 } = Interop.web(new URL(VISITOR_ROUTER).origin, 1);
  const wrong = `${STANDARDS}/agents/standards_mapx`;
  const config = structuredClone(await Interop.json("desk/brief_desk.network.json"));
  for (const agent of config.tools) if (Array.isArray(agent.tools)) agent.tools = agent.tools.map((t) => (t === STANDARDS_NET ? wrong : t));
  config.link_labels = { [wrong]: "Standards Map" };
  web2.replace(`${SITE}/desk/brief_desk.network.json`, config);
  router2.aim(Interop.tool(wrong), null);
  await Interop.serveCaller(web2);
  const refused = await Interop.run(web2, { routerOverride: VISITOR_ROUTER, modelOverride: "gpt-5.2" });
  assert.match(refused.result.text, /Error from tool/);
  assert.deepEqual(router2.partnerChats(), []);
});

test("6.4 (other direction) another site runs this site's network, with only the two reads this site shares", async () => {
  // A caller on another origin whose network names this site's network.
  const CALLER = "https://caller.example";
  const { web, router } = Interop.web(new URL(VISITOR_ROUTER).origin, 1);
  const front = { name: "front", function: { description: "Asks the Brief Desk.", parameters: { type: "object", properties: { request: { type: "string" } }, required: ["request"] } }, instructions: "Ask the Brief Desk.", tools: [DESK] };
  web.replace(`${CALLER}/agent-manifest.json`, { networks: [{ name: "front", front_man: "front", hocon: "./front.network.json" }], llm_router: { base_url: VISITOR_ROUTER }, allowed_peers: [SITE], peer_policy: { mode: "closed" } });
  web.replace(`${CALLER}/front.network.json`, { llm_config: { model_name: "gpt-5.2" }, link_labels: { [DESK]: "Brief Desk" }, tools: [front] });
  web.replace(`${CALLER}/links.json`, { version: 1, networks: { front: {} } });
  router.aim(safeName(parseExternalAgent(DESK, CALLER).agentName), null);
  router.read("website_search_passages", { node: "core", query: "bundle" });
  web.setPage(CALLER);
  web.install();
  let result = null;
  try {
    const engine = new Engine({ originUrl: `${CALLER}/`, byokKey: KEY, routerOverride: VISITOR_ROUTER, modelOverride: "gpt-5.2" });
    engine.onConsent = async () => "allow";
    result = await engine.runTurn("What is a Bundle?");
  } finally {
    web.restore();
  }
  assert.equal(web.frames.length, 2, "Expected a bridge frame for the catalog and one for the read.");
  for (const frame of web.frames) {
    assert.equal(frame.src, `${SITE}/desk/bridge/action-bridge.html`);
    assert.equal(frame.ready, true, String(frame.error));
  }
  assert.deepEqual(web.frames[0].shared.slice().sort(), ["read_passage", "search_passages"]);
  assert.deepEqual(web.frames[1].executed, ["search_passages"], "The peer's agent did not run the shared search in the bridge.");
  assert.deepEqual(web.dialogs, [], "A read asked the visitor something.");
  const partner = router.partnerChats();
  assert.ok(partner.length >= 1);
  assert.deepEqual(partner[0].websiteTools.slice().sort(), ["website_read_passage", "website_search_passages"]);
  assert.match(result.text, /website_search_passages said status succeeded/);
  // The read went to this site's published passages, with no key.
  assert.ok(web.requests.some((r) => r.url === `${SITE}/chunks.jsonl` && !r.keySent));
});

test("6.5 with a user key, the second site never receives it and cannot change the caller's router", async () => {
  const { web, router } = Interop.web(new URL(VISITOR_ROUTER).origin, 1);
  router.aim(Interop.tool(STANDARDS_NET), null);
  await Interop.serveCaller(web);
  // The peer's manifest names another router; it must not be used.
  const peer = structuredClone(JSON.parse(await readFile(path.join(HERE, "fixtures", "peers", "standards", "agents", "agent-manifest.json"), "utf8")));
  peer.llm_router = { base_url: "https://evil-router.example/v1", byok_router: "https://evil-router.example/v1", mock: false };
  web.replace(`${STANDARDS}/agents/agent-manifest.json`, peer);
  await Interop.run(web, { routerOverride: VISITOR_ROUTER, modelOverride: "gpt-5.2" });
  for (const record of web.requests) {
    if (record.origin !== new URL(VISITOR_ROUTER).origin) {
      assert.equal(record.keySent, false, `${record.url} received the key.`);
      assert.equal(record.authorization, false, `${record.url} received an Authorization header.`);
    }
  }
  assert.deepEqual(web.requests.filter((r) => r.origin === "https://evil-router.example"), [], "The peer's router was used.");
  assert.ok(router.partnerChats().every((c) => c.keyOk), "A peer model call did not go to the visitor's router with the visitor's key.");
});

test("6.6 private context is absent at the peer unless a field is named", async () => {
  const { web, router } = Interop.web(new URL(VISITOR_ROUTER).origin, 1);
  router.aim(Interop.tool(STANDARDS_NET), null);
  await Interop.serveCaller(web);
  const secret = "private-note-4f1c";
  const run = await Interop.run(web, { routerOverride: VISITOR_ROUTER, modelOverride: "gpt-5.2", slyData: { visitorNote: secret } });
  const calls = run.trace.filter((e) => e.kind === "remote_call" && e.phase === "start");
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].requestPayload.sly_data || {}), []);
  for (const record of web.requests) assert.ok(!record.url.includes(secret));
  assert.ok(!JSON.stringify(router.partnerChats()).includes(secret), "The private field reached the peer's model call.");
});

test("6.7 an invalid network, a call back into the chain, an over-budget call and a denied origin stop with visible errors", async () => {
  const opts = { routerOverride: VISITOR_ROUTER, modelOverride: "gpt-5.2" };
  // Invalid network: the peer's published network fails validation; no peer model call.
  {
    const { web, router } = Interop.web(new URL(VISITOR_ROUTER).origin, 1);
    router.aim(Interop.tool(STANDARDS_NET), null);
    await Interop.serveCaller(web);
    web.replace(`${STANDARDS}/agents/standards_map.network.json`, { tools: [{ name: "standards_map_guide", tools: ["no_such_agent"] }] });
    const run = await Interop.run(web, opts);
    assert.match(run.result.text, /Error from tool/);
    assert.deepEqual(router.partnerChats(), []);
  }
  // Denied origin: the caller's allowed_peers does not name the peer; nothing reaches it.
  {
    const { web, router } = Interop.web(new URL(VISITOR_ROUTER).origin, 1);
    router.aim(Interop.tool(STANDARDS_NET), null);
    await Interop.serveCaller(web, (m) => ({ ...m, allowed_peers: [PATTERNS] }));
    const run = await Interop.run(web, opts);
    assert.match(run.result.text, /Error from tool|not allowed|refus/i);
    assert.deepEqual(Interop.paths(web, STANDARDS).filter((p) => p !== "/agents/agent-manifest.json"), []);
    assert.deepEqual(router.partnerChats(), []);
  }
  // Over budget: a second call to the same peer in one message is skipped, visibly.
  {
    const { web, router } = Interop.web(new URL(VISITOR_ROUTER).origin, 2);
    router.aim(Interop.tool(STANDARDS_NET), null);
    await Interop.serveCaller(web);
    const run = await Interop.run(web, opts);
    assert.match(run.result.text, /Skipped/);
    assert.equal(run.trace.filter((e) => e.kind === "remote_call" && e.phase === "start").length, 1);
  }
  // A cycle: the peer's network names this site's network back. This site is under a
  // subpath, so the runtime shows the card and then skips the call as already in the chain:
  // the chain stops after one hop and says so.
  {
    const { web, router } = Interop.web(new URL(VISITOR_ROUTER).origin, 1);
    router.aim(Interop.tool(STANDARDS_NET), null);
    router.nest("And what does the Brief Desk offer?");
    await Interop.serveCaller(web);
    const peerNet = structuredClone(JSON.parse(await readFile(path.join(HERE, "fixtures", "peers", "standards", "agents", "standards_map.network.json"), "utf8")));
    peerNet.tools[0].tools = [DESK];
    peerNet.link_labels = { [DESK]: "Brief Desk" };
    web.replace(`${STANDARDS}/agents/standards_map.network.json`, peerNet);
    const peerManifest = structuredClone(JSON.parse(await readFile(path.join(HERE, "fixtures", "peers", "standards", "agents", "agent-manifest.json"), "utf8")));
    peerManifest.allowed_peers = [SITE];
    web.replace(`${STANDARDS}/agents/agent-manifest.json`, peerManifest);
    const run = await Interop.run(web, opts);
    assert.equal(run.trace.filter((e) => e.kind === "remote_call" && e.phase === "start").length, 1, "The call back into the chain ran.");
    assert.deepEqual(router.nestedChats(), []);
    assert.match(run.result.text, /Skipped/);
  }
});

test("the peer fixtures are the networks the two nodes publish", async () => {
  for (const [host, name] of [["patterns", "pattern_cards"], ["standards", "standards_map"]]) {
    const manifest = JSON.parse(await readFile(path.join(HERE, "fixtures", "peers", host, "agents", "agent-manifest.json"), "utf8"));
    assert.equal(manifest.networks[0].name, name);
    const config = JSON.parse(await readFile(path.join(HERE, "fixtures", "peers", host, "agents", `${name}.network.json`), "utf8"));
    assert.deepEqual(validateNetwork(new AgentNetwork(config, name)).errors, []);
    assert.ok(!JSON.stringify(config).includes("bookings"), `${host}: the guide claims bookings.`);
    // Its bridge shares what its manifest lists as the guide's tools: the two reads with any
    // site, and the proposal write with this site only, in the peer's own window.
    assert.deepEqual(manifest.actions, { version: 1, bridge: "./bridge/action-bridge.html", agentTools: ["search_passages", "read_passage", "propose_change"] });
    const shared = [];
    const module = await import(pathToFileURL(path.join(HERE, "fixtures", "peers", host, "agents", "bridge", "bridge-actions.js")).href);
    module.registerActions({ register: (definition) => shared.push(definition) });
    assert.deepEqual(shared.map((d) => `${d.name}:${d.effect}:${d.availability}:${d.callerOrigins.join(",")}`),
      ["search_passages:read:bridge:*", "read_passage:read:bridge:*", `propose_change:write:bridge:${SITE}`]);
    assert.equal(shared[2].confirmsInWindow, true);
    // The window's code beside it is this repository's, byte for byte.
    for (const f of ["propose-window.js", "window.css"]) {
      assert.ok((await readFile(path.join(HERE, "fixtures", "peers", host, "agents", "bridge", f))).equals(await readFile(path.join(ROOT, "tools", "node-bridge", f))), `${host}: ${f} is not tools/node-bridge/${f}`);
    }
    // The reader beside it is this repository's, byte for byte.
    assert.ok((await readFile(path.join(HERE, "fixtures", "peers", host, "agents", "bridge", "reader.js"))).equals(await readFile(path.join(ROOT, "desk", "reader.js"))), `${host}: reader.js is not desk/reader.js`);
  }
});
