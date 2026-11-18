---
title: "Recipe: give every coding assistant the project's decisions"
summary: "For a team whose repository is worked on by more than one coding assistant. You end with one set of instructions, written to the file each tool reads, and a way to keep it current."
description: "Write AGENTS.md, CLAUDE.md, a Cursor rule and other steering files from your project's notes with one command, and check they stay current."
---

**Who it is for:** a developer or team that uses several coding assistants on one repository.

**What you get:** the project's current state, its decisions, lessons and procedures written once into the file each assistant reads, and a check that the files are current.

**Time:** about 10 minutes. **Needs:** Node.js 22.13 or later, git, a POSIX shell.


## Before you start

Install the engine as in [Mode 0](/docs/guides/mode-0/#before-you-start). Start in an empty working folder. The long version of this recipe, with a board and a gate, is [Mode 2](/docs/guides/mode-2/#3-one-steering-file-for-every-assistant).

## 1. A project with three notes

A steering file is built from four kinds of item: concept, procedure, gate and lesson. Make one concept, one lesson and one procedure, adopt them and commit once:

```bash
mkdir -p my-project/content/concepts my-project/content/lessons my-project/content/procedures && cd my-project
cat > content/concepts/decide-the-login.md <<'ITEM'
---
type: concept
title: Decide the login
description: Build a plain password form first; add single sign-on later.
prov:
  origin: human
  operator: human:you
kind: decision
---

Build a plain password form first; single sign-on comes later.
ITEM
cat > content/lessons/never-log-passwords.md <<'ITEM'
---
type: lesson
title: Never log passwords
description: A debug line once wrote a password to the log.
date: "2026-11-01"
severity: warn
prov:
  origin: human
  operator: human:you
---

## What happened

A debug line printed the whole login request, password included.

## Lesson

Log the user name and the outcome, never the password.
ITEM
cat > content/procedures/run-the-tests.md <<'ITEM'
---
type: procedure
title: Run the tests
description: Run the project's tests before every change.
prov:
  origin: human
  operator: human:you
when: A change is ready to be proposed
---

## Steps

1. Run `npm test`.
2. Fix every failure.
ITEM
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: https://example.org/security\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'the login project'
```

Nothing is printed. Write `human:<your-id>` where the files say `human:you`.

## 2. Write the steering files

```bash
agsc export --steer
ls dist/export/steer
```

```text
export --steer: 2 targets (agents, claude), identical bytes at each path (AGSC-01-28)
AGENTS.md
CLAUDE.md
```

The default targets are `agents` and `claude`. Both files have the same bytes. Other lines the command printed are left out.

## 3. Choose the targets

`--target` takes a comma-separated list. The engine names eleven targets and writes one path for each:

| Target | File written |
|---|---|
| `agents` | `AGENTS.md` |
| `claude` | `CLAUDE.md` |
| `codex` | `AGENTS.override.md` |
| `cursor` | `.cursor/rules/agsc.mdc` |
| `copilot` | `.github/copilot-instructions.md` |
| `gemini` | `GEMINI.md` |
| `windsurf` | `.windsurf/rules/agsc.md` |
| `cline` | `.clinerules/agsc.md` |
| `kiro` | `.kiro/steering/agsc.md` |
| `aider` | `CONVENTIONS.md` |
| `gabbe` | `GABBE/agents/AGENTS.md` |

Write five targets, copy them into the repository and commit:

```bash
agsc export --steer --target agents,claude,cursor,copilot,gemini
cp -r dist/export/steer/. .
git add -A && git commit -q -m 'steering files'
```

```text
export --steer: 5 targets (agents, claude, cursor, copilot, gemini), identical bytes at each path (AGSC-01-28)
```

Which tool reads which file is that tool's matter; see its own documentation. The engine states one limit: the Cursor rule has no front matter, so Cursor may not apply it to every chat.

## 4. What is inside

```bash
sed -n '/^## Lessons/,/^## Procedures/p' AGENTS.md
```

````text
## Lessons

### Never log passwords

- item: http://localhost/lessons/never-log-passwords/

```text agsc-content

## What happened

A debug line printed the whole login request, password included.

## Lesson

Log the user name and the outcome, never the password.
```

## Procedures
````

The file has the project's state, an index line for each concept, and the full text of each procedure, gate and lesson. The text is fenced and marked as data the assistant reads, not as instructions. Only these four kinds of item are used; an episode or the git log is never a source. A concept appears as one line: its title, address and description.

## 5. Keep the files current

Run the export again after a decision, lesson or procedure changes, and copy the files in. A check for CI is a comparison of the written files with the committed ones. Every commit changes the version and time lines in the header, so the comparison skips those three lines:

```bash
agsc export --steer --target agents,claude,cursor,copilot,gemini > /dev/null
strip() { grep -v -e '^bundle_version:' -e '^generated_at:' -e '^- last build:' "$1"; }
for f in AGENTS.md CLAUDE.md GEMINI.md .cursor/rules/agsc.mdc .github/copilot-instructions.md; do
  diff <(strip "dist/export/steer/$f") <(strip "$f") > /dev/null && echo "current: $f"
done
```

```text
current: AGENTS.md
current: CLAUDE.md
current: GEMINI.md
current: .cursor/rules/agsc.mdc
current: .github/copilot-instructions.md
```

Now change a lesson, commit, write the files again and compare:

```bash
sed -i 's/never the password\./never the password or the session token./' content/lessons/never-log-passwords.md
git commit -qam 'lesson: session token'
agsc export --steer --target agents,claude,cursor,copilot,gemini > /dev/null
diff <(strip dist/export/steer/AGENTS.md) <(strip AGENTS.md) || echo "AGENTS.md is out of date (diff exit code $?)"
```

```text
43c43
< Log the user name and the outcome, never the password or the session token.
---
> Log the user name and the outcome, never the password.
AGENTS.md is out of date (diff exit code 1)
```

In CI, make that `diff` fail the job. The engine has no command of its own for this comparison.

## Check that it worked

Step 5 printed the changed line and an exit code of 1. After you copy the new files in, the same comparison prints nothing.

## What this does not do

- It writes files; it does not copy them for you. You commit them.
- The engine does not check that a tool reads its file. That is the tool's behaviour.
- Editing the body of a concept changes nothing here: a concept shows as one line. Put an instruction in a procedure, a gate or a lesson.
- The quoted prose is the project's own text. Read it before you commit it.

## Where to go next

- [Mode 2](/docs/guides/mode-2/): the board, the decision and the gate that go with these files.
- [Connect an assistant](/docs/recipe-connect-an-assistant/) so it can search the notes directly.
- [Gate a repository in CI](/docs/recipe-ci-gate/).

Run on 18 November 2026 with engine 1.1.0. The script that repeats every command of this page: [recipes/steering-files.run.sh](https://github.com/andreibesleaga/AgenticSystemCore.com/blob/main/recipes/steering-files.run.sh). More recipes: [the list](/docs/recipes/).
