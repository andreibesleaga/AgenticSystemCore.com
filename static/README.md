# `static/` — files the site republishes byte for byte

**Summary.** Files that another tool writes and this site serves unchanged. The build copies
each one named below to the same path under `build.out`, with its own header block, so a
rebuild never drops it and every build of the same inputs gives the same bytes.

**Read after:** the repository [README](../README.md).

| Path | What it is | Written by |
|---|---|---|
| `.well-known/sustainability-data` | the signed monthly sustainability report of this origin (`draft-besleaga-sustainability-wellknown`), served as `application/sustainability-data+json` | the operator's monthly report tool, which places the same bytes here and in `www/` |

Nothing else in this folder is published. Never edit a signed file by hand: its signature
covers every byte.
