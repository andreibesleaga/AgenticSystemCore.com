// A scripted model router for the linking checks. It makes no model call.
//
// The Node tests call respond() from their stub fetch. The Chrome check calls listen(), and
// the visitor's settings point at http://127.0.0.1:<port>/v1.
import { once } from "node:events";
import http from "node:http";

/**
 * Answers chat requests from a short script, so a call between two sites runs the same way
 * every time, whatever the sites' instructions say.
 *
 * A request comes from the partner when its last user message is the scripted request,
 * because that is all a partner network receives. The partner answers "PARTNER_ANSWER:" with
 * the website_* tools it was offered and whether its prompt holds the runtime's no-actions
 * note. When read() names one of those tools, the partner first calls it once with the
 * given arguments, then answers with its result. When nest() sets a second request, a
 * partner that is offered a partner tool first calls it once with that request, and the
 * second partner answers "NESTED_ANSWER:". Any other request comes from the visitor's site. It calls the partner
 * tool, whose description starts with "Hand off to the" (runtime/runner.js,
 * buildToolTable), until it has the scripted number of tool results. Then it answers
 * "CALLER_FINAL:" with the text of the last result. A site with several partners gets
 * several such tools, so aim() names the one each side calls; without it, each calls the
 * first one offered.
 *
 * It records each request with flags and names only, never the key.
 */
export class MockRouter {
  /**
   * The start of a partner tool's description, as the runtime writes it.
   */
  static HANDOFF = "Hand off to the ";

  /**
   * The start of a website action tool's name (runtime/runner.js, buildToolTable).
   */
  static WEBSITE_TOOL = "website_";

  /**
   * The note the runtime adds for a network with no actions (runtime/actions.js, actionContext).
   */
  static NO_ACTIONS_NOTE = "No browser actions are registered for this network";

  /**
   * The models GET /v1/models lists. The page's settings refuse a model that is not listed.
   */
  static MODELS = [
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o-mini",
    "gpt-5.2",
  ];

  /**
   * Set up the script.
   *
   * :param key: The fake key the visitor's site should send.
   * :param request: The request the visitor's site sends to the partner.
   * :param handoffs: How many partner calls the visitor's site makes before it answers.
   * :param delayMs: How long each HTTP answer waits, as a real provider takes some time.
   */
  constructor(key, request, handoffs, delayMs) {
    this.key = key;
    this.request = request;
    this.handoffs = handoffs;
    this.delayMs = delayMs;
    // One entry per request, in arrival order.
    this.records = [];
    this.toolCalls = 0;
    this.server = null;
    this.nestedRequest = null;
    // The partner tool each side calls, or null for the first one offered.
    this.callerTool = null;
    this.onwardTool = null;
    // The website tool the partner reads first, with its arguments, or null for none.
    this.partnerRead = null;
    // Texts no model request may hold, such as details a visitor types in a partner's window.
    this.watched = [];
  }

  /**
   * Flag every chat request that holds one of these texts from now on.
   *
   * :param texts: The texts, or an empty list to stop.
   */
  watch(texts) {
    this.watched = texts;
  }

  /**
   * Make the partner call one of its website tools once before it answers.
   *
   * :param tool: The tool name, such as "website_find_departures", or null for none.
   * :param args: The arguments to call it with.
   */
  read(tool, args) {
    this.partnerRead = tool === null ? null : {
      tool: tool,
      args: args,
    };
  }

  /**
   * Name the partner tool the visitor's site calls, and the one the partner calls on a
   * second hop. A side that is not offered its named tool calls none.
   *
   * :param callerTool: The tool name for the visitor's site, or null for the first offered.
   * :param onwardTool: The tool name for the partner's second hop, or null for the first offered.
   */
  aim(callerTool, onwardTool) {
    this.callerTool = callerTool;
    this.onwardTool = onwardTool;
  }

  /**
   * Make the partner ask its own partner once, with this request, before it answers.
   *
   * :param request: The request the partner sends on, or null for no second hop.
   */
  nest(request) {
    this.nestedRequest = request;
  }

