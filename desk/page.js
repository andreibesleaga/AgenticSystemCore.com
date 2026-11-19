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

/** One knowledge node this page can read. */
class DeskNode {
  /**
   * :param id: Short name used in arguments, such as "core".
   * :param label: The name a visitor reads.
   * :param origin: The node's origin, such as "https://standards.agenticsystemcore.com":
   *   the origin its items' addresses carry.
   * :param own: True for the node this page belongs to.
   * :param readFrom: The origin its files are read from. It differs from origin only for
   *   this page's own node on a preview address, where the files sit beside the page.
   */
  constructor(id, label, origin, own, readFrom = origin) {
    this.id = id;
    this.label = label;
    this.origin = origin;
    this.readFrom = readFrom;
    this.own = own;
    this.allowed = own;
    this.passages = null; // loaded on first use
  }

  /** The address of the node's passage file. */
  get chunksUrl() {
    return `${this.readFrom}/chunks.jsonl`;
  }

  /** The host a visitor recognises, without the scheme. */
  get host() {
    return new URL(this.origin).host;
  }
}

/** The page object: state, operations and rendering of the Brief Desk. */
export class BriefDesk {
  /** The single page object; site.js and site-actions.js use it. */
  static page = null;

  /** The most cards a brief holds. */
  static BRIEF_LIMIT = 8;

  /** The most passages one search returns. */
  static SEARCH_LIMIT = 8;

  /** The most characters of a passage a read returns. */
  static READ_LIMIT = 6000;

