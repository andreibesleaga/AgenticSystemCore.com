# `static/` — files the site republishes byte for byte

**Summary.** Files that another tool writes and this site serves unchanged. The build copies
each one named below to the same path under `build.out`, with its own header block, so a
rebuild never drops it and every build of the same inputs gives the same bytes.

**Read after:** the repository [README](../README.md).

| Path | What it is | Written by |
|---|---|---|
| `.well-known/sustainability-data` | the signed monthly sustainability report of this origin (`draft-besleaga-sustainability-wellknown`), served as `application/sustainability-data+json` | the operator's monthly report tool, which places the same bytes here and in `www/` |
| `ns/<version>/` | the frozen copy of one published version of the vocabulary, `1.0.0-draft.1` for now: `agsc.ttl`, `agsc.rdf`, `agsc.nt` and `context.jsonld` exactly as published, served under `/ns/<version>/` with a page of its own. A published versioned copy never changes and stays served after a later version, so the build serves these bytes and never regenerates them; `scripts/check.js` holds the SHA-256 of every file. The folder holds those four files and nothing else | the site build that first published the version; copied here once, then never edited |

Nothing else in this folder is published. Neither `.well-known/` nor `ns/` has a README of
its own: the build publishes what `.well-known/` holds, and refuses any file in `ns/` that is
not a version folder, so this README describes both. Never edit a signed file by hand: its signature
covers every byte. Never edit a frozen vocabulary copy either: a changed vocabulary takes a new
version, which the build publishes beside the frozen ones.
