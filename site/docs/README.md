# `site/docs/` — the guide

**Summary.** One Markdown file per page of the plain-language guide at `/docs/`
(`index.md` is `/docs/` itself). Each page explains; none decides — the rules of the
specification win. The generator skips this README; every other `.md` file here becomes
a page.

**Read after:** [site/README.md](../README.md).

Each page needs frontmatter with `title`, `summary` (the sentence the page opens with)
and `description`. In the body, `{{diagram:<id>}}` inlines a diagram from
`site/diagrams/<id>.diagram`, other `{{slot}}` placeholders are filled from the engine's
documents (the requirements, the glossary, the standards register, the security
considerations), and a rule id such as AGSC-06-07 becomes a link to the rule. The build
stops on a rule id or a requirement id that does not exist.

```bash
node scripts/build.js && node scripts/check.js   # from the repository root
```

The six mode guides are in [guides/](guides/README.md), one page each under `/docs/guides/`;
they are copies of the engine's `docs/guides/`, and the build stops if their code blocks differ.

Start with `index.md` (the reading paths) and `start-here.md` (one path per reader).
