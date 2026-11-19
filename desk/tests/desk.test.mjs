// Checks the Brief Desk page's own rules: what a search and a read return, the digest
// check, the brief's limits, and that another site is read only after the visitor allows
// it. Run: node --test "desk/tests/*.test.mjs"
// The tests use the real page code with fixture passage files; nothing reaches a network.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ActionRegistry } from "../runtime/actions.js";
import { StubDocument } from "./stub_document.mjs";
import { Fixtures } from "./fixtures.mjs";

const BASE = "http://localhost:8080";
const FIXTURES = new Fixtures(BASE).install();
const ID = Fixtures.id16;
globalThis.document = StubDocument.fromHtml(await readFile(new URL("../section.html", import.meta.url), "utf8"), `${BASE}/`);
// The stand-in knows the ids of section.html, not its attributes: state the node's published
// origin as section.html does.
document.getElementById("desk").setAttribute("data-node-origin", FIXTURES.node);
const { BriefDesk } = await import("../page.js");
const { registerActions } = await import("../site-actions.js");
const SCOPE = { base: BASE, network: "brief_desk" };

/** Page-level checks of the Brief Desk. All tests share one page and run in order. */
class BriefDeskTest {
  /** The page object the page script made when it loaded. */
  static get page() {
    return BriefDesk.page;
  }

  /**
   * Run one registered action as the runtime would, approving any confirmation.
   *
   * :param name: The action name.
   * :param args: Its arguments.
   * :return: The receipt.
   */
  static async run(name, args) {
    const registry = new ActionRegistry();
    await registerActions({ register: registry.register.bind(registry, SCOPE) });
    const entry = registry.catalog(SCOPE).find((e) => e.name === name);
    const plan = registry.prepare({ kind: "action", action: entry.ref, arguments: args });
    const receipts = await registry.execute(plan, async () => true, "desk-test");
    return receipts[0];
  }

  /** A search ranks a title match first, returns addresses, and leaves the page as it was. */
  static async testSearchReadsOnly() {
    const before = document.snapshot();
    const state = BriefDeskTest.page.getState();
    const receipt = await BriefDeskTest.run("search_passages", { node: "core", query: "k7k ledger", limit: 3 });
    assert.equal(receipt.status, "succeeded");
    const result = receipt.result;
    assert.equal(result.ok, true);
    assert.equal(result.count, 3);
    const seventh = FIXTURES.core[6];
    assert.equal(result.passages[0].passage, ID(seventh));
    assert.equal(result.passages[0].address, `${seventh.iri}#chunk-${ID(seventh)}`);
    assert.equal(result.passages[0].title, "Item 7");
    assert.deepEqual(document.snapshot(), before);
    assert.deepEqual(BriefDeskTest.page.getState(), state);
    // Words too common to search for are refused with the page's reason.
    const empty = await BriefDeskTest.run("search_passages", { node: "core", query: "of the" });
    assert.equal(empty.result.ok, false);
    assert.equal(empty.result.field, "query");
    // A query nothing matches is an honest empty result, not a refusal.
    const none = await BriefDeskTest.run("search_passages", { node: "core", query: "zebra quartz" });
    assert.equal(none.result.ok, true);
    assert.equal(none.result.count, 0);
  }

  /** A read recomputes the digest: true for an unchanged passage, false for a changed one. */
  static async testReadChecksTheDigest() {
    const good = await BriefDeskTest.run("read_passage", { node: "core", passage: ID(FIXTURES.core[2]) });
    assert.equal(good.result.ok, true);
    assert.equal(good.result.digestMatches, true);
    assert.equal(good.result.text, FIXTURES.core[2].text);
    assert.equal(good.result.digest, FIXTURES.core[2].digest);
    assert.equal(good.result.licenseUrl, `${FIXTURES.node}/legal/`);
    const changed = await BriefDeskTest.run("read_passage", { node: "core", passage: ID(FIXTURES.tampered) });
    assert.equal(changed.result.ok, true);
    assert.equal(changed.result.digestMatches, false);
    // A passage id the node does not have is refused.
    const missing = await BriefDeskTest.run("read_passage", { node: "core", passage: "0000000000000000" });
    assert.equal(missing.result.ok, false);
    assert.equal(missing.result.field, "passage");
  }

