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
const { PassageReader } = await import("../reader.js");
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
    // The activity line logs the sites read; everything else on the page must stay as it was.
    const page = () => { const { "desk-activity": activity, ...rest } = document.snapshot(); return rest; };
    const before = page();
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
    assert.deepEqual(page(), before);
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
    assert.deepEqual(names, ["add_card", "check_brief", "check_citations", "discard_brief", "get_desk_state", "read_passage", "remove_card", "search_passages"]);
    // The visitor ticks the box.
    const box = document.getElementById("desk-allow-patterns");
    box.checked = true;
    box.dispatch("change");
    assert.equal(BriefDeskTest.page.getState().nodes.find((n) => n.id === "patterns").allowed, true);
    const allowed = await BriefDeskTest.run("search_passages", { node: "patterns", query: "supervisor" });
    assert.equal(allowed.result.ok, true);
    assert.equal(allowed.result.passages[0].title, "Supervisor");
    // Two files of that site are read, and no other: its passages and its discovery document.
    assert.deepEqual(FIXTURES.requests.filter((url) => url.startsWith(FIXTURES.patterns)),
      [`${FIXTURES.patterns}/chunks.jsonl`, `${FIXTURES.patterns}/.well-known/knowledge-linkset`]);
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

/** Two adds of the same passage started together leave one card (review of PR #45). */
BriefDeskTest.testConcurrentAddsLeaveOneCard = async () => {
  const page = BriefDeskTest.page;
  for (const card of page.getState().brief.cards) page.remove({ card: card.card });
  const args = { node: "core", passage: ID(FIXTURES.core[5]) };
  const [a, b] = await Promise.all([page.pin(args), page.pin(args)]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  assert.equal(page.getState().brief.cards.length, 1);
  // An add that is still checking when the visitor discards does not bring the card back.
  const pending = page.pin({ node: "core", passage: ID(FIXTURES.core[6]) });
  page.discard({ expectedVersion: page.getState().brief.version });
  const late = await pending;
  assert.ok(late.ok === false || page.getState().brief.cards.length === 1);
  for (const card of page.getState().brief.cards) page.remove({ card: card.card });
};

/** A passage file larger than the limit, or one that never answers, fails closed. */
BriefDeskTest.testFileLimits = async () => {
  const saved = globalThis.fetch;
  const limit = PassageReader.FILE_LIMIT;
  const wait = PassageReader.FILE_TIMEOUT_MS;
  try {
    PassageReader.FILE_LIMIT = 10;
    globalThis.fetch = async () => new Response("x".repeat(100));
    await assert.rejects(BriefDesk.fetchText("https://example.org/chunks.jsonl"), /larger than 10 bytes/);
    PassageReader.FILE_TIMEOUT_MS = 20;
    globalThis.fetch = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    await assert.rejects(BriefDesk.fetchText("https://example.org/chunks.jsonl"), /did not answer within/);
  } finally {
    globalThis.fetch = saved;
    PassageReader.FILE_LIMIT = limit;
    PassageReader.FILE_TIMEOUT_MS = wait;
  }
};

test("a search ranks, returns addresses and changes nothing", BriefDeskTest.testSearchReadsOnly);
test("a read recomputes the digest of the passage", BriefDeskTest.testReadChecksTheDigest);
test("a passage that does not match its digest is not added", BriefDeskTest.testChangedPassageIsNotAdded);
test("another site is neither read nor asked before the visitor allows it", BriefDeskTest.testOtherSiteNeedsTheVisitor);
test("a passage file naming another origin's item is refused", BriefDeskTest.testForeignItemsAreRefused);
test("the brief refuses a duplicate and a ninth card", BriefDeskTest.testBriefLimits);
test("the brief as Markdown carries each address and digest", BriefDeskTest.testBriefAsMarkdown);
test("an empty brief cannot be discarded", BriefDeskTest.testEmptyBriefIsRefused);
test("the page's own form and buttons work without the assistant", BriefDeskTest.testThePageWorksWithoutTheAssistant);
test("two adds of the same passage at once leave one card", BriefDeskTest.testConcurrentAddsLeaveOneCard);
test("a passage file over the size or time limit fails closed", BriefDeskTest.testFileLimits);

/** The passage file is compared with the digest the node's discovery document publishes. */
BriefDeskTest.testFileCheck = async () => {
  const page = BriefDeskTest.page;
  const linkset = `${FIXTURES.patterns}/.well-known/knowledge-linkset`;
  const published = FIXTURES.linksets.get(linkset);
  try {
    page.forget();
    const read = await BriefDeskTest.run("read_passage", { node: "core", passage: ID(FIXTURES.core[1]) });
    assert.equal(read.result.fileCheck, "matches");
    // A node whose discovery document publishes another digest for the file is not used.
    page.setAllowed("patterns", true);
    FIXTURES.linksets.set(linkset, () => Fixtures.linkset(FIXTURES.patterns, [...FIXTURES.patternCards, FIXTURES.core[0]]));
    await assert.rejects(page.search({ node: "patterns", query: "supervisor" }), /does not match the digest that patterns\.agenticsystemcore\.com publishes/);
    // A node whose discovery document cannot be read is not used either: nothing is read unchecked.
    FIXTURES.linksets.delete(linkset);
    await assert.rejects(page.read({ node: "patterns", passage: ID(FIXTURES.patternCards[0]) }), /could not be checked, because the discovery document of patterns\.agenticsystemcore\.com could not be read/);
    // Nor one whose discovery document names the file without a digest.
    FIXTURES.linksets.set(linkset, () => ({ linkset: [{ item: [{ href: `${FIXTURES.patterns}/chunks.jsonl` }] }] }));
    await assert.rejects(page.read({ node: "patterns", passage: ID(FIXTURES.patternCards[0]) }), /has no digest in the discovery document/);
    // With the digest published again, the node is read.
    FIXTURES.linksets.set(linkset, published);
    assert.equal((await page.read({ node: "patterns", passage: ID(FIXTURES.patternCards[0]) })).fileCheck, "matches");
  } finally {
    FIXTURES.linksets.set(linkset, published);
    page.setAllowed("patterns", false);
    page.forget();
  }
};

/** Checking the brief again shows a passage the node has changed, moved or removed since. */
BriefDeskTest.testCheckTheBriefAgain = async () => {
  const page = BriefDeskTest.page;
  for (const card of page.getState().brief.cards) page.remove({ card: card.card });
  assert.equal((await BriefDeskTest.run("check_brief", {})).result.ok, false);
  const [first, second, third, fourth] = FIXTURES.core;
  for (const record of [first, second, third, fourth]) {
    assert.equal((await page.pin({ node: "core", passage: ID(record) })).ok, true);
  }
  const version = page.getState().brief.version;
  const same = await BriefDeskTest.run("check_brief", {});
  assert.equal(same.status, "succeeded");
  assert.deepEqual(same.result.results.map((r) => r.status), ["unchanged", "unchanged", "unchanged", "unchanged"]);
  assert.equal(same.result.unchanged, 4);
  const saved = [first, second, third].map((r) => ({ ...r }));
  const at = FIXTURES.core.indexOf(third);
  try {
    // The publisher rewrites one passage, with a correct new digest: only the brief's own
    // digest can show it.
    first.text = "Passage 1 was rewritten after the brief was made. Its own keyword is k1k.";
    first.digest = (await import("node:crypto")).createHash("sha256").update(first.text, "utf8").digest("hex");
    // The same text under another passage id, and one passage removed.
    second.id = second.id.split("").reverse().join("");
    FIXTURES.core.splice(at, 1);
    const found = await page.checkBrief();
    assert.deepEqual(found.results.map((r) => r.status), ["changed", "moved", "gone", "unchanged"]);
    assert.equal(found.unchanged, 1);
    assert.equal(found.checked, 4);
    const cards = page.getState().brief.cards;
    assert.deepEqual(cards.map((c) => c.digestMatches), [false, false, false, true]);
    assert.equal(page.getState().brief.version, version, "A check must not change the brief.");
    const marks = document.getElementById("desk-brief").children.map((item) => item.children[1].textContent);
    assert.match(marks[0], /changed since it was added/);
    assert.match(marks[3], /unchanged since it was added/);
  } finally {
    Object.assign(first, saved[0]);
    Object.assign(second, saved[1]);
    FIXTURES.core.splice(at, 0, third);
    page.forget();
  }
};

/** A brief saved as Markdown can be checked later, by anyone, from its addresses and digests. */
BriefDeskTest.testCheckASavedBrief = async () => {
  const page = BriefDeskTest.page;
  const markdown = page.briefMarkdown();
  assert.match(markdown, /Check a saved brief/);
  const fresh = await page.checkSaved(markdown);
  assert.equal(fresh.ok, true);
  assert.equal(fresh.results.length, 4);
  assert.equal(fresh.unchanged, 4);
  // One digit of a digest altered: that passage no longer matches what the brief says.
  const digest = page.getState().brief.cards[0].digest;
  const altered = markdown.replace(digest, `${digest[0] === "0" ? "1" : "0"}${digest.slice(1)}`);
  const found = await page.checkSaved(altered);
  assert.deepEqual(found.results.map((r) => r.status), ["changed", "unchanged", "unchanged", "unchanged"]);
  // A passage of a node the visitor has not allowed, and one of a site this page does not read.
  const other = `- x\n  Source: <${FIXTURES.patternCards[0].iri}#chunk-${ID(FIXTURES.patternCards[0])}> (sha-256 ${FIXTURES.patternCards[0].digest}; x)\n`
    + `- y\n  Source: <https://elsewhere.example/concepts/stray/#chunk-0123456789abcdef> (sha-256 ${"a".repeat(64)}; y)\n`;
  const asked = FIXTURES.requests.length;
  const refused = await page.checkSaved(other);
  assert.deepEqual(refused.results.map((r) => r.status), ["not checked", "not checked"]);
  assert.match(refused.results[0].reason, /Tick patterns\.agenticsystemcore\.com/);
  assert.match(refused.results[1].reason, /This page reads only/);
  assert.equal(FIXTURES.requests.slice(asked).filter((url) => !url.startsWith(BASE)).length, 0, "A saved brief made the page contact another site.");
  assert.equal((await page.checkSaved("no sources here")).ok, false);
  // The page's own button shows the result.
  document.getElementById("desk-saved-text").value = altered;
  document.getElementById("desk-saved-check").dispatch("click");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(document.getElementById("desk-saved-status").textContent, "3 of 4 cited passages unchanged.");
  assert.match(document.getElementById("desk-saved-results").children[0].children[1].textContent, /^Changed:/);
  for (const card of page.getState().brief.cards) page.remove({ card: card.card });
};

test("the passage file is checked against the digest in the node's discovery document", BriefDeskTest.testFileCheck);
test("checking the brief again shows a changed, moved or removed passage", BriefDeskTest.testCheckTheBriefAgain);
test("a saved brief can be checked later from its addresses and digests", BriefDeskTest.testCheckASavedBrief);

/** A node of more than 500 items publishes a shard list; the reader reads the shards in order. */
BriefDeskTest.testShardedPassageFile = async () => {
  const origin = "https://big.example";
  const first = [Fixtures.passage(origin, "one", "One", "", "The first shard holds the word alpha9.")];
  const second = [Fixtures.passage(origin, "two", "Two", "", "The second shard holds the word beta9.")];
  const list = `${JSON.stringify({ bundle_version: "sha256:0", lines_total: 2, shards: ["/chunks-01.jsonl", "/chunks-02.jsonl"] })}\n`;
  const digest = (await import("node:crypto")).createHash("sha256").update(list, "utf8").digest("base64");
  const files = new Map([
    [`${origin}/chunks.jsonl`, list],
    [`${origin}/chunks-01.jsonl`, Fixtures.fileText(first)],
    [`${origin}/chunks-02.jsonl`, Fixtures.fileText(second)],
    [`${origin}/.well-known/knowledge-linkset`, JSON.stringify({ linkset: [{ item: [{ href: `${origin}/chunks.jsonl`, digest: [`sha-256=:${digest}:`] }] }] })],
  ]);
  const asked = [];
  const fetchText = async (url) => {
    asked.push(url);
    if (!files.has(url)) throw new Error(`${url} answered 404`);
    return files.get(url);
  };
  const reader = new PassageReader({ nodes: [{ id: "big", label: "Big", origin }], fetchText });
  const found = await reader.search({ node: "big", query: "beta9" });
  assert.equal(found.count, 1);
  const read = await reader.read({ node: "big", passage: found.passages[0].passage });
  assert.equal(read.digestMatches, true);
  assert.equal(read.fileCheck, "matches");
  assert.equal((await reader.search({ node: "big", query: "alpha9" })).count, 1);
  assert.deepEqual(asked, [`${origin}/chunks.jsonl`, `${origin}/chunks-01.jsonl`, `${origin}/chunks-02.jsonl`, `${origin}/.well-known/knowledge-linkset`]);
  // A list that names anything but the node's own shard files is refused, and so is a long one.
  files.set(`${origin}/chunks.jsonl`, JSON.stringify({ shards: ["https://elsewhere.example/chunks-01.jsonl"] }));
  reader.forget();
  await assert.rejects(reader.search({ node: "big", query: "alpha9" }), /not \/chunks-<nn>\.jsonl/);
  files.set(`${origin}/chunks.jsonl`, JSON.stringify({ shards: Array.from({ length: 21 }, (_, i) => `/chunks-${String(i + 1).padStart(2, "0")}.jsonl`) }));
  await assert.rejects(reader.search({ node: "big", query: "alpha9" }), /takes 20 at most/);
};

test("a sharded passage file is read shard by shard, from the node's own files only", BriefDeskTest.testShardedPassageFile);

/** The first minute: the buttons that need no key, and the sample questions. */
class FirstMinuteTest {
  /** Empty the shared page's brief, so each check starts from nothing. */
  static empty() {
    const page = BriefDesk.page;
    if (page.cards.length) {
      page.discard({ expectedVersion: page.version });
    }
  }

  /** "Cite the first passage" searches this site's node and adds the first result once. */
  static async testCiteAddsTheFirstPassageOnce() {
    FirstMinuteTest.empty();
    const query = BriefDesk.TRY_QUERY;
    BriefDesk.TRY_QUERY = "k7k ledger";
    try {
      const first = await BriefDesk.page.tryCite();
      assert.equal(first.ok, true, first.reason);
      assert.equal(first.already, false);
      assert.equal(first.title, "Item 7");
      assert.equal(BriefDesk.page.cards.length, 1);
      assert.equal(BriefDesk.page.cards[0].digestMatches, true);
      const second = await BriefDesk.page.tryCite();
      assert.equal(second.already, true);
      assert.equal(BriefDesk.page.cards.length, 1);
    } finally {
      BriefDesk.TRY_QUERY = query;
    }
  }

  /** The example saved brief shows the old citation changed, in words, and the new one unchanged, and leaves the brief alone. */
  static async testExampleBriefShowsAChange() {
    FirstMinuteTest.empty();
    const query = BriefDesk.TRY_QUERY;
    const saved = BriefDesk.SAVED_14_OCT;
    BriefDesk.TRY_QUERY = "k7k ledger";
    // The live page cites step 2 of "Publish a Level-0 node" as it was on 14 Oct 2026 (the browser
    // check reads it as changed on the live site). Here a fixture passage stands in, with a digest
    // its text no longer has, and a marker that finds a line of its text today.
    const older = FIXTURES.core[1];
    const marker = older.text.split(/\s+/).slice(0, 2).join(" ");
    BriefDesk.SAVED_14_OCT = { title: older.title, address: `${older.iri}#chunk-${ID(older)}`, digest: "0".repeat(64), then: "What it said before.", marker };
    try {
      const result = await BriefDesk.page.tryExample();
      assert.equal(result.ok, true, result.reason);
      assert.deepEqual(result.results.map((r) => r.status), ["changed", "unchanged"]);
      assert.equal(result.changedShown, true);
      assert.equal(result.then, "What it said before.");
      assert.ok(result.now.includes(marker), `the step read now: ${result.now}`);
      assert.equal(BriefDesk.page.cards.length, 0, "The example added a card to the brief.");
      assert.equal(document.getElementById("desk-saved").open, true);
      assert.match(document.getElementById("desk-saved-text").value, /saved on 14 Oct 2026/);
      assert.equal(document.getElementById("desk-saved-results").children.length, 2);
    } finally {
      BriefDesk.TRY_QUERY = query;
      BriefDesk.SAVED_14_OCT = saved;
    }
    // The citation of 14 Oct is real: same address on the published node, the digest of that day,
    // and the sentence of that day, whose rule the live text reverses (checked live by first-minute.mjs).
    assert.match(saved.address, /^https:\/\/agenticsystemcore\.com\/procedures\/publish-a-level-0-node\/#chunk-5054b2c80f6cb7de$/);
    assert.equal(saved.digest, "33bc2f7ed5e14ed6ea50e7aa1aca9242dba4986ebd2aaa2ad85faa62b5374700");
    assert.match(saved.then, /inherits the operator of the Bundle at Level 0, with a warning/);
  }

  /** The page's sample questions are the manifest's, and none is sent before the chat loads. */
  static async testSamplesAreTheManifests() {
    const manifest = JSON.parse(await readFile(new URL("../agent-manifest.json", import.meta.url), "utf8"));
    assert.deepEqual(BriefDesk.SAMPLES, manifest.networks[0].sample_queries);
    assert.equal(document.getElementById("desk-samples").children.length, BriefDesk.SAMPLES.length);
    const asked = BriefDesk.page.askSample(BriefDesk.SAMPLES[0]);
    assert.equal(asked.ok, false);
    assert.match(asked.reason, /AI model settings/);
    // With the chat loaded and no key: a click puts that exact question in the box, sends
    // nothing, and says a key is needed first.
    const events = [];
    const input = { value: "", disabled: false, focused: false, focus() { this.focused = true; }, dispatchEvent(e) { events.push(e.type); return true; } };
    document.provide("#ns-input", [input]);
    document.getElementById("agent-app").setAttribute("data-needs-key", "true");
    const buttons = document.getElementById("desk-samples").children.map((item) => item.children[0]);
    buttons[2].dispatch("click");
    assert.equal(input.value, BriefDesk.SAMPLES[2]);
    assert.deepEqual(events, ["input"]);
    assert.equal(input.focused, true);
    assert.match(document.getElementById("desk-samples-status").textContent, /Add your key in AI model settings below, then press Send/);
    document.getElementById("agent-app").setAttribute("data-needs-key", "false");
    buttons[0].dispatch("click");
    assert.equal(input.value, BriefDesk.SAMPLES[0]);
    assert.equal(document.getElementById("desk-samples-status").textContent, "The question is in the chat box. Press Send.");
  }
}

test("the first-minute cite button adds the first passage once, checked", FirstMinuteTest.testCiteAddsTheFirstPassageOnce);
test("the example saved brief shows an unchanged and a changed passage", FirstMinuteTest.testExampleBriefShowsAChange);
test("the sample questions are the manifest's, and the page sends none itself", FirstMinuteTest.testSamplesAreTheManifests);

/** The brief kept in the browser, and the link that re-checks it. */
class KeptBriefTest {
  /** A storage that holds strings in memory, as localStorage does. */
  static storage() {
    const items = new Map();
    return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)), items };
  }

  /** A brief survives a reload in the same browser, and comes back marked as not checked again. */
  static async testTheBriefIsKept() {
    const storage = KeptBriefTest.storage();
    const first = new BriefDesk(document, { storage });
    const found = await first.search({ node: "core", query: "k7k ledger", limit: 2 });
    for (const p of found.passages) {
      assert.equal((await first.pin({ node: "core", passage: p.passage })).ok, true);
    }
    first.remove({ card: "c1" });
    const second = new BriefDesk(document, { storage });
    assert.equal(second.restoreBrief(), 1);
    assert.deepEqual(second.cards.map((c) => [c.card, c.address, c.digest, c.check]), first.cards.map((c) => [c.card, c.address, c.digest, "not checked"]));
    assert.equal(second.nextCard, 3, "A restored brief must not reuse a card id.");
    assert.equal((await second.checkBrief()).unchanged, 1);
  }

  /** Storage that holds anything but a kept brief of this page's own nodes is ignored. */
  static testStorageIsCheckedBeforeUse() {
    for (const value of ["not json", "null", JSON.stringify({ format: 2, cards: [] }), JSON.stringify({ format: 1, cards: "x" }), JSON.stringify({ format: 1, cards: [null, 3, "c1", []] })]) {
      const storage = KeptBriefTest.storage();
      storage.setItem(BriefDesk.STORE_KEY, value);
      assert.equal(new BriefDesk(document, { storage }).restoreBrief(), 0, value);
    }
    const good = { card: "c1", node: "core", title: "T", section: "", address: `${FIXTURES.node}/concepts/x/#chunk-0123456789abcdef`, digest: "a".repeat(64), excerpt: "e" };
    const storage = KeptBriefTest.storage();
    storage.setItem(BriefDesk.STORE_KEY, JSON.stringify({ format: 1, nextCard: 2, cards: [
      good,
      { ...good, card: "c2", address: "https://elsewhere.example/concepts/x/#chunk-0123456789abcdef" },
      { ...good, card: "c3", digest: "not-a-digest" },
      { ...good, card: "c4", node: "nowhere" },
      { ...good, card: "c5" },
    ] }));
    const page = new BriefDesk(document, { storage });
    assert.equal(page.restoreBrief(), 1);
    assert.equal(page.cards[0].nodeLabel, page.nodes[0].label, "The node's label must come from the page, not from storage.");
    // With no storage at all the page still works.
    assert.equal(new BriefDesk(document, { storage: null }).restoreBrief(), 0);
    const refusing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    const blocked = new BriefDesk(document, { storage: refusing });
    assert.equal(blocked.restoreBrief(), 0);
    blocked.saveBrief();
  }

  /** The link carries each address and digest after "#", and opening it checks them. */
  static async testTheLinkRechecksTheBrief() {
    const page = new BriefDesk(document, { storage: null });
    assert.equal(page.recheckLink(), "");
    const found = await page.search({ node: "core", query: "k7k ledger", limit: 2 });
    for (const p of found.passages) {
      await page.pin({ node: "core", passage: p.passage });
    }
    const link = page.recheckLink();
    assert.ok(link.startsWith(`${page.home}#check=`));
    const markdown = BriefDesk.linkBrief(new URL(link).hash);
    assert.deepEqual(BriefDesk.savedEntries(markdown), page.cards.map((c) => ({ address: c.address, digest: c.digest })));
    assert.match(page.briefMarkdown(), new RegExp(`open <${link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`));
    for (const bad of ["", "#check=", "#check=!!", "#other=abc", `#check=${btoa("not an entry")}`]) {
      assert.equal(BriefDesk.linkBrief(bad), "", bad);
    }
    const checked = await page.verifyAll(BriefDesk.savedEntries(markdown));
    assert.equal(checked.unchanged, 2);
  }
}

