# `assets/` — the stylesheet, the search script and the icon

**Summary.** Three files the build publishes by name: `site.css` under `/assets/site.css`, `search.js` under `/assets/search.js` and `favicon.svg` under `/favicon.svg`. The build copies those three files and nothing else from this folder, so this README is not published.

**Read after:** the repository [README](../README.md).

| File | What it is |
|---|---|
| `site.css` | the engine's default theme, byte for byte: the build stops if it differs from the engine's stylesheet, so change both together |
| `search.js` | the script of this site's `/search/` page, over the index of every page, rule and error code the build writes to `/assets/search-site.json` |
| `favicon.svg` | the site icon |

After an edit, run `node scripts/build.js && node scripts/check.js` from the repository root.