  /** A passage whose text does not match its digest never becomes a card. */
  static async testChangedPassageIsNotAdded() {
    const before = BriefDeskTest.page.getState();
    const receipt = await BriefDeskTest.run("add_card", { node: "core", passage: ID(FIXTURES.tampered) });
    assert.equal(receipt.status, "succeeded");
    assert.equal(receipt.result.ok, false);
    assert.match(receipt.result.reason, /does not match the digest/);
    assert.deepEqual(BriefDeskTest.page.getState(), before);
  }

  /**
   * Another site is not read, and not even asked for, until the visitor ticks it. The
   * tick is the page's own checkbox: no action can set it.
   */
  static async testOtherSiteNeedsTheVisitor() {
    const asked = () => FIXTURES.requests.filter((url) => url.startsWith(FIXTURES.patterns)).length;
    assert.equal(asked(), 0);
    const refused = await BriefDeskTest.run("search_passages", { node: "patterns", query: "supervisor" });
    assert.equal(refused.result.ok, false);
    assert.match(refused.result.reason, /has not allowed this page to read patterns\.agenticsystemcore\.com/);
    const refusedRead = await BriefDeskTest.run("read_passage", { node: "patterns", passage: ID(FIXTURES.patternCards[0]) });
    assert.equal(refusedRead.result.ok, false);
    const refusedAdd = await BriefDeskTest.run("add_card", { node: "patterns", passage: ID(FIXTURES.patternCards[0]) });
    assert.equal(refusedAdd.result.ok, false);
    assert.equal(asked(), 0, "The page asked the other site for a file before the visitor allowed it.");
    // No registered action allows a node.
    const registry = new ActionRegistry();
    await registerActions({ register: registry.register.bind(registry, SCOPE) });
    const names = registry.catalog(SCOPE).map((e) => e.name).sort();
    assert.deepEqual(names, ["add_card", "discard_brief", "get_desk_state", "read_passage", "remove_card", "search_passages"]);
    // The visitor ticks the box.
    const box = document.getElementById("desk-allow-patterns");
    box.checked = true;
    box.dispatch("change");
    assert.equal(BriefDeskTest.page.getState().nodes.find((n) => n.id === "patterns").allowed, true);
    const allowed = await BriefDeskTest.run("search_passages", { node: "patterns", query: "supervisor" });
    assert.equal(allowed.result.ok, true);
    assert.equal(allowed.result.passages[0].title, "Supervisor");
    assert.equal(asked(), 1);
    // Unticking stops it again.
    box.checked = false;
    box.dispatch("change");
    const stopped = await BriefDeskTest.run("search_passages", { node: "patterns", query: "supervisor" });
    assert.equal(stopped.result.ok, false);
    // The page's own node cannot be switched off.
    assert.equal(BriefDeskTest.page.setAllowed("core", false).ok, false);
  }

  /** A passage file that names an item on another origin is not used. */
  static async testForeignItemsAreRefused() {
    const box = document.getElementById("desk-allow-standards");
    box.checked = true;
    box.dispatch("change");
    const receipt = await BriefDeskTest.run("search_passages", { node: "standards", query: "stray" });
    // The operation throws, which the runtime reports as an unknown outcome of a read.
    assert.equal(receipt.status, "unknown");
    box.checked = false;
    box.dispatch("change");
  }

