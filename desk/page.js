// The Brief Desk page. A visitor, or the assistant on this page, searches the published
// passages of a knowledge node, reads them, checks each passage against the digest the
// node published for it, and keeps a short brief of cited cards.
//
// The page's own buttons and the assistant's actions (site-actions.js) call the same
// methods of one object, BriefDesk.page, so both follow one set of rules. An operation
// refuses bad input by returning {ok: false, reason, field} and changes nothing; it
// throws only on an unexpected failure.
//
// What is read: the file /chunks.jsonl of a node, the passages it publishes, each with
// the address of its item, its text and the SHA-256 digest of that text. This page reads
// its own node without asking. It reads another node only after the visitor ticks that
// node under "Nodes to read"; the assistant cannot tick it.
//
// The reading and checking are in reader.js, which this site's bridge and the two peer
// nodes' bridges use too. This file adds the page: the visitor's consent per node, the
// brief, and what is drawn.
import { PassageReader } from "./reader.js";

/** The page object: state, operations and rendering of the Brief Desk. */
export class BriefDesk extends PassageReader {
  /** The single page object; site.js and site-actions.js use it. */
  static page = null;

  /** The most cards a brief holds. */
  static BRIEF_LIMIT = 8;

  /** The highest card number; card ids are c1 to c9999. */
  static LAST_CARD = 9999;

  /** The browser storage key under which this site keeps the visitor's brief. */
  static STORE_KEY = "brief-desk:brief";

  /** The words the first-minute buttons search for, in this site's own node. */
  static TRY_QUERY = "bundle";

  /**
   * The questions the page offers for the chat, the manifest's sample_queries in the same
   * order (a test keeps the two the same).
   */
  static SAMPLES = [
    "What is a Bundle? Answer from a passage and give its address.",
    "Find a passage on how a digest in the discovery document is checked, and add it to my brief.",
    "Ask the Standards Map what it offers on robots.txt and AI usage preferences.",
    "Add the passage that defines a Cluster to my brief, then discard the brief.",
    "Ask the Standards Map to write a proposal: its card on robots.txt should link to the errata page of RFC 9309.",
    "Publish a new item on this node for me."
  ];

  /**
   * :param doc: The document to render into.
   * :param options: nodes (a list of {id, label, origin}), the first being this page's own
   *   node; fetchText (url → text) and sha256Hex (text → hex), replaceable in tests;
   *   storage, where the brief is kept between visits (the browser's localStorage when
   *   left out, null for none).
   */
  constructor(doc, options = {}) {
    // The page's own node is read from beside the page. Its items carry the node's
    // published origin, which the page states in data-node-origin.
    const here = new URL(doc.URL || doc.location.href).origin;
    const own = doc.getElementById("desk").getAttribute("data-node-origin") || here;
    const nodes = (options.nodes || BriefDesk.defaultNodes(own)).map((n, i) => ({ ...n, readFrom: i === 0 ? here : n.origin }));
    super({ ...options, nodes });
    this.doc = doc;
    this.home = `${own}/desk/`;
    this.cards = [];
    this.version = 0;
    this.nextCard = 1;
    this.lastSearch = null;
    this.storage = options.storage === undefined ? BriefDesk.browserStorage(doc) : options.storage;
    // Every site this page reads during the visit, shown under "Nodes to read".
    this.contacted = new Set();
    const fetchText = this.fetchText;
    this.fetchText = async (url) => {
      this.contacted.add(new URL(url).host);
      this.renderActivity();
      return fetchText.call(this, url);
    };
  }

  /**
   * Note a site the assistant may contact, once the visitor allowed it on the consent card.
   *
   * :param origin: The site's origin.
   */
  noteContact(origin) {
    try {
      this.contacted.add(new URL(origin).host);
    } catch {
      return;
    }
    this.renderActivity();
  }

  /** Say which sites the page and its assistant have read during this visit. Nothing is stored. */
  renderActivity() {
    const hosts = [...this.contacted].sort();
    this.doc.getElementById("desk-activity").textContent = (hosts.length
      ? `Sites read during this visit: ${hosts.join(", ")}. They get no key and no personal data.`
      : "No site has been read yet during this visit.")
      + " The AI provider you choose is shown under AI model settings.";
  }

  /**
   * The browser's storage for this site, when the browser allows it.
   *
   * :param doc: The document.
   * :return: The storage, or null.
   */
  static browserStorage(doc) {
    try {
      return doc.defaultView ? doc.defaultView.localStorage : null;
    } catch {
      // A private window or blocked site data: the page works, and the brief is not kept.
      return null;
    }
  }

  // ---------------------------------------------------------------- keeping the brief

  /** Keep the brief in this browser, for this site only. Nothing leaves the browser. */
  saveBrief() {
    if (!this.storage) {
      return;
    }
    try {
      const cards = this.cards.map((c) => ({ card: c.card, node: c.node, title: c.title, section: c.section, address: c.address, digest: c.digest, excerpt: c.excerpt, license: c.license, licenseUrl: c.licenseUrl }));
      this.storage.setItem(BriefDesk.STORE_KEY, JSON.stringify({ format: 1, nextCard: this.nextCard, cards }));
    } catch {
      // Storage full or refused: the brief stays on the page for this visit.
    }
  }

