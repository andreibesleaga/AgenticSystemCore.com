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

  /**
   * :param doc: The document to render into.
   * :param options: nodes (a list of {id, label, origin}), the first being this page's own
   *   node; fetchText (url → text) and sha256Hex (text → hex), replaceable in tests.
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
      lines.push("", `To see whether a passage has changed since, paste this brief under "Check a saved brief" at <${this.home}>.`);
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
    this.doc.getElementById("desk-search-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const query = this.doc.getElementById("desk-query").value;
      const node = this.doc.getElementById("desk-node").value;
      status.textContent = "Searching…";
      try {
        const result = await this.search({ query, node, limit: BriefDesk.SEARCH_LIMIT });
        if (result.ok) {
          this.lastSearch = { query: result.query, node: result.node, count: result.count };
        }
        this.renderResults(result);
      } catch (error) {
        status.textContent = `The search could not read the node: ${error.message}`;
      }
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
    this.doc.getElementById("desk-saved-check").addEventListener("click", async () => {
      const report = this.doc.getElementById("desk-saved-status");
      const list = this.doc.getElementById("desk-saved-results");
      report.textContent = "Reading the passages…";
      list.replaceChildren();
      try {
        const result = await this.checkSaved(this.doc.getElementById("desk-saved-text").value);
        if (!result.ok) {
          report.textContent = result.reason;
          return;
        }
        report.textContent = `${result.unchanged} of ${result.results.length} cited passage${result.results.length === 1 ? "" : "s"} unchanged.`;
        list.replaceChildren(...result.results.map((r) => {
          const item = this.element("li");
          // Only an address this page read from one of its nodes becomes a link.
          item.append(
            r.status === "not checked" ? this.element("span", r.address) : this.element("a", r.address, { href: r.address }),
            this.element("p", BriefDesk.verdict(r), { class: r.status === "unchanged" ? "desk-ok" : "desk-bad" }),
          );
          return item;
        }));
      } catch (error) {
        report.textContent = `The check could not finish: ${error.message}`;
      }
    });
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
    this.render();
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
