export type ItemTypeId =
  | 'snippet'
  | 'prompt'
  | 'note'
  | 'command'
  | 'file'
  | 'image'
  | 'url'

export type ItemType = {
  id: ItemTypeId
  label: string
}

export type Collection = {
  id: string
  name: string
  favorite: boolean
  updatedAt: string
}

export type Item = {
  id: string
  title: string
  type: ItemTypeId
  collectionId: string
  tags: string[]
  favorite: boolean
  pinned: boolean
  createdAt: string
  updatedAt: string
  content?: string
  language?: string
  url?: string
  fileName?: string
}

export const itemTypes: ItemType[] = [
  { id: 'snippet', label: 'Snippet' },
  { id: 'prompt', label: 'Prompt' },
  { id: 'note', label: 'Note' },
  { id: 'command', label: 'Command' },
  { id: 'file', label: 'File' },
  { id: 'image', label: 'Image' },
  { id: 'url', label: 'URL' },
]

export const collections: Collection[] = [
  {
    id: 'react-patterns',
    name: 'React Patterns',
    favorite: true,
    updatedAt: '2026-08-01T16:05:00Z',
  },
  {
    id: 'python-snippets',
    name: 'Python Snippets',
    favorite: true,
    updatedAt: '2026-07-02T19:25:00Z',
  },
  {
    id: 'ai-prompts',
    name: 'AI Prompts',
    favorite: true,
    updatedAt: '2026-07-29T08:40:00Z',
  },
  {
    id: 'context-files',
    name: 'Context Files',
    favorite: false,
    updatedAt: '2026-06-30T14:20:00Z',
  },
  {
    id: 'devops-commands',
    name: 'DevOps & Commands',
    favorite: false,
    updatedAt: '2026-07-16T10:15:00Z',
  },
  {
    id: 'resources-links',
    name: 'Resources & Links',
    favorite: false,
    updatedAt: '2026-06-11T15:40:00Z',
  },
]