  /**
   * Change the script between turns of one run.
   *
   * :param request: The request the visitor's site sends to the partner.
   * :param handoffs: How many partner calls the visitor's site makes before it answers.
   */
  use(request, handoffs) {
    this.request = request;
    this.handoffs = handoffs;
  }

  /**
   * Answer one request.
   *
   * :param method: The HTTP method.
   * :param path: The URL path, such as "/v1/chat/completions".
   * :param headers: The request headers, with lower-case names.
   * :param body: The request body as text.
   * :return: The answer, with status, type and body.
   */
  respond(method, path, headers, body) {
    const authorization = typeof headers.authorization === "string" ? headers.authorization : null;
    const record = {
      time: Date.now(),
      method: method,
      path: path,
      origin: headers.origin || null,
      authorization: authorization !== null,
      // A flag only: the key itself is never stored.
      keyOk: authorization === `Bearer ${this.key}`,
    };
    this.records.push(record);
    if (method === "OPTIONS") {
      return MockRouter.answer(204, "text/plain", "");
    }
    if (method === "GET" && path === "/v1/models") {
      record.kind = "models";
      return MockRouter.answer(200, "application/json", JSON.stringify(MockRouter.modelList()));
    }
    if (method === "POST" && path === "/v1/chat/completions") {
      record.kind = "chat";
      return this.chat(record, body);
    }
    // The runtime asks for /agent-manifest.json to see whether a saved router is another
    // site's published mock. This router publishes none.
    record.kind = "other";
    return MockRouter.answer(404, "text/plain", "Not found");
  }