test("the brief is kept in this browser and comes back after a reload", KeptBriefTest.testTheBriefIsKept);
test("kept data is checked before use, and the page works without storage", KeptBriefTest.testStorageIsCheckedBeforeUse);
test("a re-check link carries the addresses and digests and checks them", KeptBriefTest.testTheLinkRechecksTheBrief);

test("the shared citation check reports each citation, and a malformed one as not checked", async () => {
  const page = new BriefDesk(document, { storage: null });
  const found = await page.search({ node: "core", query: "k7k ledger", limit: 1 });
  const passage = await page.read({ node: "core", passage: found.passages[0].passage });
  const changed = passage.digest.slice(0, -1) + (passage.digest.endsWith("0") ? "1" : "0");
  const result = await page.checkCitations([
    { address: passage.address, digest: passage.digest.toUpperCase() },
    { address: passage.address, digest: changed },
    { address: "not an address", digest: passage.digest },
    { address: passage.address, digest: "short" },
    null,
  ]);
  assert.deepEqual(result.results.map((r) => r.status), ["unchanged", "changed", "not checked", "not checked", "not checked"]);
  assert.equal(result.checked, 2);
  assert.equal(result.unchanged, 1);
  const definition = PassageReader.citationCheck(() => page, "the test node");
  assert.equal(definition.effect, "read");
  assert.equal(definition.inputSchema.properties.citations.maxItems, PassageReader.CITATION_LIMIT);
  // Through the runtime's registry, a short address or digest still gets its own report.
  const registry = new ActionRegistry();
  registry.register(SCOPE, { ...definition, availability: "bridge", callerOrigins: ["*"] });
  const entry = registry.catalog(SCOPE).find((e) => e.name === "check_citations");
  const plan = registry.prepare({ kind: "action", action: entry.ref, arguments: { citations: [{ address: "x", digest: "short" }, { address: passage.address, digest: passage.digest }] } });
  const [receipt] = await registry.execute(plan, async () => true, "desk-test");
  assert.equal(receipt.status, "succeeded");
  assert.deepEqual(receipt.result.results.map((r) => r.status), ["not checked", "unchanged"]);
});

