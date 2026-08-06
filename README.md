# DevVault

A Git-native developer knowledge hub for snippets, prompts, notes, commands,
links, files and images. The vault is a directory of Markdown files in a Git
repository you own — there is no database.

## Getting started

### 1. Point DevVault at a vault

DevVault reads its content from the directory named by the **`DEVVAULT_PATH`**
environment variable. This is a *separate* directory from this repository —
your vault is your own Git repo, not part of the app's source tree. There is no
fallback: if the variable is unset, DevVault fails with a setup error rather
than guessing.

Create `.env.local` in the project root (it is gitignored):

```bash
DEVVAULT_PATH=~/devvault
```

A leading `~/` is expanded, so the same `.env.local` works on more than one
machine. Any other value must be an absolute path. The directory must exist.

### 2. Populate it

```bash
mkdir -p ~/devvault
npm run seed              # refuses to run if the vault already has content
npm run seed -- --force   # overwrite an existing vault
```

This writes the sample vault — 12 items across `snippets/`, `prompts/`,
`notes/`, `commands/`, `links/`, `files/` and `images/`, plus 6 files under
`collections/` — as real Markdown with YAML frontmatter. It creates no Git
repository and makes no commits.

### 3. Run it

```bash
npm run dev     # http://localhost:3000
npm run build
npm run start
npm test        # vitest
```

## Vault layout

```text
~/devvault/
├── .devvault/config.json    # committed: schemaVersion, name, settings
├── collections/             # one file per collection
├── snippets/  prompts/  notes/  commands/  links/
├── files/                   # asset + <filename>.md sidecar
├── images/                  # asset + <filename>.md sidecar
└── .gitignore
```

Every text item is Markdown with frontmatter — metadata in the block, content in
the body, so a snippet reads as a code block when viewed on GitHub:

```markdown
---
id: use-debounce-hook
title: useDebounce hook
type: snippet
collections: [react-patterns]
tags: [react, hooks, typescript]
language: typescript
favorite: true
createdAt: 2026-05-14T09:20:00Z
updatedAt: 2026-08-01T16:05:00Z
---

export function useDebounce<T>(value: T, delay = 300): T { … }
```

Nesting inside a type directory (`snippets/react/…`) is yours to organise as you
like — a folder is *not* a collection. Collections are the many-to-many
mechanism, stored as `collections:` on the item itself so that membership
travels inside the item's own file.

Design notes: [`docs/git-vault-architecture.md`](docs/git-vault-architecture.md).
