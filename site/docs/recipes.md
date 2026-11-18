---
title: "Recipes"
summary: "Short task pages: one job each, about ten minutes, every command with the lines it prints. Bring knowledge in from other formats and tools, connect assistants, check and trust a node, and extend the engine."
description: "Recipes for AgenticSystemCore: short how-to pages for importing notes and boards, connecting coding assistants, citing and querying a node, gating changes and reviewing security."
---

A recipe covers one job from an empty folder to a result you can check. The [guides](/docs/guides/) explain each of the six modes at length; a recipe is the short page for the day you need one thing done.

Every command on these pages was run with engine 1.1.0, and the lines quoted under it are the lines it printed. Each page has a script in [the site's repository](https://github.com/andreibesleaga/AgenticSystemCore.com/tree/main/recipes) that repeats all of its commands, so anyone can run the page again.

## Bring knowledge in

| Recipe | You have | You end with |
|---|---|---|
| [Open Knowledge Format, in and out](/docs/recipe-open-knowledge-format/) | an OKF folder | the bundle as a checked, built node, and an OKF export with a digest for every file |
| [Move a wiki or docs folder in](/docs/recipe-move-a-site-in/) | Markdown pages that link to each other | the pages as items, links verified, a built site |
| [Notes from Basic Memory, an Obsidian vault or a Notion export](/docs/recipe-notes-apps/) | an export of your notes | draft items, with typed links where the source had them |
| [Move a task board in and back out](/docs/recipe-task-boards/) | a board in one of eleven formats | a live board in the node, and the same board in another tool's format |

## Work with assistants

| Recipe | You have | You end with |
|---|---|---|
| [Connect a coding assistant](/docs/recipe-connect-an-assistant/) | Claude Code, Cursor, VS Code or Codex | a local tool server over your notes, checked by hand, and the setting each tool needs |
| [Give every assistant the project's decisions](/docs/recipe-steering-files/) | several assistants on one repository | one set of instructions in the file each tool reads, and a check that it is current |
| [Copy the memory into Mem0, Letta or Zep, and back](/docs/recipe-memory-tools/) | an agent with a memory tool | the files each tool takes, their digests, and the way back |

## Check and trust

| Recipe | You have | You end with |
|---|---|---|
| [Cite one passage and let a reader check it](/docs/recipe-cite-a-passage/) | a quote from a node | a citation with an address and a digest, and the reader's three-line check |
| [Ask the graph a question](/docs/recipe-ask-the-graph/) | a built node | SPARQL answers on your machine, the shapes checked, and a question the engine verifies on every build |
| [Stop a broken change before it is merged](/docs/recipe-ci-gate/) | a node in a git repository | the gate run locally, in GitHub Actions and before each commit |
| [Keep a node for internal knowledge](/docs/recipe-internal-node/) | notes that are not public | a restricted node, a clear view of what that setting changes, and a local assistant over it |
| [Review what a node proves about itself](/docs/recipe-security-review/) | a node to assess | each claim tied to a command, the line it prints and the document that states it |

## Extend it

| Recipe | You have | You end with |
|---|---|---|
| [Extend the engine or write your own](/docs/recipe-extend-or-port/) | a format or a language the engine does not cover | a working plugin and where the engine loads one; the conformance vectors run, and the order to follow for a port |

## How these pages are kept true

Each page states what it does not do, and says where a step was not run (for example, inside another company's product). The pages will move into the engine's tested guides at its next version; until then the scripts in the repository are the check.