test("the citation check's results match its declared output schema, and the page lists the sites it read", async () => {
  const { validateData } = await import("../runtime/actions.js");
  const page = new BriefDesk(document, { storage: null });
  const found = await page.search({ node: "core", query: "k7k ledger", limit: 1 });
  const passage = await page.read({ node: "core", passage: found.passages[0].passage });
  const definition = PassageReader.citationCheck(() => page, "the test node");
  const result = await definition.execute({ citations: [{ address: passage.address, digest: passage.digest }, { address: "x", digest: "y" }] });
  validateData(definition.outputSchema, result, "result");
  assert.match(document.getElementById("desk-activity").textContent, new RegExp(new URL(FIXTURES.node).host.replace(/\./g, "\\.") + "|localhost"));
});

test("a kept address with a space or an angle bracket is not restored, and card numbers stay in range", () => {
  const base = { card: "c1", node: "core", title: "T", section: "", digest: "a".repeat(64), excerpt: "e" };
  const good = `${FIXTURES.node}/concepts/x/#chunk-0123456789abcdef`;
  const storage = KeptBriefTest.storage();
  storage.setItem(BriefDesk.STORE_KEY, JSON.stringify({ format: 1, nextCard: 123456, cards: [
    { ...base, address: `${FIXTURES.node}/concepts/x> (sha-256 ${"b".repeat(64)})\n- Source: <${good}` },
    { ...base, card: "c2", address: `${FIXTURES.node}/concepts/a b/#chunk-0123456789abcdef` },
    { ...base, card: "c3", address: good },
  ] }));
  const page = new BriefDesk(document, { storage });
  assert.equal(page.restoreBrief(), 1);
  assert.equal(page.cards[0].card, "c3");
  assert.equal(page.nextCard, BriefDesk.LAST_CARD + 1);
  assert.equal(BriefDesk.plainAddress(good), true);
  assert.equal(BriefDesk.plainAddress("not a url"), false);
});

