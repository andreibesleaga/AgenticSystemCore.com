# `site/docs/guides/` — the six mode guides

**Summary.** The pages under `/docs/guides/`: `index.md` is `/docs/guides/` and
`mode-0.md` … `mode-5.md` are one guide per mode. Each is the engine's
`docs/guides/<name>.md` with a frontmatter block, without its first heading, and with
its links pointing at this site or at the engine repository. The commands and the
lines they quote are the engine's, which the engine's test `tests/docs/guides.test.js`
runs; `scripts/build.js` compares every code block of a guide here with the engine
working tree's copy and stops on a difference, so a guide is changed in the engine
first and copied here.

**Read after:** [site/docs/README.md](../README.md).