  /**
   * Answer one chat request from the script and add what it holds to its record.
   *
   * :param record: The request's record.
   * :param body: The request body as text.
   * :return: The answer: a streamed reply, or 400 for a body that is not JSON.
   */
  chat(record, body) {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      return MockRouter.answer(400, "text/plain", "The body is not JSON.");
    }
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
    const system = messages.length && typeof messages[0].content === "string" ? messages[0].content : "";
    const roles = [];
    const results = [];
    let lastUser = null;
    for (const message of messages) {
      roles.push(message.role);
      if (message.role === "user") {
        lastUser = message.content;
      } else if (message.role === "tool") {
        results.push(String(message.content));
      }
    }
    const toolNames = [];
    for (const tool of tools) {
      toolNames.push(String((tool.function || {}).name));
    }
    record.model = parsed.model;
    record.watchedSeen = [];
    for (const text of this.watched) {
      if (body.includes(text)) {
        record.watchedSeen.push(text);
      }
    }
    record.role = "caller";
    if (lastUser === this.request) {
      record.role = "partner";
    } else if (this.nestedRequest !== null && lastUser === this.nestedRequest) {
      record.role = "nested";
    }
    record.firstLine = system.split("\n")[0].slice(0, 160);
    record.roles = roles;
    record.tools = toolNames;
    record.websiteTools = [];
    for (const name of toolNames) {
      if (name.startsWith(MockRouter.WEBSITE_TOOL)) {
        record.websiteTools.push(name);
      }
    }
    record.noActionsNote = system.includes(MockRouter.NO_ACTIONS_NOTE);
    record.toolResults = [];
    for (const result of results) {
      record.toolResults.push(result.slice(0, 400));
    }
    // In full, so a check can read what a partner's website tool returned.
    record.lastToolResult = results.length ? results[results.length - 1] : null;
    record.reply = this.decide(record.role, tools, results, record);
    return MockRouter.answer(200, "text/event-stream", this.stream(parsed.model, record.reply));
  }

  /**
   * Choose the scripted reply.
   *
   * :param role: "caller", "partner" or "nested".
   * :param tools: The tools the request offers.
   * :param results: The tool results in the request, in order.
   * :param record: The request's record, which gets the partner's answer flags.
   * :return: {tool, request} for a tool call, or {text} for an answer.
   */
  decide(role, tools, results, record) {
    const flags = MockRouter.flags(record);
    if (role === "nested") {
      return {text: `NESTED_ANSWER: ${flags}`};
    }
    if (role === "partner" && this.partnerRead !== null && record.websiteTools.includes(this.partnerRead.tool)) {
      if (results.length === 0) {
        return {
          tool: this.partnerRead.tool,
          args: this.partnerRead.args,
        };
      }
      return {text: `PARTNER_ANSWER: ${this.partnerRead.tool} said ${MockRouter.resultSummary(results[results.length - 1])}`};
    }
    if (role === "partner") {
      const onward = this.nestedRequest === null ? null : MockRouter.handoffTool(tools, this.onwardTool);
      if (onward !== null && results.length === 0) {
        return {
          tool: onward,
          request: this.nestedRequest,
        };
      }
      if (onward !== null) {
        return {text: `PARTNER_ANSWER: ${MockRouter.partnerText(results[results.length - 1])}`};
      }
      return {text: `PARTNER_ANSWER: ${flags}`};
    }
    const handoff = MockRouter.handoffTool(tools, this.callerTool);
    if (handoff !== null && results.length < this.handoffs) {
      return {
        tool: handoff,
        request: this.request,
      };
    }
    if (results.length) {
      return {
        text: `CALLER_FINAL: ${MockRouter.partnerText(results[results.length - 1])}`,
      };
    }
    return {
      text: "CALLER_FINAL: no partner tool was offered.",
    };
  }

  /**
   * Say what a partner's prompt held: the website tools it was offered, and whether the
   * runtime added its no-actions note.
   *
   * :param record: The request's record.
   * :return: The flags, such as "website tools none; no-actions note no.".
   */
  static flags(record) {
    const tools = record.websiteTools.length ? record.websiteTools.join(", ") : "none";
    return `website tools ${tools}; no-actions note ${record.noActionsNote ? "yes" : "no"}.`;
  }

  /**
   * Sum up a website tool's result: the receipt's status, the result's keys and, when the
   * site refused, its reason.
   *
   * :param content: The tool result, a receipt as JSON, or plain text.
   * :return: The summary, such as "status succeeded; result keys ok,departures".
   */
  static resultSummary(content) {
    let receipt = null;
    try {
      receipt = JSON.parse(content);
    } catch (error) {
      return String(content).slice(0, 200);
    }
    if (receipt === null || typeof receipt !== "object" || typeof receipt.status !== "string") {
      return String(content).slice(0, 200);
    }
    const result = receipt.result !== null && typeof receipt.result === "object" ? receipt.result : {};
    const parts = [
      `status ${receipt.status}`,
      `result keys ${Object.keys(result).join(",")}`,
    ];
    if (result.ok === false) {
      parts.push(`reason ${result.reason}`);
    }
    return parts.join("; ");
  }

  /**
   * Find a partner tool a request offers: the one named, or else the first.
   *
   * :param tools: The tools the request offers.
   * :param name: The tool name to find, or null for the first partner tool.
   * :return: The tool's name, or null when the request offers no such tool.
   */
  static handoffTool(tools, name) {
    for (const tool of tools) {
      const fn = tool.function || {};
      if (String(fn.description || "").startsWith(MockRouter.HANDOFF) && (name === null || fn.name === name)) {
        return fn.name;
      }
    }
    return null;
  }

  /**
   * Take the text out of a partner tool result.
   *
   * :param content: The tool result: {"cruse": 1, "text": ...} for an answer, or plain text.
   * :return: The text.
   */
  static partnerText(content) {
    try {
      const parsed = JSON.parse(content);
      if (parsed !== null && typeof parsed.text === "string") {
        return parsed.text;
      }
    } catch (error) {
      // A plain-text result, such as a decline, a skip or an error.
    }
    return content;
  }

  /**
   * Write a reply as a chat-completions event stream, the form runtime/llm.js reads.
   *
   * :param model: The model the request named, echoed back.
   * :param reply: {tool, request} for a partner tool, {tool, args} for a website tool, or {text}.
   * :return: The stream's text.
   */
  stream(model, reply) {
    let delta = null;
    if (reply.tool) {
      this.toolCalls += 1;
      const args = reply.args === undefined ? {request: reply.request} : reply.args;
      delta = {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: `call_mock_${this.toolCalls}`,
            type: "function",
            function: {
              name: reply.tool,
              arguments: JSON.stringify(args),
            },
          },
        ],
      };
    } else {
      delta = {
        role: "assistant",
        content: reply.text,
      };
    }
    const chunk = {
      id: "chatcmpl-mock",
      object: "chat.completion.chunk",
      model: model,
      choices: [
        {
          index: 0,
          delta: delta,
          finish_reason: reply.tool ? "tool_calls" : "stop",
        },
      ],
    };
    const usage = {
      id: "chatcmpl-mock",
      object: "chat.completion.chunk",
      model: model,
      choices: [],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
    return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(usage)}\n\ndata: [DONE]\n\n`;
  }

  /**
   * Build the GET /v1/models body.
   *
   * :return: An OpenAI-style model list.
   */
  static modelList() {
    const data = [];
    for (const id of MockRouter.MODELS) {
      data.push({
        id: id,
        object: "model",
      });
    }
    return {
      object: "list",
      data: data,
    };
  }

  /**
   * Build one answer.
   *
   * :param status: The HTTP status.
   * :param type: The content type.
   * :param body: The body text.
   * :return: The answer.
   */
  static answer(status, type, body) {
    return {
      status: status,
      type: type,
      body: body,
    };
  }

  /**
   * The chat requests the partner made.
   *
   * :return: Their records, in order.
   */
  partnerChats() {
    return this.chats("partner");
  }

  /**
   * The chat requests the visitor's site made.
   *
   * :return: Their records, in order.
   */
  callerChats() {
    return this.chats("caller");
  }

  /**
   * The chat requests the partner's own partner made, on a second hop.
   *
   * :return: Their records, in order.
   */
  nestedChats() {
    return this.chats("nested");
  }

  /**
   * The chat requests from one side.
   *
   * :param role: "caller", "partner" or "nested".
   * :return: Their records, in order.
   */
  chats(role) {
    const found = [];
    for (const record of this.records) {
      if (record.kind === "chat" && record.role === role) {
        found.push(record);
      }
    }
    return found;
  }

  /**
   * Listen on 127.0.0.1 for the Chrome check.
   *
   * :param port: The port, or 0 for any free port.
   * :return: The port the router listens on.
   * :raises Error: When the port is taken.
   */
  async listen(port) {
    this.server = http.createServer(this.handle.bind(this));
    this.server.listen(port, "127.0.0.1");
    // once() rejects when the server emits "error" first, such as for a port in use.
    await once(this.server, "listening");
    return this.server.address().port;
  }

  /**
   * Stop listening and close open connections.
   */
  async close() {
    if (this.server === null) {
      return;
    }
    const closed = once(this.server, "close");
    this.server.close();
    this.server.closeAllConnections();
    await closed;
    this.server = null;
  }

  /**
   * Answer one HTTP request, with CORS for any origin.
   *
   * :param request: The incoming request.
   * :param response: The response to write.
   */
  async handle(request, response) {
    let answer = null;
    try {
      const body = await MockRouter.readBody(request);
      await MockRouter.sleep(this.delayMs);
      answer = this.respond(request.method, new URL(request.url, "http://127.0.0.1").pathname, request.headers, body);
    } catch (error) {
      answer = MockRouter.answer(500, "text/plain", String(error.message || error));
    }
    response.writeHead(answer.status, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Cache-Control": "no-store",
      "Content-Type": answer.type,
    });
    response.end(answer.body);
  }

  /**
   * Read a request body as text.
   *
   * :param request: The incoming request.
   * :return: The body text.
   */
  static async readBody(request) {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  /**
   * Wait for a while.
   *
   * :param ms: Milliseconds.
   * :return: A promise that resolves after ms.
   */
  static sleep(ms) {
    return new Promise(MockRouter.delay.bind(null, ms));
  }

  /**
   * Resolve after ms milliseconds.
   *
   * :param ms: Milliseconds.
   * :param resolve: The promise's resolve function.
   */
  static delay(ms, resolve) {
    setTimeout(resolve, ms);
  }
}
