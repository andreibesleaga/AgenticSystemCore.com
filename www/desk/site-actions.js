// Registers the Brief Desk's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
//
// Every action wraps a method of the page object the page's own buttons use
// (page.js), so the assistant and the visitor follow one set of rules. The rules live
// in page.js, not here.
import { BriefDesk } from "./page.js";

/**
 * Describes the page's operations as actions the agents can call.
 *
 * The runtime validates arguments against inputSchema before execute runs, and asks the
 * visitor to confirm an "irreversible" action first.
 */
class SiteActions {
  /** The node ids the page knows, for the schemas. */
  static nodeIds() {
    return BriefDesk.page.nodes.map((node) => node.id);
  }

  /** The schema of the node argument. */
  static nodeProperty() {
    return {
      type: "string",
      enum: SiteActions.nodeIds(),
      description: "The node to use: an id from website_get_desk_state. Only nodes with allowed true can be read.",
    };
  }

  /** The schema of the passage argument. */
  static passageProperty() {
    return {
      type: "string",
      minLength: 16,
      maxLength: 16,
      description: "The passage value of a result of website_search_passages, 16 characters.",
    };
  }

  /**
   * Register every site action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(SiteActions.stateAction());
    actions.register(SiteActions.searchAction());
    actions.register(SiteActions.readAction());
    actions.register(SiteActions.addAction());
    actions.register(SiteActions.removeAction());
    actions.register(SiteActions.discardAction());
  }

  /** Read the nodes and the brief. */
  static stateAction() {
    return {
      name: "get_desk_state",
      description: "Read this page's state: the knowledge nodes, whether the visitor allowed reading each and its home address, and the brief with its version and its cards (card id, title, address, digest). Call it before answering about the nodes or the brief, and again in each turn that needs it: the visitor can also use the page. Changes nothing.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => BriefDesk.page.getState(),
    };
  }

  /** Search one node's published passages. */
  static searchAction() {
    return {
      name: "search_passages",
      description: "Search the published passages of one allowed node by two to six plain words; if nothing matches, try other words once. Returns up to 8 passages, each with passage (its id), title, section, address, abstract and a short excerpt. Then read the best one or two with website_read_passage before answering. Returns ok false with a reason when the visitor has not allowed that node. Changes nothing on the page.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["node", "query"],
        properties: {
          node: SiteActions.nodeProperty(),
          query: { type: "string", minLength: 2, maxLength: 200, description: "Two to six plain words that the passage should contain." },
          limit: { type: "integer", minimum: 1, maximum: 8, description: "How many passages to return; 5 when left out." },
        },
      },
      execute: (args) => BriefDesk.page.search(args),
    };
  }

  /** Read one passage in full and check its digest. */
  static readAction() {
    return {
      name: "read_passage",
      description: "Read one passage in full and check it: returns its text, its address, its licence, the SHA-256 digest its node published and digestMatches, which is true when the text read now has that digest. Use the text only when digestMatches is true. Changes nothing on the page.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["node", "passage"],
        properties: { node: SiteActions.nodeProperty(), passage: SiteActions.passageProperty() },
      },
      execute: (args) => BriefDesk.page.read(args),
    };
  }

  /** Add a passage to the brief as a cited card. */
  static addAction() {
    return {
      name: "add_card",
      description: "Call it only when the visitor asks, with node and passage from a search result. Add one passage to the visitor's brief as a cited card. The page checks the passage's digest first and refuses a passage that does not match, one already in the brief, or a ninth card. Returns the card and the new brief version, or ok false with a reason. The visitor can remove a card on the page.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["node", "passage"],
        properties: { node: SiteActions.nodeProperty(), passage: SiteActions.passageProperty() },
      },
      execute: (args) => BriefDesk.page.pin(args),
    };
  }

  /** Remove one card from the brief. */
  static removeAction() {
    return {
      name: "remove_card",
      description: "Call it only when the visitor asks, with a card id from website_get_desk_state. Remove one card from the brief. Returns the new brief version and count, or ok false with a reason. The visitor can add the passage again.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["card"],
        properties: {
          card: { type: "string", minLength: 2, maxLength: 12, description: "The card id from website_get_desk_state, such as c2." },
        },
      },
      execute: (args) => BriefDesk.page.remove(args),
    };
  }

  /** Discard the whole brief; the visitor confirms first. */
  static discardAction() {
    return {
      name: "discard_brief",
      description: "Discard every card of the brief, only when the visitor asks. In the turn you call it, first call website_get_desk_state and wait for its result: this needs brief.version from it, and results from earlier turns are not kept. The page cannot bring the cards back, so the browser asks the visitor to confirm first. The page refuses a stale expectedVersion or an empty brief. Returns how many cards were discarded.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["expectedVersion"],
        properties: {
          expectedVersion: { type: "integer", minimum: 0, description: "The brief version from website_get_desk_state read in this turn." },
        },
      },
      execute: (args) => BriefDesk.page.discard(args),
    };
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
