#!/usr/bin/env node
// Checks the Brief Desk page in a real browser, under the response headers the site sends,
// without any AI provider key and without a model call.
//
//   node scripts/serve-www.mjs --port 8090 &          # the built site with its real headers
//   CHROME_EXE=<chromium or chrome-headless-shell> PW_MODULES=<folder holding node_modules/playwright-core> \
//     node desk/tests/browser-check.mjs [--base http://127.0.0.1:8090] [--shots <folder>]
//
// It is not part of `node --test`: it needs a browser. It checks what the Node tests cannot:
// that the page and the runtime load under the page's Content-Security-Policy, that the
// page's own search and brief work, that the confirmation dialog and the consent card show
// and answer, and that no other origin is contacted before the visitor acts.
// Exit 0 when every check passes, 1 otherwise.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const BASE = arg("--base", "http://127.0.0.1:8090");
const SHOTS = arg("--shots", null);
const require = createRequire(path.join(process.env.PW_MODULES || process.cwd(), "noop.js"));
const { chromium } = require("playwright-core");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}\n`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const requests = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("request", (r) => requests.push(r.url()));
const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); } };

try {
  await page.goto(`${BASE}/desk/`, { waitUntil: "load" });
  await page.waitForFunction(() => !document.querySelector("#assistant-status").textContent.startsWith("Connecting"), null, { timeout: 20000 });
  const status = await page.textContent("#assistant-status");
  check("the assistant boots and asks for a key", status === "Assistant needs your AI provider key. Add it in AI model settings below.", status);
  check("the runtime mounted the chat and the settings", await page.locator("#ns-msgs").count() === 1 && await page.locator('[data-ns-slot="settings"] *').count() > 0);
  check("no script or policy error while loading", errors.length === 0, errors.slice(0, 3).join(" | "));
  await shot("1-loaded");

  // The page's own search and brief, with no assistant involved.
  await page.fill("#desk-query", "bundle");
  await page.click('#desk-search-form button[type="submit"]');
  await page.waitForSelector("#desk-results li");
  const found = await page.locator("#desk-results li").count();
  check("the page's own search finds passages", found > 0, `${found} result(s)`);
  await page.click("#desk-results li button");
  await page.waitForSelector("#desk-brief li");
  const count = await page.textContent("#desk-brief-count");
  check("a passage whose digest matches becomes a card", /^1 of 8 cards/.test(count) && await page.locator("#desk-brief li .desk-ok").count() === 1, count);
  await shot("2-brief");

  // Another site is refused until the visitor ticks it, and nothing is asked of it.
  const refused = await page.evaluate(async () => {
    const { BriefDesk } = await import("/desk/page.js");
    return BriefDesk.page.search({ node: "standards", query: "robots" });
  });
  const asked = () => requests.filter((u) => !u.startsWith(BASE));
  check("another site is refused before the visitor allows it", refused.ok === false && /has not allowed/.test(refused.reason));
  check("no other origin was contacted so far", asked().length === 0, asked().slice(0, 3).join(" | "));

  // The actions, as the runtime runs them (the skill's "check without a key").
  const read = await page.evaluate(async () => {
    const { engine } = window.__nsweb;
    const scope = { base: engine.top.base, network: engine.top.network.name };
    const entry = engine.actions.catalog(scope).find((e) => e.name === "search_passages");
    const plan = engine.actions.prepare({ kind: "action", action: entry.ref, arguments: { node: "core", query: "bundle item" } });
    const receipts = await engine.actions.execute(plan, Boolean, "browser-check");
    return { status: receipts[0].status, count: receipts[0].result.count, names: engine.actions.catalog(scope).map((e) => `${e.name}:${e.effect}`).sort() };
  });
  check("the runtime runs a read action of the page", read.status === "succeeded" && read.count > 0, `${read.count} passage(s)`);
  check("six actions are registered with their effects", read.names.join(" ") === "add_card:write discard_brief:irreversible get_desk_state:read read_passage:read remove_card:write search_passages:read", read.names.join(" "));

  // The confirmation dialog of the irreversible action: decline, then Escape. Nothing runs.
  const dialog = async (press) => {
    const answer = page.evaluate(() => {
      const version = window.__nsweb.engine && document.querySelector("#desk-brief li") ? 1 : 0;
      return import("/desk/page.js").then(({ BriefDesk }) => window.__nsweb.engine.onActionConfirm([{
        action: "discard_brief", description: "", origin: location.origin, effect: "irreversible",
        arguments: { expectedVersion: BriefDesk.page.getState().brief.version },
      }]));
    });
    await page.waitForSelector("dialog.assistant-review[open]");
    const title = await page.textContent("dialog.assistant-review h2");
    const details = await page.textContent("dialog.assistant-review dl");
    await shot("3-dialog");
    await press();
    return { answer: await answer, title, details };
  };
  const declined = await dialog(() => page.click("dialog.assistant-review .assistant-decline"));
  check("the dialog names the action and its details", declined.title === "Discard the whole brief?" && /Cards\s*1/.test(declined.details), `${declined.title} / ${declined.details}`);
  check("the decline button declines", declined.answer === false);
  const escaped = await dialog(() => page.keyboard.press("Escape"));
  check("Escape declines", escaped.answer === false);
  check("the brief is unchanged after two declines", await page.locator("#desk-brief li").count() === 1);

  // The consent card for a partner site: shown, named, declined. Nothing is sent.
  const consent = page.evaluate(() => window.__nsweb.engine.onConsent({
    kind: "network", peerLabel: "Standards Map", peerOrigin: "standards.agenticsystemcore.com",
    requestText: "What do you offer on robots.txt?", est: { totalTokens: 200, costText: null },
  }));
  await page.waitForSelector("#ns-msgs .ns-consent");
  const card = await page.textContent("#ns-msgs .ns-consent");
  await shot("4-consent");
  check("the consent card names the site and shows the request", card.includes("Standards Map") && card.includes("standards.agenticsystemcore.com") && card.includes("What do you offer on robots.txt?"));
  const buttons = page.locator("#ns-msgs .ns-consent button");
  const labels = await buttons.allTextContents();
  await buttons.nth(labels.findIndex((l) => /decline|don.t|no/i.test(l))).click();
  check("declining the card answers decline", (await consent) === "decline", labels.join(" / "));
  check("still no other origin was contacted", asked().length === 0, asked().slice(0, 3).join(" | "));
  check("no script or policy error at the end", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (error) {
  check("the browser check ran to its end", false, String(error).split("\n")[0]);
  await shot("error");
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`browser-check: ${results.length - failed} pass, ${failed} fail\n`);
process.exitCode = failed ? 1 : 0;
