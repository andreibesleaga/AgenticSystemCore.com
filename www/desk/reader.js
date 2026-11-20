// Reads the passages a knowledge node publishes, and checks them.
//
// One implementation, used in three places: the Brief Desk page (page.js), this site's
// action bridge (bridge/bridge-actions.js), and the bridge that tools/agentify-node.mjs
// writes for another node. It draws nothing and holds no brief.
//
// What is read, per node, and from that node only:
//   /chunks.jsonl                     the passages: each line holds the address of its item
//                                     (iri), its text and the SHA-256 digest of that text.
//                                     A node of more than 500 items publishes the lines in
//                                     /chunks-01.jsonl, /chunks-02.jsonl, … and this file
//                                     is then the list of those shards;
//   /.well-known/knowledge-linkset    the node's discovery document, which names the
//                                     passage file and publishes the digest of the file.
//
// What the two checks show, and what they do not. The file check compares the passage file
// with the digest the discovery document publishes for it; the passage check compares a
// passage's text with the digest on its own line. Both digests come from the same site as
// the text, so a match shows that the node's files agree with each other and arrived whole.
// It does not show that the text is true, and it cannot catch a publisher who changes the
// text and both digests together. The check that does not depend on the node is verify():
// a digest someone noted earlier, in a brief, is compared with the text the node publishes
// now, so a passage that was changed since then is seen.

/** One knowledge node a reader can read. */
export class DeskNode {
  /**
   * :param id: Short name used in arguments, such as "core".
   * :param label: The name a visitor reads.
   * :param origin: The node's origin, such as "https://standards.agenticsystemcore.com":
   *   the origin its items' addresses carry.
   * :param own: True for the node the page or bridge belongs to; it is read without asking.
   * :param readFrom: The origin its files are read from. It differs from origin only for
   *   a page's own node on a preview address, where the files sit beside the page.
   */
  constructor(id, label, origin, own, readFrom = origin) {
    this.id = id;
    this.label = label;
    this.origin = origin;
    this.readFrom = readFrom;
    this.own = own;
    this.allowed = own;
    this.passages = null; // loaded on first use
    this.fileCheck = null; // "matches" once the passage file is loaded and checked
  }

  /** The address the node's passage file is read from. */
  get chunksUrl() {
    return `${this.readFrom}/chunks.jsonl`;
  }

  /** The address the node's discovery document is read from. */
  get linksetUrl() {
    return `${this.readFrom}/.well-known/knowledge-linkset`;
  }

  /** The host a visitor recognises, without the scheme. */
  get host() {
    return new URL(this.origin).host;
  }
}

/** Searches, reads and checks the published passages of a list of nodes. */
export class PassageReader {
  /** The most passages one search returns. */
  static SEARCH_LIMIT = 8;

  /** The most characters of a passage a read returns. */
  static READ_LIMIT = 6000;

  /** The most bytes of a file the reader takes, and how long it waits for one. */
  static FILE_LIMIT = 8 * 1000 * 1000;
  static FILE_TIMEOUT_MS = 20000;

  /** The most shards of a passage file the reader takes, and the most characters of all of them. */
  static SHARD_LIMIT = 20;
  static SHARDS_TOTAL_LIMIT = 32 * 1000 * 1000;

  /** The most entries of a saved brief one check takes. */
  static SAVED_LIMIT = 40;

  /** The most citations one call of the shared citation check takes. */
  static CITATION_LIMIT = 8;

