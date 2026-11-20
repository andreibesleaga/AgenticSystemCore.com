// A write this site shares with other agent sites, such as a booking or an order.
// bridge-actions.js registers it.
//
// A partner's write runs in a window on this site that the visitor sees, not in the
// partner's page. This module shows there what will happen and a form for the visitor's
// own details, with the site's stylesheet. The calling assistant gets back only a
// reference and what was done, never what the visitor typed.
//
// TODO: import the site's business code, the module whose rules the page's own form
// uses. Do not import a module that reads or changes the page when it loads.
import { SiteStore } from "../js/site-store.js";

/**
 * Shares one write, made in one call, with the rules the page's own form uses.
 *
 * The window starts a fresh store, like a fresh page, so it cannot see what the visitor
 * did on the site's page, such as a basket. A site with no server keeps the change only
 * in this window. A real site sends it to its own server in submit.
 */
export class WriteWindow {
  /**
   * The sites allowed to make this write, as exact origins with the port. Never "*".
   * TODO: list only the partner sites that may make it.
   */
  static CALLERS = [
    "https://partner.example",
  ];

  /**
   * The visitor's own details, which the agents never see. TODO: the fields the page's
   * own form asks for, with the store's names.
   */
  static FIELDS = [
    {
      name: "name",
      label: "Name",
      type: "text",
      autocomplete: "name",
      maxLength: 80,
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      autocomplete: "email",
      maxLength: 120,
    },
  ];

  /**
   * TODO: the site's name, for the window's header and title.
   */
  static SITE_NAME = "<Site name>";

  /**
   * TODO: the confirm button's label, which says what it does, such as "Book this trip".
   */
  static CONFIRM_LABEL = "<Confirm>";

