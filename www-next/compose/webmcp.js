'use strict';
// AgenticSystemCore WebMCP registration (AGSC-09-16). Generated; do not edit.
// One tool contract, two transports: the manifest below is the stdio server's
// manifest, and every handler dispatches to the same pure implementation.
(function () {
  var MANIFEST = {"tools":[{"annotations":{"readOnlyHint":true,"untrustedContentHint":true},"description":"Answer a question from this memory, citing at least one item IRI.","inputSchema":{"properties":{"question":{"type":"string"}},"required":["question"],"type":"object"},"name":"ask"},{"annotations":{"readOnlyHint":true,"untrustedContentHint":true},"description":"Run the AGSC-07 closure algebra over a selection of item slugs.","inputSchema":{"properties":{"selection":{"type":"array"}},"required":["selection"],"type":"object"},"name":"compose"},{"annotations":{"readOnlyHint":true,"untrustedContentHint":false},"description":"Return the typed Links authored on one item.","inputSchema":{"properties":{"iri":{"type":"string"},"slug":{"type":"string"}},"required":[],"type":"object"},"name":"links"},{"annotations":{"consequentialHint":true,"readOnlyHint":false,"untrustedContentHint":true},"description":"Return the Proposal payload for one item; performs no network write.","inputSchema":{"properties":{"slug":{"type":"string"}},"required":["slug"],"type":"object"},"name":"propose"},{"annotations":{"readOnlyHint":true,"untrustedContentHint":true},"description":"Return one item by slug.","inputSchema":{"properties":{"slug":{"type":"string"}},"required":["slug"],"type":"object"},"name":"read"},{"annotations":{"consequentialHint":true,"readOnlyHint":false,"untrustedContentHint":true},"description":"Synthesize a conforming item and return it as a Proposal payload.","inputSchema":{"properties":{"at":{"type":"string"},"body":{"type":"string"},"kind":{"type":"string"},"outcome":{"type":"string"},"severity":{"type":"string"},"sources":{"type":"array"},"title":{"type":"string"}},"required":["body","kind","title"],"type":"object"},"name":"remember"},{"annotations":{"readOnlyHint":true,"untrustedContentHint":true},"description":"Search this memory and return matching items.","inputSchema":{"properties":{"query":{"type":"string"}},"required":["query"],"type":"object"},"name":"search"}]};
  var LOCAL_ONLY = ["propose","remember"];
  var state = { localOnlyCalls: 0, manifest: MANIFEST, registered: 0, transport: 'webmcp' };
  globalThis.AGSC_WEBMCP = state;

  function invoke(name, args) {
    // AGSC-08-18: the result is the envelope the shared implementation
    // returns, unchanged. AGSC-09-16: no network call, no key, no server.
    var tools = globalThis.AGSC_TOOLS;
    if (!tools || typeof tools.call !== 'function') {
      return { body: { code: 'AGSC-E901', message: 'tool implementation not loaded' },
        license: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
        source: name, trust: 'untrusted', type: 'error' };
    }
    if (LOCAL_ONLY.indexOf(name) !== -1) state.localOnlyCalls += 1;
    return tools.call(name, args);
  }
  state.invoke = invoke;

  // Feature detection (AGSC-09-16): with no document.modelContext the page
  // keeps working in plain JavaScript and registers nothing at all.
  var context = (typeof document !== 'undefined' && document) ? document.modelContext : null;
  if (!context || typeof context.registerTool !== 'function') return;

  for (var i = 0; i < MANIFEST.tools.length; i += 1) {
    (function (tool) {
      context.registerTool({
        annotations: tool.annotations,
        description: tool.description,
        execute: function (args) { return invoke(tool.name, args); },
        inputSchema: tool.inputSchema,
        name: tool.name
      });
      state.registered += 1;
    }(MANIFEST.tools[i]));
  }
}());
