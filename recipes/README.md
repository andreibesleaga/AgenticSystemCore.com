# Recipes: the scripts behind the pages

Each recipe page of the site (`site/docs/recipe-<name>.md`, published at `/docs/recipe-<name>/`) has a script
here, `<name>.run.sh`, that repeats every command of the page in a new temporary folder.

## Run one

```bash
mkdir work && cd work && npm install agentic-system-core@1.1.0 && cd ..
bash recipes/cite-a-passage.run.sh work > recipes/cite-a-passage.transcript.txt 2>&1; echo "exit $?"
```

The script takes the folder that holds `node_modules` and exits 0 when the page is true. Some scripts need
more than Node.js and git: `jq`, `openssl`, `curl`, `perl`, GNU `sed`, or Python 3 with `venv` (each page says
what it needs under "Needs"). Three scripts use the network: `open-knowledge-format` clones a public repository,
`cite-a-passage` reads one file of the live site, and `ask-the-graph` installs two Python packages.

## Check a page against its run

```bash
cd recipes && cp ../site/docs/recipe-cite-a-passage.md cite-a-passage.md
python3 check-page.py cite-a-passage; rm cite-a-passage.md
```

`check-page.py` reads `<name>.md`, `<name>.run.sh` and `<name>.transcript.txt` from the current folder. It fails
when a command on the page is not in the script, or when a quoted output line is not in the transcript.
Transcripts hold paths of the machine that made them, so they are not committed (`.gitignore`).

## Change a page

Edit the page and its script together, run the script, run the check, then build the site. A page that quotes
a value which differs by machine (a commit hash, a port) says so in its text.
