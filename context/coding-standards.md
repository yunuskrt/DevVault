# Coding Standards

## TypeScript

- Strict mode enabled.
- No `any` types. Use proper typing or `unknown`.
- Define types/interfaces for component props, API responses, CLI inputs/outputs, and domain data.
- Use type inference where obvious; use explicit types where it improves clarity.
- Prefer `type` for simple composition and `interface` where extension is useful.
- Use `async/await` for asynchronous operations.
- Keep shared domain types in `src/types/`.

## React

- Functional components only; no class components.
- Use hooks for state and side effects.
- Keep components focused on one responsibility.
- Extract reusable logic into custom hooks.
- Avoid unnecessary client components.

### Component and Page Structure

Every React component and Next.js page must follow this basic structure:

```tsx
import React from 'react'
import styles from './test-component.module.css'

type Props = {}

const TestComponent = ({}: Props) => {
  return (
    ...
  )
}

export default TestComponent
```

The following must exist in every component/page:

```tsx
import React from 'react'

type Props = {}

const ComponentName = ({}: Props) => {}
```

- Keep the `Props` type even when the component currently has no props.
- Replace `ComponentName` with the actual component name.
- Use the component's actual CSS module only when custom CSS is required.
- Do not import a CSS module if the component does not use custom CSS.

## Next.js

- Server components by default.
- Only use `'use client'` when interactivity, hooks, browser APIs, or another client-only requirement is needed.
- Use Server Actions for appropriate server-side mutations.
- Use Route Handlers/API routes when:
  - An explicit HTTP endpoint is required.
  - File uploads/downloads need endpoint handling.
  - Specific HTTP status codes or headers are required.
  - An endpoint may be consumed by the CLI or future clients.
  - A third-party integration requires a webhook/API endpoint.
- Prefer direct server-side data access over unnecessary internal HTTP requests.
- Use dynamic routes for item, collection, and other resource pages.
- Keep Git/filesystem operations in server-side code; never expose filesystem or Git credentials to the browser.

## Styling

- Tailwind CSS v4 is the primary styling solution.
- Do not create `tailwind.config.ts` or `tailwind.config.js`.
- Configure Tailwind v4 through CSS and `@theme`.
- Use shadcn/ui components where applicable.
- No inline styles.
- Use CSS Modules for component-specific custom CSS when Tailwind/shadcn is insufficient.
- CSS Modules must be colocated with the component.

### CSS Module Naming

For a component:

```text
src/components/test/TestComponent.tsx
src/components/test/test-component.module.css
```

Use:

```tsx
import styles from './test-component.module.css'
```

CSS module filenames must use:

```text
<component-name>.module.css
```

with kebab-case.

- Do not create a CSS module unless custom styles are actually needed.
- Prefer Tailwind for layout, spacing, colors, responsive behavior, and common styling.
- Dark mode first; light mode remains supported.

## File Organization

```text
src/
├── app/
│   └── [route]/
│       └── page.tsx
├── components/
│   └── [feature]/
│       ├── ComponentName.tsx
│       └── component-name.module.css
├── actions/
│   └── [feature].ts
├── lib/
│   ├── git/
│   ├── filesystem/
│   ├── markdown/
│   └── search/
├── types/
│   └── [feature].ts
└── ...
```

- Components: `src/components/[feature]/ComponentName.tsx`
- Pages: `src/app/[route]/page.tsx`
- Server Actions: `src/actions/[feature].ts`
- Shared libraries: `src/lib/[feature]/`
- Git operations: `src/lib/git/`
- Filesystem operations: `src/lib/filesystem/`
- Markdown parsing/serialization: `src/lib/markdown/`
- Shared types: `src/types/[feature].ts`

## Naming

- Components: PascalCase (`ItemCard.tsx`)
- Pages: Next.js conventions (`page.tsx`, `layout.tsx`)
- Component CSS modules: kebab-case (`item-card.module.css`)
- Other files: Match their purpose; use kebab-case where appropriate.
- Functions: camelCase.
- Constants: SCREAMING_SNAKE_CASE.
- Types/Interfaces: PascalCase with no prefix.
- CLI commands: lowercase, descriptive names (`init`, `start`, `sync`).

## Git and Data Storage

- Git is the source of truth for DevVault data.
- Do not introduce Prisma, PostgreSQL, Redis, or another database for the local-first MVP.
- Store text-based content as Markdown with YAML frontmatter where metadata is required.
- Store images and files inside the configured vault repository.
- Keep generated application state separate from user content where possible.
- Git operations must be isolated behind a dedicated library/service layer.
- Do not execute arbitrary Git commands from UI components.
- Never expose repository paths, Git credentials, or filesystem access to client-side code.
- Handle Git conflicts explicitly and never silently overwrite user changes.
- Commit messages should be descriptive, for example:
  - `Add note: Docker networking`
  - `Update snippet: pandas filter`
  - `Delete prompt: code review`

## CLI

- The CLI is a separate application layer from the Next.js UI.
- Use TypeScript and Node.js.
- Use Commander.js for command parsing.
- Keep CLI commands thin; business logic belongs in shared `src/lib/` or package-level services.
- CLI commands should validate inputs and return clear, actionable error messages.
- Do not duplicate Git/filesystem logic between CLI and Next.js.
- Core commands include:
  - `devvault init`
  - `devvault start`
  - `devvault sync`
- `devvault init` creates or configures a DevVault repository.
- `devvault start` starts the local application against the configured vault.
- `devvault sync` handles the intended pull/commit/push synchronization workflow.
- CLI output should be concise and use consistent success, warning, and error messages.
- Never print secrets, tokens, passwords, or private credentials.

## Data Access and Validation

- Keep filesystem and Git access on the server/CLI side.
- Validate external input at boundaries.
- Use Zod for validating structured user input, frontmatter, CLI configuration, and API/Server Action payloads where appropriate.
- Do not use a database-specific data-access layer.
- Prefer small services/modules with clear responsibilities:
  - Git service
  - Filesystem service
  - Markdown service
  - Search service
  - Vault/config service

## Error Handling

- Handle expected errors explicitly.
- Use `try/catch` around filesystem, Git, network, and other fallible operations.
- Return structured results from Server Actions and shared services where appropriate:
  `{ success, data, error }`
- Show user-friendly errors in the UI.
- CLI errors should explain what failed and, when possible, how the user can fix it.
- Do not expose stack traces or internal implementation details to end users.
- Never silently ignore Git conflicts or failed synchronization.

## Code Quality

- No commented-out code unless specifically required.
- No unused imports, variables, or dead code.
- Keep functions focused and preferably under 50 lines when practical.
- Avoid unnecessary abstractions.
- Prefer composition over duplication.
- Keep UI, domain logic, filesystem logic, and Git logic separated.
- Reuse shared logic between the CLI and web application instead of duplicating implementations.
