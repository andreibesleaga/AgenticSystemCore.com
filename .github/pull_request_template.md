<!--
Thank you. CONTRIBUTING.md says how a change is proposed: edit content/ or site/, never www/.
-->

## What this changes and why

## How it was checked

- [ ] `node scripts/build.js && node scripts/check.js` ends with "check: pass", with the engine beside this repository

## Sign-off (outside contributions)

An outside contribution signs off every commit under the contributor agreement (`CONTRIBUTOR-AGREEMENT` in the engine repository), with a last line of this shape:

```
Signed-off-by: Your Name <you@example.org> (CA-v1)
```

`git commit -s` writes the first part of that line; add ` (CA-v1)` at its end. The maintainer's own commits are exempt.