  /** Words too common to search for. */
  static STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from",
    "how", "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "what", "when", "which", "who",
    "why", "with"]);

  /**
   * :param options: nodes, a list of {id, label, origin, readFrom}, the first being the
   *   reader's own node; fetchText (url → text) and sha256Hex (text → hex), replaceable in
   *   tests.
   */
  constructor(options = {}) {
    this.nodes = (options.nodes || []).map((n, i) => new DeskNode(n.id, n.label, n.origin, i === 0, n.readFrom || n.origin));
    this.fetchText = options.fetchText || PassageReader.fetchText;
    this.sha256Hex = options.sha256Hex || PassageReader.sha256Hex;
  }

  /**
   * Read a public file as text. Sends no credentials, follows no redirect, and asks the
   * site again each time instead of trusting a copy the browser kept, so that a later
   * check compares with what the node publishes now.
   *
   * :param url: The address to read.
   * :return: The text of the file.
   * :raises Error: When the file cannot be read.
   */
  static async fetchText(url) {
    // Another node's file is read only after the visitor allows it, but it may still be
    // slow or large: stop after FILE_TIMEOUT_MS or FILE_LIMIT bytes, and fail closed.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PassageReader.FILE_TIMEOUT_MS);
    try {
      const response = await fetch(url, { credentials: "omit", redirect: "error", cache: "no-cache", signal: controller.signal });
      if (!response.ok) {
        throw new Error(`${url} answered ${response.status}`);
      }
      if (!response.body || typeof response.body.getReader !== "function") {
        const text = await response.text();
        if (text.length > PassageReader.FILE_LIMIT) {
          throw new Error(`${url} is larger than ${PassageReader.FILE_LIMIT} bytes`);
        }
        return text;
      }
      const reader = response.body.getReader();
      const parts = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        size += value.byteLength;
        if (size > PassageReader.FILE_LIMIT) {
          controller.abort();
          throw new Error(`${url} is larger than ${PassageReader.FILE_LIMIT} bytes`);
        }
        parts.push(value);
      }
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const part of parts) {
        bytes.set(part, at);
        at += part.byteLength;
      }
      return new TextDecoder().decode(bytes);
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error(`${url} did not answer within ${PassageReader.FILE_TIMEOUT_MS / 1000} seconds`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
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

  // ---------------------------------------------------------------- nodes and files

  /**
   * Find a node by id, and say why it cannot be read when it cannot.
   *
   * :param id: The node id.
   * :return: {ok, node} or a refusal.
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
   * The SHA-256 digest a discovery document publishes for one file, in hexadecimal.
   * The document is a link set: somewhere in it an object has "href" equal to the file's
   * address and "digest" holding "sha-256=:<base64>:".
   *
   * :param linkset: The parsed discovery document.
   * :param href: The published address of the file.
   * :return: 64 hexadecimal characters, or "" when the document names no digest for it.
   */
  static publishedDigest(linkset, href) {
    const stack = [[linkset, 0]];
    while (stack.length) {
      const [value, depth] = stack.pop();
      if (!value || typeof value !== "object" || depth > 8) {
        continue;
      }
      if (value.href === href) {
        for (const entry of [].concat(value.digest || [])) {
          const match = /^sha-256=:([A-Za-z0-9+/]{43}=):$/.exec(String(entry));
          if (match) {
            return [...atob(match[1])].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
          }
        }
      }
      for (const child of Object.values(value)) {
        stack.push([child, depth + 1]);
      }
    }
    return "";
  }

  /**
   * Compare a node's passage file with the digest its discovery document publishes.
   *
   * :param node: The node.
   * :param text: The text of its passage file, as read.
   * :return: "matches", "differs", "not published" (the document names no digest for the
   *   file) or "unreadable" (the document could not be read).
   */
  async checkFile(node, text) {
    let linkset = null;
    try {
      linkset = JSON.parse(await this.fetchText(node.linksetUrl));
    } catch (error) {
      return "unreadable";
    }
    const published = PassageReader.publishedDigest(linkset, `${node.origin}/chunks.jsonl`);
    if (!published) {
      return "not published";
    }
    return published === await this.sha256Hex(text) ? "matches" : "differs";
  }

  /**
   * The shard paths a passage file names, when it is a shard list and not the passages
   * themselves: one JSON object with a "shards" member, as a node of more than 500 items
   * publishes.
   *
   * :param text: The text of /chunks.jsonl.
   * :return: The paths in order, or null when the file holds the passages itself.
   * :raises Error: When the list names something other than /chunks-<nn>.jsonl, or too many.
   */
  static shardsOf(text) {
    let value = null;
    try {
      value = JSON.parse(text);
    } catch (error) {
      return null; // several lines, so passages
    }
    if (!value || typeof value !== "object" || !Array.isArray(value.shards)) {
      return null;
    }
    if (value.shards.length > PassageReader.SHARD_LIMIT) {
      throw new Error(`the passage file names ${value.shards.length} shards; this reader takes ${PassageReader.SHARD_LIMIT} at most`);
    }
    for (const shard of value.shards) {
      if (typeof shard !== "string" || !/^\/chunks-[0-9]{2,4}\.jsonl$/.test(shard)) {
        throw new Error("the passage file names a shard that is not /chunks-<nn>.jsonl");
      }
    }
    return value.shards;
  }

  /**
   * The lines of a node's passages: those of its passage file, or, when that file is a
   * shard list, those of the shards read in the listed order from the same node.
   *
   * :param node: The node.
   * :param text: The text of its /chunks.jsonl.
   * :return: The lines.
   * :raises Error: When a shard cannot be read or the shards together are too large.
   */
  async linesOf(node, text) {
    const shards = PassageReader.shardsOf(text);
    if (!shards) {
      return text.split("\n");
    }
    const lines = [];
    let size = 0;
    for (const shard of shards) {
      const part = await this.fetchText(`${node.readFrom}${shard}`);
      size += part.length;
      if (size > PassageReader.SHARDS_TOTAL_LIMIT) {
        throw new Error(`the passages of ${node.host} are larger than ${PassageReader.SHARDS_TOTAL_LIMIT} characters`);
      }
      lines.push(...part.split("\n"));
    }
    return lines;
  }

  /**
   * Load a node's passages once, and check the file against the node's discovery document.
   * For a sharded node the discovery document's digest is that of the shard list, so the
   * file check covers the list; each passage still carries its own digest.
   *
   * :param node: The node to load.
   * :return: The list of passages.
   * :raises Error: When the file cannot be read or is not the expected format, and when it
   *   cannot be checked: the discovery document cannot be read, publishes no digest for
   *   the file, or publishes another digest. A node's passages are used only when checked.
   */
  async passagesOf(node) {
    if (node.passages) {
      return node.passages;
    }
    const text = await this.fetchText(node.chunksUrl);
    const passages = [];
    for (const line of await this.linesOf(node, text)) {
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
    const fileCheck = await this.checkFile(node, text);
    if (fileCheck !== "matches") {
      const why = {
        "differs": `does not match the digest that ${node.host} publishes for it in its discovery document`,
        "not published": `has no digest in the discovery document of ${node.host}`,
        "unreadable": `could not be checked, because the discovery document of ${node.host} could not be read`,
      };
      throw new Error(`${node.chunksUrl} ${why[fileCheck]}, so it was not used`);
    }
    node.fileCheck = fileCheck;
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
      .filter((w) => w.length > 1 && !PassageReader.STOP_WORDS.has(w)))];
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
      address: PassageReader.address(passage),
      abstract: passage.abstract || "",
      excerpt: PassageReader.excerpt(passage.text, 240),
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
    const flat = PassageReader.plain(text).replace(/\s+/g, " ").trim();
    if (flat.length <= length) {
      return flat;
    }
    const cut = flat.slice(0, length);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), length - 40))}…`;
  }

  /**
   * Search one node's passages for the words of a query. Changes nothing.
   *
   * :param args: query, node and an optional limit.
   * :return: {ok, node, query, count, passages} or a refusal.
   */
  async search(args) {
    const usable = this.usableNode(args.node);
    if (!usable.ok) {
      return usable;
    }
    const words = PassageReader.words(args.query);
    if (words.length === 0) {
      return { ok: false, reason: "Give at least one word of two letters or more to search for.", field: "query" };
    }
    const limit = Math.min(args.limit || 5, PassageReader.SEARCH_LIMIT);
    const passages = await this.passagesOf(usable.node);
    const ranked = passages
      .map((passage) => ({ passage, score: PassageReader.score(passage, words) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || (a.passage.id < b.passage.id ? -1 : 1))
      .slice(0, limit);
    return {
      ok: true,
      node: usable.node.id,
      query: String(args.query),
      count: ranked.length,
      passages: ranked.map((r) => PassageReader.summary(usable.node, r.passage)),
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
   * Changes nothing.
   *
   * :param args: node and passage.
   * :return: The passage with digest, digestMatches, fileCheck (always "matches": a file
   *   that is not checked is not used), licence and address, or a refusal.
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
      address: PassageReader.address(record),
      text: record.text.length > PassageReader.READ_LIMIT ? `${record.text.slice(0, PassageReader.READ_LIMIT)}…` : record.text,
      truncated: record.text.length > PassageReader.READ_LIMIT,
      digest: record.digest,
      digestMatches: computed === record.digest,
      fileCheck: node.fileCheck,
      license: record.license || "",
      licenseUrl: record.license_url || "",
    };
  }

  // ---------------------------------------------------------------- checking again

  /**
   * Forget what was loaded from the nodes, so that the next read fetches their files again.
   */
  forget() {
    for (const node of this.nodes) {
      node.passages = null;
      node.fileCheck = null;
    }
  }

  /**
   * Compare a digest noted earlier with the text a node publishes now at the same address.
   * Call forget() first to compare with the files as they are now. Changes nothing.
   *
   * :param entry: address (an item's address with "#chunk-" and 16 characters) and digest
   *   (64 hexadecimal characters).
   * :return: {address, status, reason}. status is "unchanged"; "changed" (the address still
   *   has a passage, with other text); "moved" (the same text is on the item, under another
   *   passage id); "gone" (the item has no such passage and no passage with that text);
   *   or "not checked", with the reason.
   */
  async verify(entry) {
    const address = String(entry.address);
    const digest = String(entry.digest).toLowerCase();
    const result = (status, reason = "") => ({ address, status, reason });
    let url = null;
    try {
      url = new URL(address);
    } catch (error) {
      return result("not checked", "That is not an address.");
    }
    const id = /^#chunk-([0-9a-f]{16})$/.exec(url.hash);
    const node = this.nodes.find((n) => n.origin === url.origin);
    if (!id || !node) {
      return result("not checked", node ? "The address names no passage." : `This page reads only ${this.nodes.map((n) => n.host).join(", ")}.`);
    }
    if (!node.allowed) {
      return result("not checked", `Tick ${node.host} under "Nodes to read" first.`);
    }
    let passages = null;
    try {
      passages = await this.passagesOf(node);
    } catch (error) {
      return result("not checked", `The node could not be read: ${error.message}`);
    }
    const iri = address.slice(0, address.length - url.hash.length);
    const onItem = passages.filter((p) => p.iri === iri);
    const record = onItem.find((p) => p.id.startsWith(id[1]));
    if (record) {
      return result(await this.sha256Hex(record.text) === digest ? "unchanged" : "changed");
    }
    for (const other of onItem) {
      if (await this.sha256Hex(other.text) === digest) {
        return result("moved", `The same text is now at ${PassageReader.address(other)}.`);
      }
    }
    return result("gone");
  }

  /**
   * The cited passages of a brief saved as Markdown: each "Source:" line this page writes
   * holds an address in angle brackets and a SHA-256 digest.
   *
   * :param markdown: The saved brief.
   * :return: A list of {address, digest}, at most SAVED_LIMIT.
   */
  static savedEntries(markdown) {
    const entries = [];
    const pattern = /<(https:\/\/[^\s<>]+#chunk-[0-9a-f]{16})>\s*\(sha-256 ([0-9a-fA-F]{64})\b/g;
    for (const match of String(markdown).slice(0, 200000).matchAll(pattern)) {
      entries.push({ address: match[1], digest: match[2].toLowerCase() });
      if (entries.length === PassageReader.SAVED_LIMIT) {
        break;
      }
    }
    return entries;
  }

  /**
   * The citation check as an action definition: the page, this site's bridge and the
   * bridges of other nodes register the same one. It takes citations someone saved, each an
   * address and a SHA-256 digest, and says for each whether the node publishes the same text
   * now. A citation that is not an address of a node this reader reads, or not a digest, is
   * reported as not checked; the schema checks only the shape, so such a citation reaches
   * that per-entry report. The caller adds availability and callerOrigins.
   *
   * :param readerOf: A function that returns the PassageReader to use.
   * :param label: The node or nodes, as the description names them.
   * :return: The definition: name, description, effect, inputSchema, execute.
   */
  static citationCheck(readerOf, label) {
    return {
      name: "check_citations",
      description: `Check citations of ${label} that someone saved earlier, such as the source lines of a brief: give each passage address (it ends in #chunk- and 16 characters) with the SHA-256 digest the citation holds. Returns, for each, unchanged (the same text is published now), changed, moved (the same text at another address, which is given) or gone, or not checked with the reason. Changes nothing.`,
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["citations"],
        properties: {
          citations: {
            type: "array",
            minItems: 1,
            maxItems: PassageReader.CITATION_LIMIT,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["address", "digest"],
              properties: {
                address: { type: "string", maxLength: 500, description: "The passage address, ending in #chunk- and 16 characters." },
                digest: { type: "string", maxLength: 200, description: "The SHA-256 digest the citation holds, 64 hexadecimal characters." },
              },
            },
          },
        },
      },
      execute: (args) => readerOf().checkCitations(args.citations),
    };
  }

  /**
   * Check citations given by a caller: well-formed ones against their node, the rest
   * reported as not checked.
   *
   * :param citations: A list of {address, digest}.
   * :return: {ok, checked, unchanged, results}, results in the order given.
   */
  async checkCitations(citations) {
    const list = Array.isArray(citations) ? citations.slice(0, PassageReader.CITATION_LIMIT) : [];
    const wellFormed = list.map((c) => /^https:\/\/[^\s<>#]+#chunk-[0-9a-f]{16}$/.test(String(c?.address)) && /^[0-9a-fA-F]{64}$/.test(String(c?.digest)));
    const found = await this.verifyAll(list.filter((c, i) => wellFormed[i]).map((c) => ({ address: c.address, digest: c.digest.toLowerCase() })));
    const checked = [...found.results];
    const results = list.map((c, i) => (wellFormed[i] ? checked.shift() : { address: String(c?.address ?? "").slice(0, 500), status: "not checked", reason: "This is not a passage address with a SHA-256 digest of 64 hexadecimal characters." }));
    return { ok: true, checked: results.filter((r) => r.status !== "not checked").length, unchanged: results.filter((r) => r.status === "unchanged").length, results };
  }

  /**
   * Check a list of noted passages against what their nodes publish now.
   *
   * :param entries: A list of {address, digest}.
   * :return: {ok, checked, unchanged, results}, results being what verify() returned for each.
   */
  async verifyAll(entries) {
    this.forget();
    const results = [];
    for (const entry of entries) {
      results.push(await this.verify(entry));
    }
    return {
      ok: true,
      checked: results.filter((r) => r.status !== "not checked").length,
      unchanged: results.filter((r) => r.status === "unchanged").length,
      results,
    };
  }
}
