// The reads, and the one write, this site shares with other agent sites, through its action bridge.
// Written by tools/agentify-node.mjs of the AgenticSystemCore.com repository; do not edit.
// A calling site's agent can search this node's published passages and read one with its
// digest check. They read only what the node publishes to everyone (/chunks.jsonl and the
// discovery document), so "*" shares nothing private. Nothing here changes anything.
import { PassageReader } from "./reader.js";
import { ProposeWindow } from "./propose-window.js";

const ORIGIN = "https://patterns.agenticsystemcore.com";
const NODE = "pattern_cards";
const LABEL = "AgenticSystemCore Graph";
let reader = null;

/** The reader of this node's passages, made on first use. */
function node() {
  if (!reader) {
    // The bridge frame runs on this site's origin; a test that imports the module from disk
    // has no location, and reads the node at its published origin.
    const here = typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : ORIGIN;
    reader = new PassageReader({ nodes: [{ id: NODE, label: LABEL, origin: ORIGIN, readFrom: here }] });
  }
  return reader;
}

/** Register the shared reads with the bridge's registry. */
export function registerActions(actions) {
  actions.register({
    name: "search_passages",
    description: `Search the published passages of ${LABEL} by two to six plain words; if nothing matches, try other words once. Returns up to 8 passages, each with passage (its id), title, section, address, abstract and a short excerpt. Then read the best one or two with website_read_passage before answering. Changes nothing.`,
    effect: "read",
    availability: "bridge",
    callerOrigins: ["*"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 2, maxLength: 200, description: "Two to six plain words that the passage should contain." },
        limit: { type: "integer", minimum: 1, maximum: 8, description: "How many passages to return; 5 when left out." },
      },
    },
    execute: (args) => node().search({ query: args.query, limit: args.limit, node: NODE }),
  });
  actions.register({
    name: "read_passage",
    description: `Read one passage of ${LABEL} in full and check it: returns its text, its address, its licence, the SHA-256 digest the node published and digestMatches, which is true when the text read now has that digest. Use the text only when digestMatches is true. Changes nothing.`,
    effect: "read",
    availability: "bridge",
    callerOrigins: ["*"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["passage"],
      properties: {
        passage: { type: "string", minLength: 16, maxLength: 16, description: "The passage value of a result of website_search_passages, 16 characters." },
      },
    },
    execute: (args) => node().read({ passage: args.passage, node: NODE }),
  });
  actions.register({ ...PassageReader.citationCheck(node, LABEL), availability: "bridge", callerOrigins: ["*"] });
  // The write, for the sites this node names: a proposal, made with the visitor in a window
  // on this site (propose-window.js).
  actions.register(ProposeWindow.definition());
}