  /**
   * Bring back the brief kept in this browser. A card is kept only when it names one of the
   * page's nodes, an address on that node's origin and a SHA-256 digest; anything else in
   * storage is ignored. A restored card shows that its digest matched when it was added and
   * that it was not checked again since.
   *
   * :return: The number of cards restored.
   */
  restoreBrief() {
    let saved = null;
    try {
      saved = this.storage ? JSON.parse(this.storage.getItem(BriefDesk.STORE_KEY) || "null") : null;
    } catch {
      saved = null;
    }
    if (!saved || saved.format !== 1 || !Array.isArray(saved.cards)) {
      return 0;
    }
    const text = (v, limit) => (typeof v === "string" ? v.slice(0, limit) : "");
    const cards = [];
    for (const c of saved.cards.slice(0, BriefDesk.BRIEF_LIMIT)) {
      if (!c || typeof c !== "object") {
        continue;
      }
      const node = this.nodes.find((n) => n.id === c.node);
      const fits = node && typeof c.address === "string" && BriefDesk.plainAddress(c.address) && c.address.startsWith(`${node.origin}/`)
        && /#chunk-[0-9a-f]{16}$/.test(c.address) && /^[0-9a-f]{64}$/.test(c.digest) && /^c[0-9]{1,4}$/.test(c.card)
        && !cards.some((k) => k.address === c.address || k.card === c.card);
      if (fits) {
        cards.push({
          card: c.card, node: node.id, nodeLabel: node.label, title: text(c.title, 300), section: text(c.section, 300),
          address: c.address, digest: c.digest, digestMatches: true, check: "not checked",
          excerpt: text(c.excerpt, 400), license: text(c.license, 200), licenseUrl: text(c.licenseUrl, 500),
        });
      }
    }
    const highest = Math.max(0, ...cards.map((c) => Number(c.card.slice(1))));
    this.cards = cards;
    // Card ids run to c9999; past that, pin() refuses new cards instead of reusing an id.
    this.nextCard = Math.min(BriefDesk.LAST_CARD + 1, Math.max(highest + 1, Number.isInteger(saved.nextCard) ? saved.nextCard : 1));
    this.version = cards.length ? 1 : 0;
    return cards.length;
  }

  /**
   * True when an address is exactly what a browser would write for it, with no space or
   * angle bracket, so it cannot add lines to the Markdown brief or the re-check link.
   *
   * :param address: The address.
   * :return: True or false.
   */
  static plainAddress(address) {
    try {
      return !/[\s<>]/.test(address) && new URL(address).href === address;
    } catch {
      return false;
    }
  }

  /**
   * A link that opens this page and checks the brief's passages at once: each address and
   * digest, in the part of the link after "#", which the browser does not send to the site.
   *
   * :return: The link, or "" when the brief is empty.
   */
  recheckLink() {
    if (this.cards.length === 0) {
      return "";
    }
    const lines = this.cards.map((c) => `${c.address} ${c.digest}`).join("\n");
    const bytes = new TextEncoder().encode(lines);
    const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `${this.home}#check=${encoded}`;
  }

  /**
   * The saved brief a re-check link carries, as Markdown the saved-brief check reads.
   *
   * :param hash: The part of the address from "#", such as location.hash.
   * :return: The Markdown, or "" when the link carries no brief.
   */
  static linkBrief(hash) {
    const match = /^#check=([A-Za-z0-9_-]{1,20000})$/.exec(String(hash || ""));
    if (!match) {
      return "";
    }
    let text = "";
    try {
      const binary = atob(match[1].replace(/-/g, "+").replace(/_/g, "/"));
      text = new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
    } catch {
      return "";
    }
    const lines = text.split("\n").map((line) => line.trim().split(/\s+/)).filter((parts) => parts.length === 2)
      .map(([address, digest]) => `- Source: <${address}> (sha-256 ${digest})`);
    const markdown = `# Brief (from a re-check link)\n\n${lines.join("\n")}\n`;
    return BriefDesk.savedEntries(markdown).length ? markdown : "";
  }

  /**
   * The nodes of the public site: this node and the two peers it names.
   *
   * :param own: The published origin of this page's own node.
   * :return: The node list, this page's own node first.
   */
  static defaultNodes(own) {
    return [
      { id: "core", label: "AgenticSystemCore (the format and its vocabulary)", origin: own },
      { id: "patterns", label: "AgenticSystemCore Graph (cards on agent-system designs)", origin: "https://patterns.agenticsystemcore.com" },
      { id: "standards", label: "Standards Map (documents an agent-readable site builds on)", origin: "https://standards.agenticsystemcore.com" },
    ];
  }

  // ---------------------------------------------------------------- state