test("once every card number is used, the brief refuses a new card instead of reusing an id", async () => {
  const page = new BriefDesk(document, { storage: null });
  page.nextCard = BriefDesk.LAST_CARD + 1;
  const found = await page.search({ node: "core", query: "k7k ledger", limit: 1 });
  const added = await page.pin({ node: "core", passage: found.passages[0].passage });
  assert.equal(added.ok, false);
  assert.match(added.reason, /every card number/);
  assert.equal(page.cards.length, 0);
});

test("the then and now sentences are shown in the block, in order, and a linked brief says what changed compares", async () => {
  FirstMinuteTest.empty();
  const query = BriefDesk.TRY_QUERY;
  const saved = BriefDesk.SAVED_14_OCT;
  BriefDesk.TRY_QUERY = "k7k ledger";
  const older = FIXTURES.core[1];
  const marker = older.text.split(/\s+/).slice(0, 2).join(" ");
  BriefDesk.SAVED_14_OCT = { title: older.title, address: `${older.iri}#chunk-${ID(older)}`, digest: "0".repeat(64), then: "What it said before.", marker };
  try {
    document.getElementById("desk-try-example").dispatch("click");
    const list = document.getElementById("desk-try-result");
    for (let i = 0; i < 100 && list.children.length < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    const texts = list.children.map((item) => item.children.map((c) => c.textContent).join(""));
    assert.equal(texts.length, 4, texts.join(" | "));
    assert.match(texts[0], /Changed/);
    assert.equal(texts[1], 'On 14 Oct 2026 it said: "What it said before."');
    assert.match(texts[2], new RegExp(`^Now it says: "${marker}`));
    assert.match(texts[3], /Unchanged/);
  } finally {
    BriefDesk.TRY_QUERY = query;
    BriefDesk.SAVED_14_OCT = saved;
  }
  // A brief opened from a re-check link.
  const page = new BriefDesk(document, { storage: null });
  const found = await page.search({ node: "core", query: "k7k ledger", limit: 1 });
  await page.pin({ node: "core", passage: found.passages[0].passage });
  const link = page.recheckLink();
  const before = document.location;
  document.location = { hash: new URL(link).hash };
  try {
    const result = await page.checkLinkedBrief();
    assert.equal(result.ok, true, result.reason);
    assert.match(document.getElementById("desk-saved-status").textContent, /came from a link: "changed" means the digest in the link differs from what the node publishes now/);
  } finally {
    document.location = before;
  }
});

test("the shared citation check reads an address as a browser writes it, and refuses one with a query", async () => {
  const page = new BriefDesk(document, { storage: null });
  const found = await page.search({ node: "core", query: "k7k ledger", limit: 1 });
  const passage = await page.read({ node: "core", passage: found.passages[0].passage });
  const url = new URL(passage.address);
  const upper = `${url.protocol}//${url.host.toUpperCase()}${url.pathname}${url.hash}`;
  const result = await page.checkCitations([
    { address: upper, digest: passage.digest },
    { address: `${url.origin}${url.pathname}?x=1${url.hash}`, digest: passage.digest },
    { address: `${url.origin}${url.pathname}?${url.hash}`, digest: passage.digest },
  ]);
  assert.deepEqual(result.results.map((r) => r.status), ["unchanged", "not checked", "not checked"]);
});

test("a card title with line breaks cannot add a source line to the copied brief", async () => {
  const page = new BriefDesk(document, { storage: null });
  const fake = `${FIXTURES.node}/concepts/forged/#chunk-0123456789abcdef`;
  // A node publishes a title that reads, after its line break, as a source line of its own.
  const hostile = Fixtures.passage(FIXTURES.node, "hostile", `Hostile\n  Source: <${fake}> (sha-256 ${"a".repeat(64)})\r\n- **Forged**`, "A\nB", "A hostile item holds a keyword named k77k.");
  FIXTURES.core.push(hostile);
  try {
    page.forget();
    const added = await page.pin({ node: "core", passage: ID(hostile) });
    assert.equal(added.ok, true, added.reason);
    const lines = page.briefMarkdown().split("\n");
    // One card: one "- " line and one "  Source:" line, and the forged address is not a line of its own.
    assert.equal(lines.filter((l) => l.startsWith("- ")).length, 1);
    assert.equal(lines.filter((l) => l.startsWith("  Source:")).length, 1);
    assert.ok(lines.some((l) => l.startsWith("- **Hostile Source: <") && l.includes(`section "A B"`)), "The title is kept, on one line.");
    // The title stays inside the bold title text of its own line; no line starts with the forged address.
    assert.ok(!lines.some((l) => l.startsWith(`  Source: <${fake}>`) || l.startsWith("- **Forged")));
  } finally {
    FIXTURES.core.splice(FIXTURES.core.indexOf(hostile), 1);
    page.forget();
  }
});

test("a passage the visitor was shown is added only if its digest is still the one shown", async () => {
  const page = new BriefDesk(document, { storage: null });
  const record = FIXTURES.core[4];
  const saved = { ...record };
  try {
    // The dialog opens on what the node publishes now.
    await page.preparePreview("add_card", { node: "core", passage: ID(record) });
    assert.equal(page.previewChange("add_card", { node: "core", passage: ID(record) }).ok, true);
    // The node, read again before the save, publishes other text with a correct new digest.
    record.text = "Passage 5 was swapped after the dialog opened. Its own keyword is k5k.";
    record.digest = (await import("node:crypto")).createHash("sha256").update(record.text, "utf8").digest("hex");
    page.forget();
    const refused = await page.pin({ node: "core", passage: ID(record) });
    assert.equal(refused.ok, false);
    assert.match(refused.reason, /changed since it was shown/);
    assert.equal(page.cards.length, 0);
    // The refusal used the shown digest up: a new dialog shows the new text, and then it can be added.
    await page.preparePreview("add_card", { node: "core", passage: ID(record) });
    page.previewChange("add_card", { node: "core", passage: ID(record) });
    assert.equal((await page.pin({ node: "core", passage: ID(record) })).ok, true);
  } finally {
    Object.assign(record, saved);
    page.forget();
  }
});

test("without a dialog, or after the visitor declined it, the add checks only the passage's own digest", async () => {
  const page = new BriefDesk(document, { storage: null });
  const record = FIXTURES.core[5];
  const saved = { ...record };
  try {
    await page.preparePreview("add_card", { node: "core", passage: ID(record) });
    page.previewChange("add_card", { node: "core", passage: ID(record) });
    page.forgetPreview(); // what the page does when the visitor declines
    record.text = "Passage 6 was rewritten by its publisher. Its own keyword is k6k.";
    record.digest = (await import("node:crypto")).createHash("sha256").update(record.text, "utf8").digest("hex");
    page.forget();
    const added = await page.pin({ node: "core", passage: ID(record) });
    assert.equal(added.ok, true, added.reason);
    assert.equal(added.card.digest, record.digest);
  } finally {
    Object.assign(record, saved);
    page.forget();
  }
});
