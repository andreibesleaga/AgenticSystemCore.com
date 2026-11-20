// A write this node shares with the sites its settings name: a proposal to change one card.
// bridge-actions.js registers it; tools/agentify-node.mjs copies this file unchanged.
//
// It follows the agentify-website skill's template for a shared write
// (templates/bridge/write-window.js, cognizant-ai-labs/agentic-web at 0516537, Apache-2.0),
// from which its structure and several functions are adapted. A partner's write runs in a
// window on this site that the visitor sees, not in the partner's page. The window shows
// the passage and the change, and a form for the visitor's own name and reason. The calling
// assistant gets back only a reference and what was done, never what the visitor typed.
//
// This site has no server. The proposal is a text the visitor keeps and sends to the
// node's maintainers, who decide: nothing a visitor or an assistant does here publishes
// anything. The window says so.
import { PassageReader } from "./reader.js";
import { NODE } from "./node.js";

/** Shares one write: a proposal for one card, written with the visitor in this window. */
export class ProposeWindow {
  /** The sites allowed to ask for this write, as exact origins. Never "*". */
  static CALLERS = NODE.callers;

  /** The visitor's own words, which the agents never see. */
  static FIELDS = [
    { name: "name", label: "Your name, as it should stand on the proposal", type: "text", autocomplete: "name", maxLength: 80, minLength: 2 },
    { name: "reason", label: "Your reason or source, in a sentence or a link", type: "text", autocomplete: "off", maxLength: 300, minLength: 5 },
  ];

  static SITE_NAME = NODE.label;
  static CONFIRM_LABEL = "Write the proposal";

  /** The most characters of the passage the window shows. */
  static SHOWN = 600;

  /** The reader of this node's passages, made on first use. */
  static reader = null;

  /**
   * The reader of this node's own published passages.
   *
   * :return: A PassageReader with this node only.
   */
  static node() {
    if (!ProposeWindow.reader) {
      const here = typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : NODE.origin;
      ProposeWindow.reader = new PassageReader({ nodes: [{ id: NODE.name, label: NODE.label, origin: NODE.origin, readFrom: here }] });
    }
    return ProposeWindow.reader;
  }

