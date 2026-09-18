The profile URI `https://w3id.org/agentic-system-core/profile/agentic-knowledge` identifies an `application/linkset+json` document (RFC 9264) that describes one published knowledge Bundle. This page documents that profile: it is the page the profile URI resolves to, and every extension relation URI `https://w3id.org/agentic-system-core/rel#<name>` resolves to its row in [Link relations](#link-relations). The specification is normative; each statement here names the rule it restates.

{{status}}

## Discovery

A client finds the document in one of three ways:

- It requests `/.well-known/knowledge-linkset` on the node's origin (AGSC-06-07).
- It follows `<link rel="describedby" href="/.well-known/knowledge-linkset" type="application/linkset+json">` in the head of a page (AGSC-06-25).
- It follows the equivalent `Link` response header on `/` (AGSC-11-05).

`describedby` is a registered relation (registered by the W3C POWDER Recommendation; RFC 6892 registers its inverse, `describes`). The media type and the profile say what kind of description the target is, so no new relation name is needed.

## Media type and profile

The document is served as `application/linkset+json` with the parameter `profile="https://w3id.org/agentic-system-core/profile/agentic-knowledge"` (RFC 9264, section 5). Where a platform cannot carry a parameter, the node sends `Link: <https://w3id.org/agentic-system-core/profile/agentic-knowledge>; rel="profile"` (RFC 6906) instead, and a reader accepts either (AGSC-06-07, AGSC-11-04).

A client that ignores the profile still reads a valid link set: the profile adds target attributes and changes no semantics of the media type. No vendor media type, no new registry and no URI scheme is defined.

## Document shape

- `linkset` is the only top-level member (AGSC-06-08).
- The array holds exactly one link context object, whose `anchor` is the Bundle IRI.
- Relation-name members are ordered as JSON member names. Within one relation, targets are ordered by `href`, and every `href` is absolute (AGSC-06-10).
- At Level 2 and above the bytes are JCS-canonical (RFC 8785) with one trailing line feed. At Level 0 they need only be I-JSON (AGSC-06-08a).

## Link relations

{{relations}}

## Target attributes

{{attributes}}

## Levels

A Level-0 publisher, such as a CMS or wiki export, publishes the same link set with every `digest` and every bundle-fact `agsc-*` attribute omitted: it has no ledger, no N-Quads graph and no build instant (AGSC-06-08a). At Level 2 and above every artefact link carries `digest`, the `describedby` link to `graph.jsonld` carries the bundle facts, and the ledger link carries its head (AGSC-06-08). The surface, visibility, contribution and tombstone attributes apply at every Level.

## Related-system links

A node MAY link related discovery documents and systems, such as an llms.txt file, a VoID or DCAT description, an Agent2Agent Agent Card, an MCP server card, or an ontology or SPARQL endpoint. It uses IANA-registered relations only: `describedby`, `alternate`, `related`, `service-desc`, `service-doc`, `service-meta`, `collection` and `item`, and each link carries `type`. A reader ignores a related-system link it does not understand, and none affects conformance, a digest, the peer check or a walk (AGSC-06-35).

## Examples

This node's own document, a Level-0 link set, shown pretty-printed:

{{example-self}}

A Level-2 document carrying the integrity attributes, as given in AGSC-06-08:

{{example-level2}}

## Security considerations

The discovery document and every public artefact are served with `Access-Control-Allow-Origin: *` and never with credentials (AGSC-11-03). A client that fetches a peer uses `https` only, refuses special-purpose and private address ranges, re-checks every redirect hop and caps the walk (AGSC-11-07, AGSC-11-08, AGSC-11-09, AGSC-11-10). Content reached through a peer is marked untrusted (AGSC-11-11).

The specification states its own limit (AGSC-08-19):

> These lints prove neither safety nor the absence of novel injection; hashes and attestations prove only that an artefact is what was published. An implementation MUST NOT claim more.

## Relationship to other work

- **VoID** describes linked datasets at `/.well-known/void`. A node that publishes a VoID description links it as a second `describedby` target (AGSC-06-12).
- **The API catalog** (RFC 9727) uses the link-set format to list the APIs of a publisher. This profile applies the same pattern to knowledge artefacts.
- **llms.txt** gives agents a curated text entry point. A node's `/llms.txt` follows a fixed byte layout and is declared as a surface (AGSC-06-13a, AGSC-11-16).
- **DCAT** catalogues may describe a Bundle as a dataset. No DCAT emission is required.