  /**
   * Describe the shared write.
   *
   * :return: The action definition.
   */
  static definition() {
    return {
      // TODO: a name the page has no action for, such as book_<thing> or place_order.
      name: "submit_request",
      // Say that a window opens and that the visitor types their own details, so the agent
      // never asks for them, and what comes back.
      description: "TODO: <Make the change> in one call. Call <the read> first and use its ids. A window opens on this site, where the visitor checks it and types their own <details>, so never ask for them. It returns only once the visitor has confirmed or cancelled there: with ok true, it is done and the window has closed. Returns the <reference> and what was done, or ok false with the site's reason, such as the visitor cancelling.",
      // "irreversible" for a change the visitor cannot undo, such as a booking or an order,
      // or "write" for one they can. A partner's write opens this window either way.
      effect: "irreversible",
      availability: "bridge",
      callerOrigins: WriteWindow.CALLERS,
      // The form below shows the change and asks the visitor to confirm or cancel, so the
      // bridge's generic dialog of the raw arguments is not needed.
      confirmsInWindow: true,
      // TODO: only what the agent knows, such as what to book and for how many people.
      // Never names, emails, phone numbers or addresses.
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [
          "itemId",
          "quantity",
        ],
        properties: {
          itemId: {
            type: "string",
            // An enum of real ids stops the model from inventing items.
            enum: SiteStore.itemIds(),
            description: "TODO: Item id from <the read>.",
          },
          quantity: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            description: "TODO: How many.",
          },
        },
      },
      execute: WriteWindow.start,
    };
  }

  /**
   * Check the request with the site's rules, then ask the visitor in this window.
   *
   * :param args: The validated request.
   * :param context: The bridge's call details, with the calling site's origin.
   * :return: A refusal now, or a promise of the result or the visitor's cancel.
   */
  static start(args, context) {
    const store = new SiteStore();
    // A request the site would refuse gets no form, only the site's reason.
    const problem = store.problem(args);
    if (problem) {
      return {
        ok: false,
        reason: problem,
      };
    }
    const state = {
      store: store,
      request: args,
      caller: WriteWindow.hostOf(context?.callerOrigin),
      done: false,
    };
    return new Promise(WriteWindow.showForm.bind(null, state));
  }

  /**
   * Show what will happen and the details form, and wait for the visitor.
   *
   * :param state: The store, the request, the caller and whether the form is done.
   * :param resolve: Resolves the action with its result.
   */
  static showForm(state, resolve) {
    state.resolve = resolve;
    document.title = WriteWindow.SITE_NAME;
    WriteWindow.addStyles();
    const box = WriteWindow.element("main", "");
    box.append(
      WriteWindow.intro(state),
      WriteWindow.summaryCard(state),
      WriteWindow.form(state, box),
    );
    document.body.append(WriteWindow.header(), box);
    state.form.elements[WriteWindow.FIELDS[0].name].focus();
  }

  /**
   * Add the site's stylesheet to the page head.
   */
  static addStyles() {
    // Resolved from this module, so the bridge page's own location does not matter.
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    // TODO: the site's stylesheet, and its icon if it has one.
    sheet.href = new URL("../styles.css", import.meta.url).href;
    document.head.append(sheet);
  }

  /**
   * Make the site's header, with its name, so the visitor sees whose window this is.
   *
   * :return: The header element.
   */
  static header() {
    const header = document.createElement("header");
    header.append(WriteWindow.element("span", WriteWindow.SITE_NAME, "brand"));
    return header;
  }

  /**
   * Say which site asked for this, and where the visitor's details go.
   *
   * :param state: The window's state, with the caller's host.
   * :return: The intro section.
   */
  static intro(state) {
    const intro = WriteWindow.element("section", "", "intro");
    intro.append(
      WriteWindow.element("h1", "TODO: <Book your trip>"),
      WriteWindow.element("p", `The assistant on ${state.caller} asked us to do this for you. Type your details here, not in the chat. When you confirm, its chat gets the reference and what was done, not your details.`),
    );
    return intro;
  }

  /**
   * Show what will happen and what it costs, with the site's own terms.
   *
   * :param state: The window's state, with the store and the request.
   * :return: The summary section.
   */
  static summaryCard(state) {
    const card = WriteWindow.element("section", "", "panel");
    card.setAttribute("aria-label", "What you are confirming");
    // TODO: the lines the page's own form shows before it confirms, such as the item,
    // the date, the price and the cancelling terms, from the store's own methods.
    for (const line of state.store.summaryLines(state.request)) {
      card.append(WriteWindow.element("p", line));
    }
    return card;
  }

  /**
   * Make the details form, with the confirm button and Cancel.
   *
   * :param state: The window's state. The form and its error lines are stored on it.
   * :param box: The window's content, replaced once the visitor confirms or cancels.
   * :return: The form.
   */
  static form(state, box) {
    const form = WriteWindow.element("form", "", "panel");
    form.noValidate = true;
    state.form = form;
    state.messages = {};
    // A problem with the request itself, found when the visitor confirms, shows first.
    state.messages.request = WriteWindow.message("request");
    state.messages.request.setAttribute("role", "alert");
    const fieldset = document.createElement("fieldset");
    fieldset.append(WriteWindow.element("legend", "Your details"));
    for (const field of WriteWindow.FIELDS) {
      fieldset.append(WriteWindow.field(state, field));
    }
    const confirmButton = WriteWindow.element("button", WriteWindow.CONFIRM_LABEL);
    confirmButton.type = "submit";
    const cancelButton = WriteWindow.element("button", "Cancel", "secondary");
    cancelButton.type = "button";
    const actions = WriteWindow.element("div", "", "actions");
    actions.append(confirmButton, cancelButton);
    form.append(state.messages.request, fieldset, actions);
    form.addEventListener("submit", WriteWindow.submit.bind(null, state, box));
    cancelButton.addEventListener("click", WriteWindow.cancel.bind(null, state, box));
    return form;
  }

  /**
   * Make one labelled input with its error line.
   *
   * :param state: The window's state. The field's error line is stored on it.
   * :param field: The field from FIELDS.
   * :return: The field's wrapper.
   */
  static field(state, field) {
    const id = `write-${field.name}`;
    const wrap = WriteWindow.element("div", "", "field");
    const label = WriteWindow.element("label", field.label);
    label.htmlFor = id;
    const input = document.createElement("input");
    input.id = id;
    input.name = field.name;
    input.type = field.type;
    input.autocomplete = field.autocomplete;
    input.maxLength = field.maxLength;
    input.required = true;
    state.messages[field.name] = WriteWindow.message(field.name);
    input.setAttribute("aria-describedby", state.messages[field.name].id);
    wrap.append(label, input, state.messages[field.name]);
    return wrap;
  }

  /**
   * Check the details with the site's rules, and make the change when they pass.
   *
   * :param state: The window's state, with the form, the store and the resolver.
   * :param box: The window's content, replaced once the change is made.
   * :param event: The submit event.
   */
  static submit(state, box, event) {
    event.preventDefault();
    if (state.done) {
      return;
    }
    const details = {};
    for (const field of WriteWindow.FIELDS) {
      details[field.name] = state.form.elements[field.name].value;
    }
    // TODO: the same checks the page's own form runs, as {fieldName: message}. Put a
    // problem with the request itself under "request".
    const errors = state.store.detailErrors(state.request, details);
    WriteWindow.showErrors(state, errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    // TODO: the same call the page's own form makes. A real site sends it to its server.
    const done = state.store.submit(state.request, details);
    state.done = true;
    box.replaceChildren(WriteWindow.confirmation(state, done));
    state.resolve(WriteWindow.result(done));
  }

  /**
   * Show each error under its field, mark the field invalid, and focus the first one.
   *
   * :param state: The window's state, with the form and its error lines.
   * :param errors: The store's errors by field name, empty when all is fine.
   */
  static showErrors(state, errors) {
    let first = null;
    for (const name of Object.keys(state.messages)) {
      const text = errors[name] || "";
      state.messages[name].textContent = text;
      state.messages[name].hidden = !text;
      const input = state.form.elements[name];
      if (input) {
        input.setAttribute("aria-invalid", text ? "true" : "false");
        if (text && !first) {
          first = input;
        }
      }
    }
    first?.focus();
  }

  /**
   * Show the result in this window. TODO: add what the page's own confirmation shows,
   * such as what was done and the details the visitor typed, so they can check them here.
   *
   * :param state: The window's state, with the caller's host.
   * :param done: The store's result, with its reference.
   * :return: The confirmation section.
   */
  static confirmation(state, done) {
    const box = WriteWindow.element("section", "", "confirmation");
    box.append(
      WriteWindow.element("h2", "Done"),
      WriteWindow.element("p", `Your reference is ${done.reference}.`),
      WriteWindow.element("p", `This window closes now. The chat on ${state.caller} shows the reference too.`),
    );
    return box;
  }

  /**
   * End the action without a change, after the visitor clicks Cancel.
   *
   * :param state: The resolver, the caller's host and whether the form is done.
   * :param box: The window's content.
   */
  static cancel(state, box) {
    if (state.done) {
      return;
    }
    state.done = true;
    const notice = WriteWindow.element("section", "", "panel");
    notice.append(
      WriteWindow.element("h2", "Cancelled"),
      WriteWindow.element("p", `Nothing was done. This window closes now, and the chat on ${state.caller} carries on.`),
    );
    box.replaceChildren(notice);
    state.resolve({
      ok: false,
      reason: "The visitor cancelled in this site's window. Nothing was done.",
    });
  }

  /**
   * Describe the result for the calling assistant. It leaves out what the visitor typed:
   * that stays in this site's window.
   *
   * :param done: The store's result.
   * :return: The reference and what was done.
   */
  static result(done) {
    return {
      ok: true,
      // TODO: the reference and what was done, such as the item, the date and the total.
      // Never the visitor's details.
      reference: done.reference,
      summary: done.summary,
      note: "Done. The visitor checked it and typed their details in this site's window, which has now closed.",
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

  /**
   * Make a hidden error line for one field.
   *
   * :param name: The field's name, for the line's id.
   * :return: The element.
   */
  static message(name) {
    const line = WriteWindow.element("p", "", "field-error");
    line.id = `write-${name}-error`;
    line.hidden = true;
    return line;
  }
}
