// The actions this site shares with other agent sites, through its action bridge.
// bridge/agent-manifest.json names this module; the runtime loads it in the bridge frame
// on this site's origin, which has no Brief Desk page. A calling site's agent can then
// search this node's published passages and read one with its digest check, as the
// page's own assistant does. Nothing else is shared: not the brief, not another node.
import { BriefDesk } from "../page.js";

/**
 * Shares two reads with every site that calls this network. They read only what this
 * node already publishes to everyone (/chunks.jsonl), so "*" shares nothing private.
 */
class BridgeActions {
  /** Every caller: the passages are public facts the node publishes. */
  static CALLERS = ["*"];

  /** The reader: this node only, read from this origin, with no page to draw. */
  static reader = null;

  /**
   * The page-less reader of this node's passages, made on first use.
   *
   * :return: A BriefDesk with no page.
   */
  static desk() {
    if (!BridgeActions.reader) {
      const here = new URL("../", import.meta.url);
      BridgeActions.reader = new BriefDesk(null, {
        readFrom: here.origin,
        nodeOrigin: "https://agenticsystemcore.com",
        nodes: [{ id: "core", label: "AgenticSystemCore (the format and its vocabulary)", origin: "https://agenticsystemcore.com" }],
      });
    }
    return BridgeActions.reader;
  }

  /**
   * Register the shared reads with the bridge's registry. Each has the name and input of
   * the page's own action, so the network's instructions fit both.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    const node = { type: "string", enum: ["core"], description: "The node to use. From another site only this node, core, can be read." };
    const passage = { type: "string", minLength: 16, maxLength: 16, description: "The passage value of a result of website_search_passages, 16 characters." };
    actions.register({
      name: "search_passages",
      description: "Search the published passages of the AgenticSystemCore node by two to six plain words; if nothing matches, try other words once. Returns up to 8 passages, each with passage (its id), title, section, address, abstract and a short excerpt. Then read the best one or two with website_read_passage before answering. Changes nothing.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["node", "query"],
        properties: {
          node,
          query: { type: "string", minLength: 2, maxLength: 200, description: "Two to six plain words that the passage should contain." },
          limit: { type: "integer", minimum: 1, maximum: 8, description: "How many passages to return; 5 when left out." },
        },
      },
      execute: (args) => BridgeActions.desk().search(args),
    });
    actions.register({
      name: "read_passage",
      description: "Read one passage of the AgenticSystemCore node in full and check it: returns its text, its address, its licence, the SHA-256 digest the node published and digestMatches, which is true when the text read now has that digest. Use the text only when digestMatches is true. Changes nothing.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["node", "passage"],
        properties: { node, passage },
      },
      execute: (args) => BridgeActions.desk().read(args),
    });
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = BridgeActions.registerActions;
