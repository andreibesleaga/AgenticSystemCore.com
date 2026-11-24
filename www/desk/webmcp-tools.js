// Offers the Brief Desk's own actions as WebMCP tools, so that an assistant in the browser
// (a WebMCP extension such as WebAIAssist, or the browser's own) can search, cite and check
// here with the same rules as the page's buttons and the page's agents. Load it with:
//   <script type="module" src="/desk/webmcp-tools.js"></script>
//
// The tools are the eight site actions of site-actions.js, under the prefix "desk_", so
// they do not clash with the node tools the engine's WebMCP script registers on the same page.
// Nothing here is a second implementation: each tool calls the action's own execute().
// The three actions that change the brief (add a card, remove a card, discard the brief)
// open this page's own confirmation dialog first, the one the page's agents get, whatever
// the calling assistant has already asked. With no WebMCP in the browser, nothing is
// registered and the page works as before.
import { registerActions } from "./site-actions.js";
import { validateData } from "./runtime/actions.js";

/**
 * Registers the Brief Desk's actions with WebMCP and runs them.
 */
export class DeskWebMcp {
  /** The prefix of every tool name. */
  static PREFIX = "desk_";

  /** What the page records about the registration, for tests and for a look in the console. */
  static state = { registered: [], rejected: [], transport: "webmcp" };

  /**
   * The site actions, as definitions: name, description, effect, inputSchema, execute.
   *
   * :return: The list, in the order site-actions.js registers them.
   */
  static definitions() {
    const list = [];
    registerActions({ register: (definition) => list.push(definition) });
    return list;
  }

  /**
   * The tool description for WebMCP: the action's own, with the runtime's tool names
   * (website_<name>) changed to this transport's (desk_<name>).
   *
   * :param description: The action's description.
   * :return: The description for WebMCP.
   */
  static describe(description) {
    return description.replaceAll("website_", DeskWebMcp.PREFIX);
  }

  /**
   * The WebMCP hints of an action: read-only for a read; text from a knowledge node is
   * content the page did not write.
   *
   * :param definition: The action's definition.
   * :return: The annotations.
   */
  static annotations(definition) {
    return { readOnlyHint: definition.effect === "read", untrustedContentHint: definition.effect === "read" };
  }

  /**
   * Run one action for a WebMCP caller: check the arguments against the action's schema,
   * ask the visitor in the page's own dialog for an action that changes the brief, then run it.
   *
   * :param definition: The action's definition.
   * :param args: The caller's arguments.
   * :param confirm: Asks the visitor; receives the review item, returns true when confirmed.
   * :return: The action's result, or {ok: false, reason} when it did not run.
   */
  static async run(definition, args, confirm) {
    const input = args === undefined || args === null ? {} : args;
    try {
      validateData(definition.inputSchema, input);
    } catch (error) {
      return { ok: false, reason: `Nothing ran: ${error.message}` };
    }
    if (definition.effect !== "read") {
      let confirmed = false;
      try {
        confirmed = await confirm({ action: definition.name, arguments: input, origin: new URL(document.URL).origin, effect: definition.effect });
      } catch (error) {
        // The page's own check refused it before any dialog (a passage that fails its
        // digest, a ninth card, a stale brief version): the reason is the page's.
        return { ok: false, reason: error.message };
      }
      if (!confirmed) return { ok: false, reason: "Nothing ran: the visitor did not confirm it on the page." };
    }
    return definition.execute(input);
  }

  /**
   * Ask the visitor with the page's own dialog. site.js is already loaded by the page; it
   * is imported here only when a change needs the dialog, so this module never waits for
   * the assistant to boot.
   *
   * :param item: The review item: action, arguments, origin, effect.
   * :return: True when the visitor confirms.
   */
  static async pageDialog(item) {
    const { AssistantMount } = await import("./site.js");
    return AssistantMount.review([item]);
  }

  /**
   * Register every action as a tool with the browser's WebMCP interface.
   *
   * :param context: document.modelContext, or navigator.modelContext when that is all there is.
   * :param confirm: The confirmation function; the page's dialog by default.
   * :return: The state.
   */
  static register(context, confirm = DeskWebMcp.pageDialog) {
    if (!context || typeof context.registerTool !== "function") return DeskWebMcp.state;
    for (const definition of DeskWebMcp.definitions()) {
      const name = DeskWebMcp.PREFIX + definition.name;
      const tool = {
        name,
        description: DeskWebMcp.describe(definition.description),
        inputSchema: definition.inputSchema,
        annotations: DeskWebMcp.annotations(definition),
        execute: (args) => DeskWebMcp.run(definition, args, confirm),
      };
      // The browser may refuse one registration (by throwing, or with a rejected promise):
      // that tool is then missing, and the others and the page go on working.
      let result;
      try {
        result = context.registerTool(tool);
      } catch {
        DeskWebMcp.state.rejected.push(name);
        continue;
      }
      if (result && typeof result.then === "function") {
        result.then(() => DeskWebMcp.state.registered.push(name), () => DeskWebMcp.state.rejected.push(name));
      } else {
        DeskWebMcp.state.registered.push(name);
      }
    }
    return DeskWebMcp.state;
  }
}

// Register in a browser page that has the Brief Desk; Node tests import the class.
if (typeof document !== "undefined" && typeof document.getElementById === "function" && document.getElementById("desk-search-form")) {
  globalThis.BRIEF_DESK_WEBMCP = DeskWebMcp.state;
  DeskWebMcp.register(document.modelContext || (typeof navigator !== "undefined" ? navigator.modelContext : null));
}