  /**
   * Describe the shared write.
   *
   * :return: The action definition.
   */
  static definition() {
    return {
      name: "propose_change",
      description: `Write a proposal to change one card of ${NODE.label}, in one call. Call website_search_passages first and use a passage value from its result. A window opens on this site, where the visitor checks the proposal and types their own name and reason, so never ask for them. Returns a reference and what was written, or ok false when the visitor cancels. Nothing is published: the visitor sends the proposal to this site's maintainers, who decide.`,
      // The visitor can simply not send it, so it is a write, not an irreversible one. A
      // partner's write opens this window either way.
      effect: "write",
      availability: "bridge",
      callerOrigins: ProposeWindow.CALLERS,
      // The window shows the change and asks the visitor to confirm or cancel, so the
      // bridge's generic dialog of the raw arguments is not needed.
      confirmsInWindow: true,
      // Only what the agent knows. Never a name or a contact.
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["passage", "change"],
        properties: {
          passage: { type: "string", minLength: 16, maxLength: 16, description: "The passage value of a result of website_search_passages, 16 characters." },
          change: { type: "string", minLength: 10, maxLength: 600, description: "The change, in one or two plain sentences: what is wrong or missing, and what the card should say." },
        },
      },
      execute: ProposeWindow.start,
    };
  }

  /**
   * Read the passage with its checks, then ask the visitor in this window.
   *
   * :param args: The validated request.
   * :param context: The bridge's call details, with the calling site's origin.
   * :return: A refusal now, or a promise of the result or the visitor's cancel.
   */
  static async start(args, context) {
    const passage = await ProposeWindow.node().read({ node: NODE.name, passage: args.passage });
    // A request the site would refuse gets no form, only the site's reason.
    if (!passage.ok) {
      return { ok: false, reason: passage.reason };
    }
    if (!passage.digestMatches) {
      return { ok: false, reason: "That passage does not match the digest this site published for it, so no proposal was written." };
    }
    // The schema counts spaces, so check the change again once its spaces are folded.
    const change = String(args.change).replace(/\s+/g, " ").trim();
    if (change.length < 10) {
      return { ok: false, reason: "The change is too short once its spaces are removed: say in at least 10 characters what should change." };
    }
    const state = {
      passage: passage,
      change: change,
      caller: ProposeWindow.hostOf(context?.callerOrigin),
      inputs: {},
      messages: {},
      done: false,
    };
    return new Promise(ProposeWindow.showForm.bind(null, state));
  }

  /**
   * Show what will be written and the form, and wait for the visitor.
   *
   * :param state: The passage, the change, the caller and whether the form is done.
   * :param resolve: Resolves the action with its result.
   */
  static showForm(state, resolve) {
    state.resolve = resolve;
    document.title = `${ProposeWindow.SITE_NAME}: a proposal`;
    ProposeWindow.addStyles();
    const box = ProposeWindow.element("main", "");
    box.append(ProposeWindow.intro(state), ProposeWindow.summaryCard(state), ProposeWindow.form(state, box));
    document.body.append(ProposeWindow.header(), box);
    state.inputs[ProposeWindow.FIELDS[0].name].focus();
  }

  /** Add this window's stylesheet to the page head. */
  static addStyles() {
    // Resolved from this module, so the bridge page's own location does not matter.
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = new URL("./window.css", import.meta.url).href;
    document.head.append(sheet);
  }

  /**
   * Make the site's header, with its name, so the visitor sees whose window this is.
   *
   * :return: The header element.
   */
  static header() {
    const header = document.createElement("header");
    header.append(ProposeWindow.element("span", ProposeWindow.SITE_NAME, "brand"), ProposeWindow.element("span", new URL(NODE.origin).host, "host"));
    return header;
  }

  /**
   * Say which site asked for this, and what happens to what the visitor types.
   *
   * :param state: The window's state, with the caller's host.
   * :return: The intro section.
   */
  static intro(state) {
    const intro = ProposeWindow.element("section", "", "intro");
    intro.append(
      ProposeWindow.element("h1", "Propose a change to this card"),
      ProposeWindow.element("p", `The assistant on ${state.caller} asked us to write this proposal for you. Type your name and your reason here, not in the chat. When you finish, its chat gets a reference and what was written, not what you typed.`),
      ProposeWindow.element("p", "This site has no server and nothing is published from this window. You get the proposal as a text; you send it to the maintainers, and a person decides."),
    );
    return intro;
  }

  /**
   * Show the passage and the change, as the proposal will state them.
   *
   * :param state: The window's state, with the passage and the change.
   * :return: The summary section.
   */
  static summaryCard(state) {
    const card = ProposeWindow.element("section", "", "panel");
    card.setAttribute("aria-label", "What the proposal says");
    const passage = state.passage;
    const shown = passage.text.length > ProposeWindow.SHOWN ? `${passage.text.slice(0, ProposeWindow.SHOWN)}…` : passage.text;
    card.append(
      ProposeWindow.element("h2", passage.section ? `${passage.title}, ${passage.section}` : passage.title),
      ProposeWindow.element("p", passage.address, "address"),
      ProposeWindow.element("p", "The passage as published now (its digest matched):", "label"),
      ProposeWindow.element("blockquote", shown),
      ProposeWindow.element("p", "The change asked for:", "label"),
      ProposeWindow.element("p", state.change, "change"),
    );
    return card;
  }

  /**
   * Make the form, with the confirm button and Cancel.
   *
   * :param state: The window's state. The inputs and their error lines are stored on it.
   * :param box: The window's content, replaced once the visitor confirms or cancels.
   * :return: The form.
   */
  static form(state, box) {
    const form = ProposeWindow.element("form", "", "panel");
    form.noValidate = true;
    const fieldset = document.createElement("fieldset");
    fieldset.append(ProposeWindow.element("legend", "Your part"));
    for (const field of ProposeWindow.FIELDS) {
      fieldset.append(ProposeWindow.field(state, field));
    }
    const confirmButton = ProposeWindow.element("button", ProposeWindow.CONFIRM_LABEL);
    confirmButton.type = "submit";
    const cancelButton = ProposeWindow.element("button", "Cancel", "secondary");
    cancelButton.type = "button";
    const actions = ProposeWindow.element("div", "", "actions");
    actions.append(confirmButton, cancelButton);
    form.append(fieldset, actions);
    form.addEventListener("submit", ProposeWindow.submit.bind(null, state, box));
    cancelButton.addEventListener("click", ProposeWindow.cancel.bind(null, state, box));
    return form;
  }

  /**
   * Make one labelled input with its error line.
   *
   * :param state: The window's state.
   * :param field: The field from FIELDS.
   * :return: The field's wrapper.
   */
  static field(state, field) {
    const id = `propose-${field.name}`;
    const wrap = ProposeWindow.element("div", "", "field");
    const label = ProposeWindow.element("label", field.label);
    label.htmlFor = id;
    const input = document.createElement("input");
    input.id = id;
    input.name = field.name;
    input.type = field.type;
    input.autocomplete = field.autocomplete;
    input.maxLength = field.maxLength;
    input.required = true;
    const message = ProposeWindow.element("p", "", "field-error");
    message.id = `${id}-error`;
    message.hidden = true;
    input.setAttribute("aria-describedby", message.id);
    state.inputs[field.name] = input;
    state.messages[field.name] = message;
    wrap.append(label, input, message);
    return wrap;
  }

  /**
   * What is wrong with what the visitor typed, by field.
   *
   * :param details: The typed values by field name.
   * :return: {fieldName: message}, empty when all is fine.
   */
  static detailErrors(details) {
    const errors = {};
    for (const field of ProposeWindow.FIELDS) {
      const value = String(details[field.name] || "").replace(/\s+/g, " ").trim();
      if (value.length < field.minLength) {
        errors[field.name] = `Type at least ${field.minLength} characters.`;
      } else if (value.length > field.maxLength) {
        errors[field.name] = `Keep it to ${field.maxLength} characters.`;
      }
    }
    return errors;
  }

  /**
   * The proposal as plain text, in the order a maintainer reads it.
   *
   * :param state: The passage, the change and the caller.
   * :param details: The visitor's name and reason.
   * :param date: The day, as YYYY-MM-DD.
   * :return: The text.
   */
  static proposalText(state, details, date) {
    const clean = (value) => String(value).replace(/\s+/g, " ").trim();
    const passage = state.passage;
    return [
      `Proposal for ${NODE.label}`,
      "",
      `Card: ${passage.section ? `${passage.title}, section "${passage.section}"` : passage.title}`,
      `Passage: ${passage.address}`,
      `Digest of the passage when this was written: sha-256 ${passage.digest}`,
      "",
      `Change asked for: ${state.change}`,
      `Reason or source: ${clean(details.reason)}`,
      "",
      `Proposed by: ${clean(details.name)}`,
      `Written on ${date} in a window of ${new URL(NODE.origin).host}, at the request of the assistant on ${state.caller}.`,
      "Nothing is published by this text. A maintainer reads it and decides.",
      "",
    ].join("\n");
  }

  /**
   * Check the visitor's part, write the proposal, and show it with what to do next.
   *
   * :param state: The window's state.
   * :param box: The window's content.
   * :param event: The submit event.
   */
  static async submit(state, box, event) {
    event.preventDefault();
    if (state.done) {
      return;
    }
    const details = {};
    for (const field of ProposeWindow.FIELDS) {
      details[field.name] = state.inputs[field.name].value;
    }
    const errors = ProposeWindow.detailErrors(details);
    ProposeWindow.showErrors(state, errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    state.done = true;
    const text = ProposeWindow.proposalText(state, details, new Date().toISOString().slice(0, 10));
    // A random reference: a hash of the text would let the caller test guesses of what the
    // visitor typed.
    const reference = `P-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const done = {
      reference: reference,
      text: `${text}Reference: ${reference}\n`,
      summary: `A proposal to change "${state.passage.title}" on ${NODE.label} was written in the visitor's browser. It is not published: the visitor sends it to the maintainers, who decide.`,
    };
    box.replaceChildren(ProposeWindow.confirmation(state, done));
  }

  /**
   * Show each error under its field, mark the field invalid, and focus the first one.
   *
   * :param state: The window's state, with the inputs and their error lines.
   * :param errors: The errors by field name, empty when all is fine.
   */
  static showErrors(state, errors) {
    let first = null;
    for (const name of Object.keys(state.messages)) {
      const text = errors[name] || "";
      state.messages[name].textContent = text;
      state.messages[name].hidden = !text;
      state.inputs[name].setAttribute("aria-invalid", text ? "true" : "false");
      if (text && !first) {
        first = state.inputs[name];
      }
    }
    first?.focus();
  }

  /**
   * Show the proposal, how to keep it and where to send it. The action ends, and the
   * window closes, when the visitor presses the last button: the calling chat closes this
   * window as soon as it has the result.
   *
   * :param state: The window's state, with the caller's host and the resolver.
   * :param done: The reference, the proposal text and the summary.
   * :return: The confirmation section.
   */
  static confirmation(state, done) {
    const box = ProposeWindow.element("section", "", "confirmation");
    const text = document.createElement("textarea");
    text.readOnly = true;
    text.rows = 14;
    text.value = done.text;
    text.setAttribute("aria-label", "The proposal");
    const copied = ProposeWindow.element("p", "", "note");
    copied.setAttribute("role", "status");
    const copyButton = ProposeWindow.element("button", "Copy the proposal", "secondary");
    copyButton.type = "button";
    copyButton.addEventListener("click", ProposeWindow.copy.bind(null, text, copied));
    const finishButton = ProposeWindow.element("button", `Finish and return to ${state.caller}`);
    finishButton.type = "button";
    finishButton.addEventListener("click", ProposeWindow.finish.bind(null, state, done));
    const actions = ProposeWindow.element("div", "", "actions");
    actions.append(copyButton, finishButton);
    box.append(
      ProposeWindow.element("h2", "Your proposal is written"),
      ProposeWindow.element("p", `Its reference is ${done.reference}. Copy it or send it now, then press Finish: the assistant waits about three minutes for this window. It closes when you finish, and this site keeps no copy.`),
      text,
      copied,
    );
    if (NODE.proposals) {
      const prefilled = ProposeWindow.issueLink(NODE.proposals, `Proposal ${done.reference}: ${state.passage.title}`, text.value);
      const where = ProposeWindow.element("p", "To send it, open ", "note");
      const link = ProposeWindow.element("a", prefilled === NODE.proposals ? "the page where this site's maintainers take proposals" : "a new issue for this site's maintainers, already filled in");
      link.href = prefilled;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      where.append(link, document.createTextNode(prefilled === NODE.proposals ? " (a new tab) and paste the text there." : " (a new tab), check it and submit it there."));
      box.append(where);
    }
    box.append(actions);
    return box;
  }

  /**
   * The maintainers' page with the proposal filled in, when it is a GitHub "new issue" page;
   * otherwise the page as it is. GitHub takes the title and body from the address.
   *
   * :param page: The maintainers' page (--proposals).
   * :param title: The issue title.
   * :param body: The proposal text.
   * :return: The address to open.
   */
  static issueLink(page, title, body) {
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/new$/.test(page)) {
      return page;
    }
    const link = `${page}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    // Long addresses fail in some browsers; the visitor then pastes the copied text.
    return link.length <= 7000 ? link : page;
  }

  /**
   * Copy the proposal to the clipboard, or say how to do it by hand.
   *
   * :param text: The textarea that holds the proposal.
   * :param note: The status line.
   */
  static async copy(text, note) {
    try {
      await navigator.clipboard.writeText(text.value);
      note.textContent = "Copied.";
    } catch (error) {
      text.focus();
      text.select();
      note.textContent = "The browser did not allow copying. The text is selected: copy it by hand.";
    }
  }

  /**
   * End the action with its result. The calling chat then closes this window.
   *
   * :param state: The window's state, with the resolver.
   * :param done: The reference and the summary.
   */
  static finish(state, done) {
    state.resolve(ProposeWindow.result(done));
  }

  /**
   * End the action without a proposal, after the visitor clicks Cancel.
   *
   * :param state: The resolver, the caller's host and whether the form is done.
   * :param box: The window's content.
   */
  static cancel(state, box) {
    if (state.done) {
      return;
    }
    state.done = true;
    const notice = ProposeWindow.element("section", "", "panel");
    notice.append(
      ProposeWindow.element("h2", "Cancelled"),
      ProposeWindow.element("p", `Nothing was written. This window closes now, and the chat on ${state.caller} carries on.`),
    );
    box.replaceChildren(notice);
    state.resolve({ ok: false, reason: "The visitor cancelled in this site's window. Nothing was written." });
  }

  /**
   * Describe the result for the calling assistant. It leaves out what the visitor typed.
   *
   * :param done: The reference and the summary.
   * :return: The reference and what was done.
   */
  static result(done) {
    return {
      ok: true,
      reference: done.reference,
      summary: done.summary,
      note: "Done. The visitor checked the proposal and typed their part in this site's window, which has now closed. The visitor holds the text and decides whether to send it.",
    };
  }

  /**
   * Give the host of the calling site, for the window's text.
   *
   * :param origin: The caller's origin from the bridge, if any.
   * :return: The host, or "another site" when the origin is missing or not a URL.
   */
  static hostOf(origin) {
    try {
      return new URL(origin).host;
    } catch {
      return "another site";
    }
  }

  /**
   * Make an element with text and an optional class.
   *
   * :param tag: The tag name.
   * :param text: The text.
   * :param className: The class, or "" for none.
   * :return: The element.
   */
  static element(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) {
      element.className = className;
    }
    return element;
  }
}
