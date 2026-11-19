// Fixture nodes for the tests: three small passage files with real SHA-256 digests, and a
// stand-in for fetch that serves them and records every address asked for. No network.
import { createHash } from "node:crypto";

const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/** Builds passage files and a recording fetch for the tests. */
export class Fixtures {
  /**
   * One passage record in the shape a node publishes in /chunks.jsonl.
   *
   * :param origin: The node's origin.
   * :param slug: The item's slug.
   * :param title: The item's title.
   * :param section: The section name, or "".
   * :param text: The passage text.
   * :return: The record, with its id and the digest of its text.
   */
  static passage(origin, slug, title, section, text) {
    const iri = `${origin}/concepts/${slug}/`;
    return {
      abstract: `About ${title}.`,
      digest: sha(text),
      id: sha(`${iri}\0${section}\0${0}`),
      iri: iri,
      item: slug,
      license: "LicenseRef-Test-1.0",
      license_url: `${origin}/legal/`,
      ordinal: 0,
      section: section,
      text: text,
      title: title,
    };
  }

  /**
   * :param base: The page's origin in the tests.
   */
  constructor(base) {
    this.base = base;
    this.patterns = "https://patterns.agenticsystemcore.com";
    this.standards = "https://standards.agenticsystemcore.com";
    this.requests = [];
    // The page's own node: read from beside the page, its items under its published origin.
    this.node = "https://agenticsystemcore.com";
    this.core = [];
    for (let i = 1; i <= 10; i += 1) {
      this.core.push(Fixtures.passage(this.node, `item-${i}`, `Item ${i}`, i % 2 ? "" : "details",
        `Passage ${i} explains the ledger and the digest of file number ${i}. Its own keyword is k${i}k.`));
    }
    // One passage whose text was changed after its digest was published.
    const tampered = Fixtures.passage(this.node, "tampered", "Tampered item", "", "The original sentence.");
    tampered.text = "A changed sentence about the ledger.";
    this.core.push(tampered);
    this.tampered = tampered;
    this.patternCards = [Fixtures.passage(this.patterns, "supervisor", "Supervisor", "", "A supervisor splits a task and checks the parts.")];
    // A file that names an item on another origin: the page must refuse to use it.
    this.foreign = [Fixtures.passage("https://elsewhere.example", "stray", "Stray", "", "Not this node's item.")];
    this.files = new Map([
      [`${base}/chunks.jsonl`, this.core],
      [`${this.patterns}/chunks.jsonl`, this.patternCards],
      [`${this.standards}/chunks.jsonl`, this.foreign],
    ]);
    // Each node's discovery document, made when asked for, so it follows a test's change to
    // the records; a test replaces an entry to publish a digest the file does not have.
    this.linksets = new Map([
      [`${base}/.well-known/knowledge-linkset`, () => Fixtures.linkset(this.node, this.core)],
      [`${this.patterns}/.well-known/knowledge-linkset`, () => Fixtures.linkset(this.patterns, this.patternCards)],
    ]);
  }

  /** The text of a passage file: one JSON line per record. */
  static fileText(records) {
    return `${records.map((r) => JSON.stringify(r)).join("\n")}\n`;
  }

  /**
   * A discovery document that publishes the digest of a node's passage file, in the shape
   * of /.well-known/knowledge-linkset.
   *
   * :param origin: The node's published origin.
   * :param records: The records of its passage file.
   * :return: The document.
   */
  static linkset(origin, records) {
    const digest = createHash("sha256").update(Fixtures.fileText(records), "utf8").digest("base64");
    return { linkset: [{ anchor: `${origin}/`, "https://w3id.org/agentic-system-core/rel#surface": [
      { href: `${origin}/chunks.jsonl`, "agsc-surface": ["chunks"], digest: [`sha-256=:${digest}:`] },
    ] }] };
  }

  /** The first 16 characters of a passage's id, as the actions take it. */
  static id16(passage) {
    return passage.id.slice(0, 16);
  }

  /**
   * Install the recording fetch as the global one.
   *
   * :return: This object.
   */
  install() {
    globalThis.fetch = async (url) => {
      this.requests.push(String(url));
      const linkset = this.linksets.get(String(url));
      if (linkset) {
        return { ok: true, status: 200, text: async () => JSON.stringify(linkset()) };
      }
      const records = this.files.get(String(url));
      if (!records) {
        return { ok: false, status: 404, text: async () => "" };
      }
      return { ok: true, status: 200, text: async () => Fixtures.fileText(records) };
    };
    return this;
  }
}