  /** Words too common to search for. */
  static STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from",
    "how", "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "what", "when", "which", "who",
    "why", "with"]);

  /**
   * :param doc: The document to render into.
   * :param options: nodes (a list of {id, label, origin}), the first being this page's own
   *   node; fetchText (url → text) and sha256Hex (text → hex), replaceable in tests;
   *   readFrom and nodeOrigin, for a reader with no page (doc null), as in the bridge.
   */
  constructor(doc, options = {}) {
    this.doc = doc;
    // The page's own node is read from beside the page. Its items carry the node's
    // published origin, which the page states in data-node-origin.
    const here = options.readFrom || new URL(doc.URL || doc.location.href).origin;
    const own = options.nodeOrigin || doc.getElementById("desk").getAttribute("data-node-origin") || here;
    const nodes = options.nodes || BriefDesk.defaultNodes(own);
    this.nodes = nodes.map((n, i) => new DeskNode(n.id, n.label, n.origin, i === 0, i === 0 ? here : n.origin));
    this.fetchText = options.fetchText || BriefDesk.fetchText;
    this.sha256Hex = options.sha256Hex || BriefDesk.sha256Hex;
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

  /**
   * Read a public file as text. Sends no credentials.
   *
   * :param url: The address to read.
   * :return: The text of the file.
   * :raises Error: When the file cannot be read.
   */
  static async fetchText(url) {
    const response = await fetch(url, { credentials: "omit", redirect: "error" });
    if (!response.ok) {
      throw new Error(`${url} answered ${response.status}`);
    }
    return response.text();
  }

  /**
   * The SHA-256 digest of a text's UTF-8 bytes, in lower-case hexadecimal.
   *
   * :param text: The text to hash.
   * :return: 64 hexadecimal characters.
   */
  static async sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
   * Find a node by id, and say why it cannot be read when it cannot.
   *
   * :param id: The node id.
   * :return: {node} or a refusal.
   */
  usableNode(id) {
    const node = this.nodes.find((n) => n.id === id);
    if (!node) {
      return { ok: false, reason: `There is no node "${id}". The nodes are: ${this.nodes.map((n) => n.id).join(", ")}.`, field: "node" };
    }
    if (!node.allowed) {
      return {
        ok: false,
        reason: `The visitor has not allowed this page to read ${node.host}. Only the visitor can allow it, by ticking it under "Nodes to read" on the page.`,
        field: "node",
      };
    }
    return { ok: true, node };
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
   * Load a node's passages once per page load.
   *
   * :param node: The node to load.
   * :return: The list of passages.
   * :raises Error: When the file cannot be read or is not the expected format.
   */
  async passagesOf(node) {
    if (node.passages) {
      return node.passages;
    }
    const text = await this.fetchText(node.chunksUrl);
    const passages = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const record = JSON.parse(line);
      if (typeof record.id !== "string" || typeof record.text !== "string" || typeof record.digest !== "string"
        || typeof record.iri !== "string") {
        throw new Error(`${node.chunksUrl} holds a line without id, text, digest or iri`);
      }
      if (new URL(record.iri).origin !== node.origin) {
        throw new Error(`${node.chunksUrl} names an item on another origin`);
      }
      passages.push(record);
    }
    node.passages = passages;
    return passages;
  }

  // ---------------------------------------------------------------- reads

  /**
   * The words of a query that are worth searching for.
   *
   * :param query: What the visitor typed.
   * :return: Lower-case words.
   */
  static words(query) {
    return [...new Set(String(query).toLowerCase().split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !BriefDesk.STOP_WORDS.has(w)))];
  }

  /**
   * How well a passage matches the words: a title match counts most, then the abstract,
   * then the text.
   *
   * :param passage: One passage record.
   * :param words: The words to look for.
   * :return: The score; 0 means no match.
   */
  static score(passage, words) {
    const title = String(passage.title || "").toLowerCase();
    const abstract = String(passage.abstract || "").toLowerCase();
    const section = String(passage.section || "").toLowerCase();
    const text = passage.text.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (title.includes(word)) {
        score += 5;
      }
      if (section.includes(word)) {
        score += 2;
      }
      if (abstract.includes(word)) {
        score += 2;
      }
      const hits = text.split(word).length - 1;
      score += Math.min(hits, 3);
    }
    return score;
  }

  /**
   * The short form of a passage that a search returns.
   *
   * :param node: The node it belongs to.
   * :param passage: The passage record.
   * :return: Plain JSON.
   */
  static summary(node, passage) {
    return {
      node: node.id,
      passage: passage.id.slice(0, 16),
      title: passage.title || passage.item,
      section: passage.section || "",
      address: BriefDesk.address(passage),
      abstract: passage.abstract || "",
      excerpt: BriefDesk.excerpt(passage.text, 240),
    };
  }

  /**
   * The address of a passage: its item's address, then "#chunk-" and 16 characters.
   *
   * :param passage: The passage record.
   * :return: The address.
   */
  static address(passage) {
    return `${passage.iri}#chunk-${passage.id.slice(0, 16)}`;
  }

  /**
   * A passage's Markdown as plain words, for an excerpt a person reads: no emphasis marks,
   * no code ticks, no heading marks, a link as its text. The digest is always computed over
   * the passage as published, never over this.
   *
   * :param text: Markdown text.
   * :return: Plain text.
   */
  static plain(text) {
    return text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/(\*\*|__|`)/g, "");
  }

  /**
   * The start of a text, cut at a word, on one line.
   *
   * :param text: The text.
   * :param length: The most characters to keep.
   * :return: The excerpt.
   */
  static excerpt(text, length) {
    const flat = BriefDesk.plain(text).replace(/\s+/g, " ").trim();
    if (flat.length <= length) {
      return flat;
    }
    const cut = flat.slice(0, length);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), length - 40))}…`;
  }

  /**
   * Search one node's passages for the words of a query. Changes nothing on the page.
   *
   * :param args: query, node and an optional limit.
   * :return: {ok, node, query, count, passages} or a refusal.
   */
  async search(args) {
    const usable = this.usableNode(args.node);
    if (!usable.ok) {
      return usable;
    }
    const words = BriefDesk.words(args.query);
    if (words.length === 0) {
      return { ok: false, reason: "Give at least one word of two letters or more to search for.", field: "query" };
    }
    const limit = Math.min(args.limit || 5, BriefDesk.SEARCH_LIMIT);
    const passages = await this.passagesOf(usable.node);
    const ranked = passages
      .map((passage) => ({ passage, score: BriefDesk.score(passage, words) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || (a.passage.id < b.passage.id ? -1 : 1))
      .slice(0, limit);
    return {
      ok: true,
      node: usable.node.id,
      query: String(args.query),
      count: ranked.length,
      passages: ranked.map((r) => BriefDesk.summary(usable.node, r.passage)),
    };
  }

  /**
   * Find one passage by the first 16 characters of its id.
   *
   * :param args: node and passage.
   * :return: {ok, node, record} or a refusal.
   */
  async find(args) {
    const usable = this.usableNode(args.node);
    if (!usable.ok) {
      return usable;
    }
    const passages = await this.passagesOf(usable.node);
    const record = passages.find((p) => p.id.startsWith(String(args.passage)));
    if (!record || String(args.passage).length !== 16) {
      return {
        ok: false,
        reason: `The node ${usable.node.id} has no passage "${args.passage}". Use a passage value from a search result.`,
        field: "passage",
      };
    }
    return { ok: true, node: usable.node, record };
  }

  /**
   * Read one passage in full and check it against the digest the node published.
   * Changes nothing on the page.
   *
   * :param args: node and passage.
   * :return: The passage with digest, digestMatches, licence and address, or a refusal.
   */
  async read(args) {
    const found = await this.find(args);
    if (!found.ok) {
      return found;
    }
    const { node, record } = found;
    const computed = await this.sha256Hex(record.text);
    return {
      ok: true,
      node: node.id,
      passage: record.id.slice(0, 16),
      title: record.title || record.item,
      section: record.section || "",
      address: BriefDesk.address(record),
      text: record.text.length > BriefDesk.READ_LIMIT ? `${record.text.slice(0, BriefDesk.READ_LIMIT)}…` : record.text,
      truncated: record.text.length > BriefDesk.READ_LIMIT,
      digest: record.digest,
      digestMatches: computed === record.digest,
      license: record.license || "",
      licenseUrl: record.license_url || "",
    };
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
    const card = {
      card: `c${this.nextCard}`,
      node: node.id,
      nodeLabel: node.label,
      title: record.title || record.item,
      section: record.section || "",
      address,
      digest: record.digest,
      digestMatches: true,
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
    return `${lines.join("\n")}\n`;
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

  /** Draw the brief, its count and the node list from the state. A reader with no page draws nothing. */
  render() {
    if (!this.doc) {
      return;
    }
    const list = this.doc.getElementById("desk-brief");
    const items = this.cards.map((card) => {
      const item = this.element("li", null, { "data-card": card.card });
      const where = card.section ? `${card.title} — ${card.section}` : card.title;
      item.append(
        this.element("a", where, { href: card.address }),
        this.element("span", " ✓ digest matches", { class: "desk-ok", title: `sha-256 ${card.digest}` }),
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
    this.doc.getElementById("desk-discard").addEventListener("click", () => {
      const result = this.discard({ expectedVersion: this.version });
      status.textContent = result.ok ? `Discarded ${result.discarded} card${result.discarded === 1 ? "" : "s"}.` : result.reason;
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

if (typeof document !== "undefined" && document.getElementById("desk-search-form")) {
  BriefDesk.start(document);
}
