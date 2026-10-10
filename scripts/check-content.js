#!/usr/bin/env node
// The content gate: sentences and routes of this site that must stay true for the version it
// publishes. `scripts/check.js` runs it on every build; it also runs on its own:
//
//   node scripts/check-content.js [<built site folder>]   (default: build.out of agsc.config.json)
//
// Exit 0 pass, 1 fail. No network, no clock. Each check reads the BUILT pages, so it judges what a
// visitor and an agent are served, not the source that produced it. Each failure names the page
// and what it still says or lacks.
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_SECURITY = 'https://github.com/andreibesleaga/agentic-system-core/blob/main/SECURITY.md';
// The full key-word list of BCP 14 (RFC 2119, RFC 8174), in the order of RFC 2119 section 1–5.
const KEY_WORDS = 'MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, NOT RECOMMENDED, MAY and OPTIONAL';

/**
 * @param {string} www the built site folder
 * @returns {string[]} the failures, empty when every check holds
 */
function check(www) {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  const file = r => path.join(www, r);
  const read = r => (fs.existsSync(file(r)) ? fs.readFileSync(file(r), 'utf8') : '');
  // The visible text of a page: tags dropped, entities a sentence uses decoded, spaces collapsed.
  const text = r => read(r).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&#8212;/g, '—').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  // The board page: in the sitemap, and linked from a page that is not the board itself.
  const board = '/boards/project-board/';
  ok(read('boards/project-board/index.html') !== '', `${board} is not built`);
  ok(read('sitemap.xml').includes(`<loc>https://agenticsystemcore.com${board}</loc>`), `sitemap.xml does not list ${board}`);
  const linkers = ['index.html', 'docs/modes/index.html', 'exports/index.html'].filter(p => read(p).includes(`href="${board}"`));
  ok(linkers.length > 0, `no page of the site links ${board} (looked in /, /docs/modes/ and /exports/)`);

  // The touch icon: a 180 × 180 PNG at the address browsers ask for, named by every page head.
  const png = fs.existsSync(file('apple-touch-icon.png')) ? fs.readFileSync(file('apple-touch-icon.png')) : Buffer.alloc(0);
  ok(png.length > 24 && png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), '/apple-touch-icon.png is missing or not a PNG');
  if (png.length > 24) ok(png.readUInt32BE(16) === 180 && png.readUInt32BE(20) === 180, `/apple-touch-icon.png is ${png.readUInt32BE(16)} × ${png.readUInt32BE(20)}, not 180 × 180`);
  for (const p of ['index.html', 'about/index.html', 'docs/index.html']) ok(read(p).includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">'), `/${p.replace(/index\.html$/, '')} does not name the touch icon`);

  // The home page: a skill pack holds every published item of its cluster; no architecture runs.
  const home = text('index.html');
  ok(home.includes('Each cluster becomes a skill pack of its published items'), 'the home mode card does not say that a skill pack holds the published items of its cluster');
  ok(!home.includes('Procedures become skill packs'), 'the home mode card still says "Procedures become skill packs"');
  ok(!/runnable architectures/i.test(home), 'the home page still says "runnable architectures"');
  ok(!/runnable architectures/i.test(read('llms.txt') + read('assets/search-site.json')), 'a machine view of the home page still says "runnable architectures"');
  ok(home.includes('version 1.1 is planned to follow them'), 'the home page names no version for what is planned');
  ok(!home.includes('the next version is planned'), 'the home page still says "the next version is planned"');

  // The guide pages.
  const scenarios = text('docs/scenarios/index.html');
  ok(scenarios !== '' && !/does not yet serve[^.]*(combiner page|skill packs)/.test(scenarios), '/docs/scenarios/ says this site does not serve the combiner page or the skill packs; it serves both');
  ok(scenarios.includes('the combiner page and the skill packs are'), '/docs/scenarios/ does not say that the combiner page and the skill packs are pages of this site');
  const modes = text('docs/modes/index.html');
  ok(modes !== '' && !/those seven files|seven files for other runtimes|runnable architectures/i.test(modes), '/docs/modes/ still counts a Harness as seven files, or says "runnable architectures"');
  const start = text('docs/start-here/index.html');
  for (const [reader, needle] of [['a team with skills', 'If your team keeps its procedures as skills'], ['a team on a live board', 'If your team works on a live board'], ['a security reviewer', 'If you review its security'], ['a researcher', 'If you measure or cite it'], ['a restricted publisher', 'If your content is gated']]) {
    ok(start.includes(needle), `/docs/start-here/ has no path for ${reader} ("${needle}")`);
  }
  ok(text('docs/reading-the-specification/index.html').includes(`${KEY_WORDS} are used`), `/docs/reading-the-specification/ does not list all eleven key words (${KEY_WORDS})`);

  // The about page: a quickstart for the self-driving team (P12) after P0–P11.
  const about = read('about/index.html');
  ok(about.includes('id="quickstart-p12"'), '/about/ has no quickstart for P12, the self-driving team on a live board');
  ok(/id="quickstart-p12"[\s\S]*?propose[\s\S]*?task_state/.test(about), '/about/ P12 quickstart does not claim a task by proposing its task_state');

  // security.txt: Policy is the disclosure policy (RFC 9116 section 2.5.7), not the compliance page.
  const sec = read('.well-known/security.txt');
  ok(sec.includes(`\nPolicy: ${ENGINE_SECURITY}\n`), `/.well-known/security.txt Policy: is not the security policy ${ENGINE_SECURITY}`);

  // What the host adds. The built pages load nothing from another host; the sentences that say so
  // must also say what the host may add on top, so they stay true whichever switches are on.
  const legal = text('legal/index.html'), compliance = text('docs/compliance/index.html');
  for (const [page, t] of [['/legal/', legal], ['/docs/compliance/', compliance]]) {
    ok(t !== '' && !/loads nothing from any other host\.|no third-party requests,/.test(t), `${page} still says, without a qualification, that nothing is loaded from another host`);
    ok(/Network Error Logging/.test(t) && /speculation rules/i.test(t) && /bot[- ]detection script/i.test(t), `${page} does not name what Cloudflare may add: Network Error Logging, speculation rules and its bot-detection script`);
  }
  ok(legal.includes('the per-crawler groups of /robots.txt') && !legal.includes('the AI-usage signals of'), '/legal/ does not name the per-crawler groups of robots.txt as the first licence dialect');
  ok(compliance.includes('the per-crawler groups in robots.txt') && !compliance.includes('the AI-usage signals in'), '/docs/compliance/ does not name the per-crawler groups of robots.txt as the first licence dialect');
  return fails;
}

module.exports = { check };

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'agsc.config.json'), 'utf8'));
  const www = path.resolve(process.argv[2] || path.join(ROOT, (config.build || {}).out || 'www'));
  const fails = check(www);
  if (fails.length) { process.stderr.write(fails.map(f => `FAIL ${f}`).join('\n') + `\ncheck-content: ${fails.length} failure(s)\n`); process.exit(1); }
  process.stdout.write('check-content: pass\n');
}