  /**
   * A copy of the page state as plain JSON: the nodes and whether the visitor allowed
   * each, the brief with its version, and the last search.
   *
   * :return: The state.
   */
  getState() {
    return {
      nodes: this.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        host: n.host,
        home: `${n.origin}/`,
        allowed: n.allowed,
        thisSite: n.own,
      })),
      brief: {
        version: this.version,
        limit: BriefDesk.BRIEF_LIMIT,
        cards: this.cards.map((c) => ({ ...c })),
      },
      lastSearch: this.lastSearch ? { ...this.lastSearch } : null,
    };
  }

  /**
   * Allow or stop reading a node. Only the page's own checkbox calls this.
   *
   * :param id: The node id.
   * :param allowed: True to allow.
   * :return: The new state, or a refusal.
   */
  setAllowed(id, allowed) {
    const node = this.nodes.find((n) => n.id === id);
    if (!node) {
      return { ok: false, reason: `There is no node "${id}".`, field: "node" };
    }
    if (node.own) {
      return { ok: false, reason: "This page always reads its own node.", field: "node" };
    }
    node.allowed = Boolean(allowed);
    this.render();
    return { ok: true, state: this.getState() };
  }

  /**
   * What a change would do, from what the page already holds, without reading anything:
   * for the confirmation dialog, which is built before the change runs.
   *
   * :param action: "add_card" or "remove_card".
   * :param args: The action's arguments.
   * :return: {ok, details} or a refusal.
   */
  previewChange(action, args) {
    if (action === "remove_card") {
      const card = this.cards.find((c) => c.card === args.card);
      if (!card) {
        return { ok: false, reason: `The brief has no card "${args.card}".`, field: "card" };
      }
      return { ok: true, details: { "Card": card.card, "Passage": card.section ? `${card.title}, ${card.section}` : card.title, "Address": card.address } };
    }
    const usable = this.usableNode(args.node);
    if (!usable.ok) {
      return usable;
    }
    if (this.cards.length >= BriefDesk.BRIEF_LIMIT) {
      return { ok: false, reason: `The brief holds ${BriefDesk.BRIEF_LIMIT} cards at most. Remove one first.`, field: "passage" };
    }
    // The dialog's caller loads the node's passages first (preparePreview), so a passage
    // that is not there is refused here, before any dialog.
    const record = (usable.node.passages || []).find((p) => p.id.startsWith(String(args.passage)));
    if (!record || String(args.passage).length !== 16) {
      return { ok: false, reason: `The node ${usable.node.id} has no passage "${args.passage}". Use a passage value from a search result.`, field: "passage" };
    }
    const address = BriefDesk.address(record);
    if (this.cards.some((c) => c.address === address)) {
      return { ok: false, reason: "That passage is already in the brief.", field: "passage" };
    }
    return {
      ok: true,
      details: {
        "From": usable.node.label,
        "Passage": record.section ? `${record.title || record.item}, ${record.section}` : (record.title || record.item),
        "Address": address,
        "Excerpt": BriefDesk.excerpt(record.text, 240),
        "Check": "The page checks the passage against its published digest before it adds it.",
      },
    };
  }

  /**
   * Load what previewChange() needs: the passages of the node an add names. A node that
   * cannot be read is left unloaded, and previewChange() then refuses.
   *
   * :param action: The action name.
   * :param args: Its arguments.
   */
  async preparePreview(action, args) {
    if (action !== "add_card") {
      return;
    }
    const usable = this.usableNode(args.node);
    if (usable.ok) {
      try {
        await this.passagesOf(usable.node);
      } catch (error) {
        // previewChange() refuses: the passage is not there.
      }
    }
  }

  // ---------------------------------------------------------------- writes

  /**
   * Add one passage to the brief as a cited card, after checking its digest.
   *
   * :param args: node and passage.
   * :return: {ok, card, version, count} or a refusal.
   */
  async pin(args) {
    const found = await this.find(args);
    if (!found.ok) {
      return found;
    }
    const { node, record } = found;
    const address = BriefDesk.address(record);
    if (this.cards.some((c) => c.address === address)) {
      return { ok: false, reason: "That passage is already in the brief.", field: "passage" };
    }
    if (this.cards.length >= BriefDesk.BRIEF_LIMIT) {
      return { ok: false, reason: `The brief holds ${BriefDesk.BRIEF_LIMIT} cards at most. Remove one first.`, field: "passage" };
    }
    if (this.nextCard > BriefDesk.LAST_CARD) {
      return { ok: false, reason: "This brief has used every card number. Copy it if you want to keep it, then discard it to start a new one.", field: "passage" };
    }
    const computed = await this.sha256Hex(record.text);
    if (computed !== record.digest) {
      return {
        ok: false,
        reason: "The text of that passage does not match the digest its node published, so it was not added.",
        field: "passage",
      };
    }
    // The checks above waited for the file and the digest; another add or a discard may
    // have changed the brief meanwhile, so check the brief again just before changing it.
    if (this.cards.some((c) => c.address === address)) {
      return { ok: false, reason: "That passage is already in the brief.", field: "passage" };
    }
    if (this.cards.length >= BriefDesk.BRIEF_LIMIT) {
      return { ok: false, reason: `The brief holds ${BriefDesk.BRIEF_LIMIT} cards at most. Remove one first.`, field: "passage" };
    }
    const card = {
      card: `c${this.nextCard}`,
      node: node.id,
      nodeLabel: node.label,
      title: record.title || record.item,
      section: record.section || "",
      address,
      digest: record.digest,
      digestMatches: true,
      check: null, // what checkBrief() last found: "unchanged", "changed", "moved", "gone" or "not checked"
      excerpt: BriefDesk.excerpt(record.text, 320),
      license: record.license || "",
      licenseUrl: record.license_url || "",
    };
    this.nextCard += 1;
    this.cards.push(card);
    this.version += 1;
    this.render();
    return { ok: true, card: { ...card }, version: this.version, count: this.cards.length };
  }

  /**
   * Remove one card from the brief.
   *
   * :param args: card, the card id from the brief.
   * :return: {ok, version, count} or a refusal.
   */
  remove(args) {
    const index = this.cards.findIndex((c) => c.card === args.card);
    if (index === -1) {
      return { ok: false, reason: `The brief has no card "${args.card}".`, field: "card" };
    }
    this.cards.splice(index, 1);
    this.version += 1;
    this.render();
    return { ok: true, version: this.version, count: this.cards.length };
  }

  /**
   * Check whether the whole brief can be discarded now. Changes nothing.
   *
   * :param args: expectedVersion, the brief version the visitor saw.
   * :return: {ok, count} or a refusal.
   */
  checkDiscard(args) {
    if (this.cards.length === 0) {
      return { ok: false, reason: "The brief is already empty.", field: "expectedVersion" };
    }
    if (args.expectedVersion !== this.version) {
      return {
        ok: false,
        reason: `The brief changed since it was read (it is at version ${this.version}). Read the state again.`,
        field: "expectedVersion",
      };
    }
    return { ok: true, count: this.cards.length };
  }

  /**
   * Discard every card of the brief. The page cannot bring them back.
   *
   * :param args: expectedVersion, the brief version the visitor saw.
   * :return: {ok, discarded, version} or a refusal.
   */
  discard(args) {
    const check = this.checkDiscard(args);
    if (!check.ok) {
      return check;
    }
    const discarded = this.cards.length;
    this.cards = [];
    this.version += 1;
    this.render();
    return { ok: true, discarded, version: this.version };
  }

  /**
   * The brief as Markdown, each card with its address and digest.
   *
   * :return: The Markdown text.
   */
  briefMarkdown() {
    const lines = ["# Brief", ""];
    for (const card of this.cards) {
      const where = card.section ? `${card.title}, section "${card.section}"` : card.title;
      lines.push(`- **${where}**: ${card.excerpt}`);
      lines.push(`  Source: <${card.address}> (sha-256 ${card.digest}; the text matched this digest when it was added)`);
    }
    if (this.cards.length) {
      lines.push("", `To see whether a passage has changed since, open <${this.recheckLink()}>, or paste this brief under "Check a saved brief" at <${this.home}>.`);
    }
    return `${lines.join("\n")}\n`;
  }

  // ---------------------------------------------------------------- checking again

  /**
   * Read every card's passage again from its node and compare it with the digest the card
   * holds. Marks each card with what was found; the brief itself is not changed.
   *
   * :return: {ok, checked, unchanged, results}, each result with the card id, or a refusal.
   */
  async checkBrief() {
    if (this.cards.length === 0) {
      return { ok: false, reason: "The brief is empty, so there is nothing to check.", field: "brief" };
    }
    const cards = [...this.cards];
    const found = await this.verifyAll(cards.map((c) => ({ address: c.address, digest: c.digest })));
    found.results = found.results.map((result, i) => ({ card: cards[i].card, ...result }));
    for (const result of found.results) {
      const card = this.cards.find((c) => c.card === result.card);
      if (card) {
        card.check = result.status;
        card.digestMatches = result.status === "unchanged" || (result.status === "not checked" && card.digestMatches);
      }
    }
    this.render();
    return found;
  }

  /**
   * Check a brief that was saved as Markdown, here or by someone else: read each cited
   * passage from its node now and compare it with the digest the brief holds.
   *
   * :param markdown: The saved brief.
   * :return: {ok, checked, unchanged, results} or a refusal.
   */
  async checkSaved(markdown) {
    const entries = BriefDesk.savedEntries(markdown);
    if (entries.length === 0) {
      return { ok: false, reason: "No cited passage was found. Paste a brief copied from this page: each source line holds an address and a sha-256 digest.", field: "markdown" };
    }
    return this.verifyAll(entries);
  }

  /**
   * What one check result means, in words a visitor reads.
   *
   * :param result: What verify() returned.
   * :return: A short sentence.
   */
  static verdict(result) {
    const words = {
      "unchanged": "Unchanged: the node publishes the same text now.",
      "changed": "Changed: the node now publishes other text at this address.",
      "moved": "Moved: the same text is still on the item, under another passage address.",
      "gone": "Gone: the item no longer has this passage.",
    };
    return words[result.status] || `Not checked. ${result.reason}`;
  }

  // ---------------------------------------------------------------- the first minute

  /**
   * Search one node and show the results, as the search form does.
   *
   * :param query: The words to look for.
   * :param node: The node id.
   * :return: What search() returned.
   */
  async runSearch(query, node) {
    const status = this.doc.getElementById("desk-status");
    status.textContent = "Searching…";
    try {
      const result = await this.search({ query, node, limit: BriefDesk.SEARCH_LIMIT });
      if (result.ok) {
        this.lastSearch = { query: result.query, node: result.node, count: result.count };
      }
      this.renderResults(result);
      return result;
    } catch (error) {
      status.textContent = `The search could not read the node: ${error.message}`;
      return { ok: false, reason: status.textContent };
    }
  }

  /**
   * The first-minute "cite" button: search this site's node for TRY_QUERY and add the first
   * passage to the brief, with its digest check, unless the brief already holds it.
   *
   * :return: {ok, card, title, already} or a refusal.
   */
  async tryCite() {
    const found = await this.runSearch(BriefDesk.TRY_QUERY, "core");
    if (!found.ok || found.count === 0) {
      return { ok: false, reason: found.reason || `Nothing matches "${BriefDesk.TRY_QUERY}".` };
    }
    const first = found.passages[0];
    const held = this.cards.find((c) => c.address === first.address);
    if (held) {
      return { ok: true, card: held.card, title: held.title, already: true };
    }
    const added = await this.pin({ node: first.node, passage: first.passage });
    return added.ok ? { ok: true, card: added.card.card, title: first.title, already: false } : added;
  }

  /**
   * A citation saved on 14 Oct 2026 from this node's own passages file of that day (commit
   * aad097e of the site's public repository, www/chunks.jsonl): step 2 of "Publish a Level-0
   * node", at the same address it has today, with the digest its text had then. The rule in
   * that step has since reversed, so the check shows a real change of meaning. `then` is the
   * sentence of that day, quoted from the commit; `marker` finds the same step in today's text.
   */
  static SAVED_14_OCT = {
    title: "Publish a Level-0 node",
    address: "https://agenticsystemcore.com/procedures/publish-a-level-0-node/#chunk-5054b2c80f6cb7de",
    digest: "33bc2f7ed5e14ed6ea50e7aa1aca9242dba4986ebd2aaa2ad85faa62b5374700",
    then: "An item without `prov` inherits the operator of the Bundle at Level 0, with a warning.",
    marker: "`prov` is required",
  };

  /**
   * An example of a saved brief for the first-minute check: the citation of 14 Oct 2026, and
   * a passage cited now, as read from the node.
   *
   * :param passage: A passage read from a node now: title, address and digest.
   * :return: The Markdown text.
   */
  static exampleBrief(passage) {
    const saved = BriefDesk.SAVED_14_OCT;
    return [
      "# Brief (example: one citation saved on 14 Oct 2026, one made now)",
      "",
      `- **${saved.title}**, step 2: "${saved.then}" Cited on 14 Oct 2026, from this node's passages file of that day (commit aad097e of the site's public repository).`,
      `  Source: <${saved.address}> (sha-256 ${saved.digest})`,
      `- **${passage.title}**: cited now.`,
      `  Source: <${passage.address}> (sha-256 ${passage.digest})`,
      "",
    ].join("\n");
  }

  /**
   * Put the example saved brief in the "Check a saved brief" box, open it and check it. The
   * visitor's own brief is not touched.
   *
   * :return: What checkSaved() returned, with changedShown, or a refusal.
   */
  async tryExample() {
    const found = await this.search({ query: BriefDesk.TRY_QUERY, node: "core", limit: 1 });
    if (!found.ok || found.count === 0) {
      return { ok: false, reason: found.reason || `Nothing matches "${BriefDesk.TRY_QUERY}".` };
    }
    const passage = await this.read({ node: "core", passage: found.passages[0].passage });
    if (!passage.ok || !passage.digestMatches) {
      return { ok: false, reason: passage.reason || "The example passage does not match its published digest, so no example was made." };
    }
    this.doc.getElementById("desk-saved-text").value = BriefDesk.exampleBrief(passage);
    this.doc.getElementById("desk-saved").open = true;
    const result = await this.showSaved();
    if (!result.ok) {
      return result;
    }
    // What the cited step says now, read from the same passage, so the change is shown in words.
    let now = "";
    const cited = await this.read({ node: "core", passage: BriefDesk.SAVED_14_OCT.address.slice(-16) }).catch(() => null);
    if (cited && cited.ok && cited.digestMatches) {
      const line = cited.text.split("\n").find((l) => l.includes(BriefDesk.SAVED_14_OCT.marker)) || "";
      // The sentence that holds the marker, from the marker on.
      const at = line.indexOf(BriefDesk.SAVED_14_OCT.marker);
      now = (at >= 0 ? line.slice(at) : line.replace(/^\s*\d+\.\s*/, "")).trim();
    }
    return { ...result, changedShown: result.results.some((r) => r.status === "changed"), then: BriefDesk.SAVED_14_OCT.then, now };
  }

  /**
   * Show what a first-minute button found inside its own block, so the result is on screen.
   *
   * :param lines: A list of {text, href, ok}; href makes the line a link, ok false marks it.
   */
  showTry(lines) {
    this.doc.getElementById("desk-try-result").replaceChildren(...lines.map((line) => {
      const item = this.element("li", null, line.ok === false ? { class: "desk-bad" } : {});
      item.append(line.href ? this.element("a", line.text, { href: line.href }) : this.element("span", line.text));
      if (line.note) {
        item.append(this.element("span", ` ${line.note}`, { class: line.ok === false ? "" : "desk-ok" }));
      }
      return item;
    }));
  }

  /**
   * Check what the "Check a saved brief" box holds and show one line per cited passage.
   *
   * :return: What checkSaved() returned, or a refusal.
   */
  async showSaved() {
    const report = this.doc.getElementById("desk-saved-status");
    const list = this.doc.getElementById("desk-saved-results");
    report.textContent = "Reading the passages…";
    list.replaceChildren();
    try {
      const result = await this.checkSaved(this.doc.getElementById("desk-saved-text").value);
      if (!result.ok) {
        report.textContent = result.reason;
        return result;
      }
      report.textContent = `${result.unchanged} of ${result.results.length} cited passage${result.results.length === 1 ? "" : "s"} unchanged.`;
      list.replaceChildren(...result.results.map((r) => {
        const item = this.element("li");
        // An address on one of the page's nodes becomes a link; one it could not check stays text.
        item.append(
          r.status === "not checked" ? this.element("span", r.address) : this.element("a", r.address, { href: r.address }),
          this.element("p", BriefDesk.verdict(r), { class: r.status === "unchanged" ? "desk-ok" : "desk-bad" }),
        );
        return item;
      }));
      return result;
    } catch (error) {
      report.textContent = `The check could not finish: ${error.message}`;
      return { ok: false, reason: report.textContent };
    }
  }

  /**
   * The runtime's chat box, once the assistant has loaded.
   *
   * :return: The input element, or null.
   */
  chatInput() {
    try {
      return this.doc.querySelector("#ns-input");
    } catch {
      // The test document knows only this page's own ids.
      return null;
    }
  }

  /**
   * Put one sample question in the chat box, for the visitor to send. Nothing is sent here.
   *
   * :param text: The question.
   * :return: {ok, needsKey} or a refusal.
   */
  askSample(text) {
    const input = this.chatInput();
    if (!input || input.disabled) {
      return { ok: false, reason: "The chat box is not ready. Add a key in AI model settings below, then try again." };
    }
    input.value = text;
    // The runtime enables its Send button on input events.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    // site.js marks the chat when the runtime has no key yet.
    return { ok: true, needsKey: this.doc.getElementById("agent-app").getAttribute("data-needs-key") === "true" };
  }

  /** Draw the sample questions as buttons. */
  renderSamples() {
    const status = this.doc.getElementById("desk-samples-status");
    this.doc.getElementById("desk-samples").replaceChildren(...BriefDesk.SAMPLES.map((text) => {
      const item = this.element("li");
      const button = this.element("button", text, { type: "button" });
      button.addEventListener("click", () => {
        const asked = this.askSample(text);
        status.textContent = !asked.ok ? asked.reason : asked.needsKey
          ? "The question is in the chat box. Add your key in AI model settings below, then press Send."
          : "The question is in the chat box. Press Send.";
      });
      item.append(button);
      return item;
    }));
  }

  // ---------------------------------------------------------------- rendering

  /**
   * Make an element with text and attributes.
   *
   * :param tag: The tag name.
   * :param text: The text content, or null.
   * :param attributes: Attribute names and values.
   * :return: The element.
   */
  element(tag, text = null, attributes = {}) {
    const node = this.doc.createElement(tag);
    if (text !== null) {
      node.textContent = text;
    }
    for (const [name, value] of Object.entries(attributes)) {
      node.setAttribute(name, value);
    }
    return node;
  }

  /**
   * The mark beside a card: its check when it was added, or what the last check found.
   *
   * :param card: One card of the brief.
   * :return: The text of the mark.
   */
  static mark(card) {
    const marks = {
      "unchanged": " ✓ unchanged since it was added",
      "changed": " ✗ changed since it was added",
      "moved": " ✗ moved since it was added",
      "gone": " ✗ gone since it was added",
      "not checked": " ✓ digest matched when added; not checked again",
    };
    return marks[card.check] || " ✓ digest matches";
  }

  /** Draw the brief, its count and the node list from the state. */
  render() {
    const list = this.doc.getElementById("desk-brief");
    const items = this.cards.map((card) => {
      const item = this.element("li", null, { "data-card": card.card });
      const where = card.section ? `${card.title} — ${card.section}` : card.title;
      item.append(
        this.element("a", where, { href: card.address }),
        this.element("span", BriefDesk.mark(card), { class: card.digestMatches ? "desk-ok" : "desk-bad", title: `sha-256 ${card.digest}` }),
        this.element("p", card.excerpt),
        this.element("p", `From ${card.nodeLabel}. Card ${card.card}.`, { class: "desk-meta" }),
      );
      const button = this.element("button", "Remove", { type: "button" });
      button.addEventListener("click", () => this.remove({ card: card.card }));
      item.append(button);
      return item;
    });
    list.replaceChildren(...items);
    this.saveBrief();
    this.doc.getElementById("desk-brief-count").textContent = this.cards.length === 0
      ? "The brief is empty. Search, then add passages."
      : `${this.cards.length} of ${BriefDesk.BRIEF_LIMIT} cards. Each was checked against its published digest when it was added.`;
    for (const node of this.nodes) {
      if (!node.own) {
        this.doc.getElementById(`desk-allow-${node.id}`).checked = node.allowed;
      }
    }
  }

  /**
   * Show search results with an "Add to brief" button each.
   *
   * :param result: What search() returned.
   */
  renderResults(result) {
    const list = this.doc.getElementById("desk-results");
    const status = this.doc.getElementById("desk-status");
    if (!result.ok) {
      list.replaceChildren();
      status.textContent = result.reason;
      return;
    }
    status.textContent = result.count === 0
      ? `Nothing in ${result.node} matches "${result.query}".`
      : `${result.count} passage${result.count === 1 ? "" : "s"} in ${result.node} for "${result.query}".`;
    list.replaceChildren(...result.passages.map((p) => {
      const item = this.element("li");
      item.append(
        this.element("a", p.section ? `${p.title} — ${p.section}` : p.title, { href: p.address }),
        this.element("p", p.excerpt),
      );
      const button = this.element("button", "Add to brief", { type: "button" });
      button.addEventListener("click", async () => {
        const added = await this.pin({ node: p.node, passage: p.passage });
        status.textContent = added.ok ? `Added "${p.title}" to the brief.` : added.reason;
      });
      item.append(button);
      return item;
    }));
  }

  /**
   * Ask the visitor to confirm with a dialog of two named buttons. Escape declines.
   *
   * :param content: title, sentence, confirm and decline (the two button labels).
   * :return: True when the visitor pressed the confirm button.
   */
  confirm(content) {
    return new Promise((resolve) => {
      const dialog = this.doc.createElement("dialog");
      dialog.className = "assistant-review";
      dialog.setAttribute("aria-labelledby", "desk-confirm-title");
      const heading = this.element("h2", content.title, { id: "desk-confirm-title" });
      // Start on the heading, which Enter cannot activate, so a stray Enter confirms nothing.
      heading.tabIndex = -1;
      heading.autofocus = true;
      const confirmButton = this.element("button", content.confirm, { type: "button" });
      confirmButton.addEventListener("click", () => dialog.close("confirm"));
      const declineButton = this.element("button", content.decline, { type: "button", class: "assistant-decline" });
      declineButton.addEventListener("click", () => dialog.close("decline"));
      dialog.addEventListener("close", () => {
        dialog.remove();
        resolve(dialog.returnValue === "confirm");
      });
      dialog.append(heading, this.element("p", content.sentence), confirmButton, declineButton);
      this.doc.body.append(dialog);
      dialog.showModal();
    });
  }

  /** Connect the page's own form, buttons and checkboxes to the operations. */
  connect() {
    const status = this.doc.getElementById("desk-status");
    this.restoreBrief();
    this.doc.getElementById("desk-search-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.runSearch(this.doc.getElementById("desk-query").value, this.doc.getElementById("desk-node").value);
    });
    this.doc.getElementById("desk-discard").addEventListener("click", async () => {
      // The page cannot bring a discarded brief back, so its own button asks first, as the
      // assistant's action does.
      const version = this.version;
      const check = this.checkDiscard({ expectedVersion: version });
      if (!check.ok) {
        status.textContent = check.reason;
        return;
      }
      const confirmed = await this.confirm({
        title: "Discard the whole brief?",
        sentence: `${check.count} card${check.count === 1 ? " leaves" : "s leave"} the brief. This page cannot bring them back.`,
        confirm: "Discard the brief",
        decline: "Keep the brief",
      });
      if (!confirmed) {
        status.textContent = "The brief was kept.";
        return;
      }
      const result = this.discard({ expectedVersion: version });
      status.textContent = result.ok ? `Discarded ${result.discarded} card${result.discarded === 1 ? "" : "s"}.` : result.reason;
    });
    this.doc.getElementById("desk-check").addEventListener("click", async () => {
      status.textContent = "Reading the passages again…";
      try {
        const result = await this.checkBrief();
        status.textContent = result.ok
          ? `Checked again: ${result.unchanged} of ${result.results.length} card${result.results.length === 1 ? "" : "s"} unchanged.`
          : result.reason;
      } catch (error) {
        status.textContent = `The check could not finish: ${error.message}`;
      }
    });
    this.doc.getElementById("desk-saved-check").addEventListener("click", () => this.showSaved());
    this.doc.getElementById("desk-copy").addEventListener("click", async () => {
      try {
        await this.doc.defaultView.navigator.clipboard.writeText(this.briefMarkdown());
        status.textContent = "The brief was copied as Markdown.";
      } catch (error) {
        status.textContent = "The browser did not allow copying. Select the brief and copy it by hand.";
      }
    });
    for (const node of this.nodes) {
      if (!node.own) {
        const box = this.doc.getElementById(`desk-allow-${node.id}`);
        box.addEventListener("change", () => this.setAllowed(node.id, box.checked));
      }
    }
    this.doc.getElementById("desk-link").addEventListener("click", async () => {
      const link = this.recheckLink();
      if (!link) {
        status.textContent = "The brief is empty, so there is no link to copy.";
        return;
      }
      try {
        await this.doc.defaultView.navigator.clipboard.writeText(link);
        // Another site's passages are read only after the person who opens the link ticks
        // that site, so say so when the brief cites one.
        const others = this.cards.some((c) => !this.nodes.find((n) => n.id === c.node)?.own);
        status.textContent = others
          ? "A link that re-checks this brief was copied. Whoever opens it sees whether each passage of this site has changed; passages of the other sites show as not checked until they tick those sites under Nodes to read."
          : "A link that re-checks this brief was copied. Anyone who opens it sees whether each passage has changed.";
      } catch (error) {
        status.textContent = `The browser did not allow copying. The link is: ${link}`;
      }
    });
    this.connectFirstMinute();
    this.renderSamples();
    this.render();
    this.renderActivity();
    this.checkLinkedBrief();
    // A re-check link opened in a tab already on this page changes only the part after "#".
    this.doc.defaultView?.addEventListener?.("hashchange", () => this.checkLinkedBrief());
  }

  /**
   * When the page was opened with a re-check link, put its brief under "Check a saved brief"
   * and check it.
   *
   * :return: What showSaved() returned, or null when the address carries no brief.
   */
  async checkLinkedBrief() {
    const markdown = BriefDesk.linkBrief(this.doc.location ? this.doc.location.hash : "");
    if (!markdown) {
      return null;
    }
    this.doc.getElementById("desk-saved-text").value = markdown;
    this.doc.getElementById("desk-saved").open = true;
    const result = await this.showSaved();
    if (result.ok) {
      // A link can carry any digest; say what "changed" compares.
      const report = this.doc.getElementById("desk-saved-status");
      report.textContent += " These citations came from a link: \"changed\" means the digest in the link differs from what the node publishes now.";
    }
    this.doc.getElementById("desk-saved").scrollIntoView?.({ block: "start" });
    return result;
  }

  /** Connect the three first-minute buttons, which need no key. */
  connectFirstMinute() {
    const status = this.doc.getElementById("desk-try-status");
    this.doc.getElementById("desk-try-search").addEventListener("click", async () => {
      this.doc.getElementById("desk-query").value = BriefDesk.TRY_QUERY;
      this.doc.getElementById("desk-node").value = "core";
      const found = await this.runSearch(BriefDesk.TRY_QUERY, "core");
      status.textContent = found.ok
        ? `Found ${found.count} passage${found.count === 1 ? "" : "s"} for "${BriefDesk.TRY_QUERY}" in this site's published passages. The first ones:`
        : found.reason;
      this.showTry(found.ok ? found.passages.slice(0, 3).map((p) => ({ text: p.section ? `${p.title} — ${p.section}` : p.title, href: p.address })) : []);
    });
    this.doc.getElementById("desk-try-cite").addEventListener("click", async () => {
      const cited = await this.tryCite();
      status.textContent = !cited.ok ? cited.reason : cited.already
        ? `"${cited.title}" is already card ${cited.card} of your brief.`
        : `"${cited.title}" is now card ${cited.card} of your brief. Its text matched the digest the site published for it.`;
      const card = cited.ok ? this.cards.find((c) => c.card === cited.card) : null;
      this.showTry(card ? [{ text: card.title, href: card.address, note: BriefDesk.mark(card) }] : []);
    });
    this.doc.getElementById("desk-try-example").addEventListener("click", async () => {
      const checked = await this.tryExample();
      if (!checked.ok) {
        status.textContent = checked.reason;
        return;
      }
      status.textContent = `A brief with one citation saved on 14 Oct 2026 and one made now: ${checked.unchanged} of ${checked.results.length} unchanged. Your own brief was not changed.${checked.changedShown ? " The step cited on 14 Oct has changed since:" : ""}`;
      const lines = checked.results.map((r) => ({ text: r.address, href: r.status === "not checked" ? null : r.address, note: BriefDesk.verdict(r), ok: r.status === "unchanged" }));
      if (checked.changedShown && checked.now) {
        lines.splice(1, 0, { text: `On 14 Oct 2026 it said: "${checked.then}"` }, { text: `Now it says: "${checked.now}"` });
      }
      this.showTry(lines);
    });
  }

  /**
   * Create the page object and connect it. Called once, when the page loads.
   *
   * :param doc: The document.
   * :param options: See the constructor.
   * :return: The page object.
   */
  static start(doc, options = {}) {
    BriefDesk.page = new BriefDesk(doc, options);
    BriefDesk.page.connect();
    return BriefDesk.page;
  }
}

if (typeof document !== "undefined" && typeof document.getElementById === "function" && document.getElementById("desk-search-form")) {
  BriefDesk.start(document);
}
