// The actions this site shares with other agent sites, through its action bridge.
// The build names this file in bridge/agent-manifest.json. When another site's assistant
// calls this site, the bridge loads it in a hidden frame on this site's origin, which has
// no page. Only the names in the manifest's "actions.agentTools" reach a partner's agents.
//
// TODO: import the site's data and business code, the modules the page script uses. Do
// not import a module that reads or changes the page when it loads: the frame has none.
import { SiteData } from "../js/site-data.js";
// TODO: keep this import only if the site shares a write ("Share writes" in linking.md).
import { WriteWindow } from "./write-window.js";

/**
 * Shares this site's reads, and any write, with the partner sites that call its network.
 *
 * A partner's agent calls them from the partner's page. Each read runs here, in a hidden
 * frame on this site's origin, with this site's own code. A write runs in a window on this
 * site, where the visitor checks it (write-window.js). Nothing here can see the page or
 * what one visitor did on it, such as a basket.
 */
class BridgeActions {
  /**
   * The sites allowed to call these reads, as exact origins with the port.
   * TODO: list the sites that call this one. "*" shares a read with every site on the web:
   * use it only for facts the public page already shows, such as times, prices or a menu.
   */
  static CALLERS = [
    "https://partner.example",
  ];

  /**
   * The site's page, for facts that only its HTML holds.
   */
  static PAGE = new URL("../index.html", import.meta.url).href;

  /**
   * Register the shared reads, and the write if the site shares one.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(BridgeActions.readStateAction());
    // TODO: for a read that needs the site's rules, such as what is free on a date, add an
    // action that runs the site's own class on a fresh store, as a fresh page would, and
    // calls the method the page's own action calls. A site with a server reads it there.
    // TODO: delete this line if the site shares no write.
    actions.register(WriteWindow.definition());
  }

  /**
   * Describe the shared read of the site's data and the page's facts.
   *
   * :return: The action definition.
   */
  static readStateAction() {
    return {
      // The page's own action has the same name and input, so the network's instructions
      // fit both.
      name: "get_site_state",
      description: "TODO: the page's get_site_state description, without what the bridge cannot read, such as the <cart>. Read the <catalog>, <prices>, <opening hours> and the page's facts, such as contact details, with links. Changes nothing. Call it before answering about <catalog or prices>.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: BridgeActions.readState,
    };
  }

  /**
   * Read the site's data, and the facts that only the page's HTML holds.
   *
   * :return: A promise of the data and the page's facts.
   */
  static async readState() {
    const page = await BridgeActions.readPage(BridgeActions.PAGE);
    return {
      // TODO: the site's own data, as the page's get_site_state returns it.
      catalog: SiteData.CATALOG,
      // TODO: the page's facts, read from its HTML as the page's own read action does.
      contact: page.querySelector("#contact")?.textContent.trim() || "",
    };
  }

  /**
   * Fetch one of the site's pages and parse it, so its facts can be read as on the page.
   *
   * :param url: The page's address.
   * :return: A promise of the parsed document, with links resolved against the page.
   * :raises Error: When there is no DOMParser, or the page cannot be read.
   */
  static async readPage(url) {
    // Check first: Node has fetch but no DOMParser, so a test never sends a real request.
    if (typeof DOMParser === "undefined") {
      throw new Error("Reading the site's page needs a browser.");
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`The site's page answered ${response.status}.`);
    }
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    // A parsed page resolves links against this frame's address. A base element makes
    // them resolve against the page's own address, as they do on the page.
    const base = page.createElement("base");
    base.href = url;
    page.head.prepend(base);
    return page;
  }
}

// The bridge calls the module's registerActions export.
export const registerActions = BridgeActions.registerActions;