export const items: Item[] = [
  {
    id: 'use-debounce-hook',
    title: 'useDebounce hook',
    type: 'snippet',
    collectionId: 'react-patterns',
    tags: ['react', 'hooks', 'typescript'],
    favorite: true,
    pinned: true,
    createdAt: '2026-05-14T09:20:00Z',
    updatedAt: '2026-08-01T16:05:00Z',
    language: 'typescript',
    content: `import { useEffect, useState } from "react"

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timeout)
  }, [value, delay])

  return debounced
}`,
  },
  {
    id: 'code-review-assistant',
    title: 'Code review assistant',
    type: 'prompt',
    collectionId: 'ai-prompts',
    tags: ['review', 'gpt-5', 'workflow'],
    favorite: true,
    pinned: true,
    createdAt: '2026-04-02T11:00:00Z',
    updatedAt: '2026-07-29T08:40:00Z',
    content: `System prompt to get thorough, actionable code reviews.

You are a senior engineer reviewing a pull request. For each finding, state the file, the concrete failure scenario, and the smallest fix. Skip style nits that a formatter already handles. Rank findings by severity.`,
  },
  {
    id: 'docker-networking-notes',
    title: 'Docker networking notes',
    type: 'note',
    collectionId: 'devops-commands',
    tags: ['docker', 'networking'],
    favorite: false,
    pinned: false,
    createdAt: '2026-03-18T14:30:00Z',
    updatedAt: '2026-07-16T10:15:00Z',
    content: `Bridge vs host vs overlay networks, and when to use each.

- **bridge** — default for standalone containers on one host. Containers talk over an internal subnet; publish ports to reach them from outside.
- **host** — container shares the host network namespace. No port mapping, lowest overhead, no isolation.
- **overlay** — spans multiple hosts in a swarm. Use when services need to reach each other across machines.`,
  },
  {
    id: 'prune-docker-system',
    title: 'Prune docker system',
    type: 'command',
    collectionId: 'devops-commands',
    tags: ['docker', 'cleanup'],
    favorite: false,
    pinned: false,
    createdAt: '2026-02-09T17:45:00Z',
    updatedAt: '2026-07-04T12:00:00Z',
    language: 'bash',
    content: 'docker system prune -a --volumes',
  },
  {
    id: 'list-comprehension-cheatsheet',
    title: 'list_comprehension_cheatsheet',
    type: 'snippet',
    collectionId: 'python-snippets',
    tags: ['python', 'cheatsheet'],
    favorite: true,
    pinned: false,
    createdAt: '2026-01-22T08:10:00Z',
    updatedAt: '2026-07-02T19:25:00Z',
    language: 'python',
    content: `# flatten a matrix
flat = [x for row in matrix for x in row]

# conditional map
evens = [n * 2 for n in nums if n % 2 == 0]

# dict comprehension
by_id = {user["id"]: user for user in users}

# set comprehension
domains = {email.split("@")[1] for email in emails}`,
  },
  {
    id: 'mongodb-index-strategy',
    title: 'MongoDB index strategy',
    type: 'note',
    collectionId: 'devops-commands',
    tags: ['mongodb', 'performance', 'database'],
    favorite: false,
    pinned: false,
    createdAt: '2025-11-30T13:05:00Z',
    updatedAt: '2026-05-06T09:50:00Z',
    content: `When to use compound indexes and the ESR rule.

Order compound index keys as **Equality**, then **Sort**, then **Range**. An index that matches the query shape in that order lets the planner satisfy the filter and the sort from the index alone, avoiding an in-memory sort.`,
  },
  {
    id: 'tailwind-config-reference',
    title: 'Tailwind config reference',
    type: 'url',
    collectionId: 'resources-links',
    tags: ['tailwind', 'css', 'reference'],
    favorite: false,
    pinned: false,
    createdAt: '2026-06-11T15:40:00Z',
    updatedAt: '2026-06-11T15:40:00Z',
    url: 'https://tailwindcss.com/docs/theme',
  },
  {
    id: 'architecture-diagram',
    title: 'architecture-diagram.png',
    type: 'image',
    collectionId: 'context-files',
    tags: ['architecture', 'diagram'],
    favorite: false,
    pinned: true,
    createdAt: '2026-05-28T10:00:00Z',
    updatedAt: '2026-06-30T14:20:00Z',
    fileName: 'architecture-diagram.png',
  },
  {
    id: 'eslint-base-config',
    title: 'eslint-base-config.json',
    type: 'file',
    collectionId: 'context-files',
    tags: ['eslint', 'config'],
    favorite: false,
    pinned: false,
    createdAt: '2026-04-19T09:15:00Z',
    updatedAt: '2026-06-22T11:35:00Z',
    fileName: 'eslint-base-config.json',
    language: 'json',
    content: `{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "no-unused-vars": "warn",
    "@typescript-eslint/no-explicit-any": "error"
  }
}`,
  },
  {
    id: 'compound-component-pattern',
    title: 'Compound component pattern',
    type: 'snippet',
    collectionId: 'react-patterns',
    tags: ['react', 'patterns', 'context'],
    favorite: true,
    pinned: false,
    createdAt: '2026-03-05T16:25:00Z',
    updatedAt: '2026-07-21T13:10:00Z',
    language: 'typescript',
    content: `const TabsContext = createContext<{ active: string; setActive: (id: string) => void } | null>(null)

export function Tabs({ defaultTab, children }: { defaultTab: string; children: ReactNode }) {
  const [active, setActive] = useState(defaultTab)
  return <TabsContext.Provider value={{ active, setActive }}>{children}</TabsContext.Provider>
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error("TabPanel must be used inside Tabs")
  return ctx.active === id ? <div>{children}</div> : null
}`,
  },
  {
    id: 'commit-message-writer',
    title: 'Commit message writer',
    type: 'prompt',
    collectionId: 'ai-prompts',
    tags: ['git', 'conventional-commits'],
    favorite: true,
    pinned: false,
    createdAt: '2026-02-26T12:50:00Z',
    updatedAt: '2026-07-13T17:05:00Z',
    content: `Turn a staged diff into a conventional commit message.

Read the diff and produce a single line in the form \`type(scope): summary\`, under 72 characters, imperative mood. Add a body only when the change needs a "why". Never mention the tooling that generated it.`,
  },
  {
    id: 'reset-branch-to-remote',
    title: 'Reset branch to remote',
    type: 'command',
    collectionId: 'devops-commands',
    tags: ['git', 'recovery'],
    favorite: false,
    pinned: false,
    createdAt: '2026-01-08T07:30:00Z',
    updatedAt: '2026-06-09T15:45:00Z',
    language: 'bash',
    content: 'git fetch origin && git reset --hard origin/$(git branch --show-current)',
  },
]
