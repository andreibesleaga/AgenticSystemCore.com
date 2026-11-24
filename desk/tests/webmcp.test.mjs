// The Brief Desk's actions offered as WebMCP tools (webmcp-tools.js): what is registered,
// that a tool runs the action itself, and that a change to the brief waits for the visitor.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { StubDocument } from "./stub_document.mjs";
import { Fixtures } from "./fixtures.mjs";

const BASE = "http://localhost:8080";
const FIXTURES = new Fixtures(BASE).install();
const ID = Fixtures.id16;
globalThis.document = StubDocument.fromHtml(await readFile(new URL("../section.html", import.meta.url), "utf8"), `${BASE}/`);
document.getElementById("desk").setAttribute("data-node-origin", FIXTURES.node);
const { BriefDesk } = await import("../page.js");
const { DeskWebMcp } = await import("../webmcp-tools.js");

/** A stand-in for document.modelContext that keeps what is registered. */
class StubModelContext {
  constructor(refuse = []) {
    this.tools = new Map();
    this.refuse = new Set(refuse);
  }

  registerTool(tool) {
    if (this.refuse.has(tool.name)) throw new Error("InvalidStateError");
    this.tools.set(tool.name, tool);
  }

  call(name, args) {
    return this.tools.get(name).execute(args);
  }
}

/** Registers a fresh set of tools with the given confirmation answer. */
function toolsWith(confirm) {
  DeskWebMcp.state = { registered: [], rejected: [], transport: "webmcp" };
  const context = new StubModelContext();
  DeskWebMcp.register(context, confirm);
  return context;
}

const NAMES = ["desk_get_desk_state", "desk_search_passages", "desk_read_passage", "desk_check_brief",
  "desk_check_citations", "desk_add_card", "desk_remove_card", "desk_discard_brief"];

test("with no WebMCP in the browser nothing is registered", () => {
  // The page started with this section and no document.modelContext, as in a browser without WebMCP.
  assert.deepEqual(globalThis.BRIEF_DESK_WEBMCP.registered, []);
  const before = DeskWebMcp.state.registered.length;
  DeskWebMcp.register(undefined);
  DeskWebMcp.register({});
  assert.equal(DeskWebMcp.state.registered.length, before);
});

test("the eight actions are registered as desk_ tools, read-only where they change nothing", () => {
  const context = toolsWith(async () => true);
  assert.deepEqual([...context.tools.keys()], NAMES);
  for (const tool of context.tools.values()) {
    assert.ok(!tool.description.includes("website_"), `${tool.name} names a runtime tool`);
    const changes = ["desk_add_card", "desk_remove_card", "desk_discard_brief"].includes(tool.name);
    assert.equal(tool.annotations.readOnlyHint, !changes, tool.name);
    assert.equal(tool.inputSchema.type, "object");
  }
  assert.deepEqual(DeskWebMcp.state.registered, NAMES);
});

test("a tool runs the action itself: a search returns addresses and asks nothing", async () => {
  let asked = 0;
  const context = toolsWith(async () => { asked += 1; return true; });
  const result = await context.call("desk_search_passages", { node: "core", query: "k7k ledger", limit: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.count, 3);
  assert.equal(result.passages[0].address, `${FIXTURES.core[6].iri}#chunk-${ID(FIXTURES.core[6])}`);
  assert.equal(asked, 0);
});

test("arguments outside the schema run nothing", async () => {
  const context = toolsWith(async () => true);
  const before = BriefDesk.page.getState().brief.version;
  for (const args of [{ node: "core" }, { node: "core", passage: "short" }, { node: "core", passage: ID(FIXTURES.core[0]), extra: 1 }, "text"]) {
    const result = await context.call("desk_add_card", args);
    assert.equal(result.ok, false);
    assert.match(result.reason, /^Nothing ran/);
  }
  assert.equal(BriefDesk.page.getState().brief.version, before);
});

test("a change to the brief runs only after the visitor confirms it on the page", async () => {
  const passage = ID(FIXTURES.core[0]);
  const items = [];
  const declined = toolsWith(async (item) => { items.push(item); return false; });
  const refused = await declined.call("desk_add_card", { node: "core", passage });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /did not confirm/);
  assert.equal(BriefDesk.page.getState().brief.cards.length, 0);
  assert.deepEqual(items[0], { action: "add_card", arguments: { node: "core", passage }, origin: BASE, effect: "irreversible" });

  const accepted = toolsWith(async () => true);
  const added = await accepted.call("desk_add_card", { node: "core", passage });
  assert.equal(added.ok, true);
  assert.equal(BriefDesk.page.getState().brief.cards.length, 1);
});

test("the page's own refusal before the dialog comes back as the reason", async () => {
  const context = toolsWith(async () => { throw new Error("This passage is already in your brief as card c1."); });
  const result = await context.call("desk_add_card", { node: "core", passage: ID(FIXTURES.core[0]) });
  assert.deepEqual(result, { ok: false, reason: "This passage is already in your brief as card c1." });
});

test("a refused registration leaves the other tools registered", () => {
  DeskWebMcp.state = { registered: [], rejected: [], transport: "webmcp" };
  const context = new StubModelContext(["desk_discard_brief"]);
  DeskWebMcp.register(context, async () => true);
  assert.equal(context.tools.size, 7);
  assert.deepEqual(DeskWebMcp.state.rejected, ["desk_discard_brief"]);
});