  /** The brief refuses a duplicate and a ninth card, and a removal names a real card. */
  static async testBriefLimits() {
    const page = BriefDeskTest.page;
    for (const card of page.getState().brief.cards) {
      page.remove({ card: card.card });
    }
    for (let i = 0; i < 8; i += 1) {
      const added = await BriefDeskTest.run("add_card", { node: "core", passage: ID(FIXTURES.core[i]) });
      assert.equal(added.result.ok, true, added.result.reason);
      assert.equal(added.result.count, i + 1);
    }
    const version = page.getState().brief.version;
    const duplicate = await BriefDeskTest.run("add_card", { node: "core", passage: ID(FIXTURES.core[0]) });
    assert.equal(duplicate.result.ok, false);
    assert.match(duplicate.result.reason, /already in the brief/);
    const ninth = await BriefDeskTest.run("add_card", { node: "core", passage: ID(FIXTURES.core[8]) });
    assert.equal(ninth.result.ok, false);
    assert.match(ninth.result.reason, /8 cards at most/);
    assert.equal(page.getState().brief.version, version);
    const unknown = await BriefDeskTest.run("remove_card", { card: "c999" });
    assert.equal(unknown.result.ok, false);
    const first = page.getState().brief.cards[0];
    const removed = await BriefDeskTest.run("remove_card", { card: first.card });
    assert.equal(removed.result.ok, true);
    assert.equal(removed.result.count, 7);
    assert.equal(page.getState().brief.version, version + 1);
    assert.equal(document.getElementById("desk-brief").children.length, 7);
  }

  /** The Markdown of the brief gives each card's address and digest. */
  static async testBriefAsMarkdown() {
    const page = BriefDeskTest.page;
    const text = page.briefMarkdown();
    for (const card of page.getState().brief.cards) {
      assert.ok(text.includes(`<${card.address}>`));
      assert.ok(text.includes(`sha-256 ${card.digest}`));
    }
    assert.ok(text.startsWith("# Brief\n"));
  }

  /** An empty brief cannot be discarded, by the action or by the page's button. */
  static async testEmptyBriefIsRefused() {
    const page = BriefDeskTest.page;
    for (const card of page.getState().brief.cards) {
      page.remove({ card: card.card });
    }
    const version = page.getState().brief.version;
    assert.deepEqual(page.checkDiscard({ expectedVersion: version }), {
      ok: false,
      reason: "The brief is already empty.",
      field: "expectedVersion",
    });
    const receipt = await BriefDeskTest.run("discard_brief", { expectedVersion: version });
    assert.equal(receipt.result.ok, false);
    document.getElementById("desk-discard").dispatch("click");
    assert.equal(document.getElementById("desk-status").textContent, "The brief is already empty.");
    assert.equal(page.getState().brief.version, version);
  }

  /** The page's own search form shows results, and its button adds a card. */
  static async testThePageWorksWithoutTheAssistant() {
    document.getElementById("desk-query").value = "Item 3";
    document.getElementById("desk-node").value = "core";
    const form = document.getElementById("desk-search-form");
    form.dispatch("submit", { preventDefault() {} });
    // The handler is async: wait for the fetch and the render.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const results = document.getElementById("desk-results");
    assert.ok(results.children.length > 0);
    assert.match(document.getElementById("desk-status").textContent, /passages? in core for "Item 3"/);
    const button = results.children[0].children.at(-1);
    assert.equal(button.textContent, "Add to brief");
    button.dispatch("click");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(BriefDeskTest.page.getState().brief.cards.length, 1);
    const card = BriefDeskTest.page.getState().brief.cards[0];
    assert.ok(results.children[0].children[0].textContent.startsWith(card.title));
    assert.equal(document.getElementById("desk-status").textContent, `Added "${card.title}" to the brief.`);
  }
}

test("a search ranks, returns addresses and changes nothing", BriefDeskTest.testSearchReadsOnly);
test("a read recomputes the digest of the passage", BriefDeskTest.testReadChecksTheDigest);
test("a passage that does not match its digest is not added", BriefDeskTest.testChangedPassageIsNotAdded);
test("another site is neither read nor asked before the visitor allows it", BriefDeskTest.testOtherSiteNeedsTheVisitor);
test("a passage file naming another origin's item is refused", BriefDeskTest.testForeignItemsAreRefused);
test("the brief refuses a duplicate and a ninth card", BriefDeskTest.testBriefLimits);
test("the brief as Markdown carries each address and digest", BriefDeskTest.testBriefAsMarkdown);
test("an empty brief cannot be discarded", BriefDeskTest.testEmptyBriefIsRefused);
test("the page's own form and buttons work without the assistant", BriefDeskTest.testThePageWorksWithoutTheAssistant);
