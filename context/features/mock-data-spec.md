# Mock Data for Dashboard UI

Read `@context/project-overview.md` and look at `@context/screenshots/dashboard-ui-main.png` to understand the DevVault data structure and dashboard UI.

Create a new file:

`src/lib/mock-data.ts`

This file will be the **single source of truth for mock data** used by the dashboard UI until the Git-backed storage and synchronization layer is implemented.

## Requirements

Create a simple static data structure containing:

- `items`
- `collections`
- `itemTypes`

Keep the data simple. It is only intended to provide realistic data for displaying the dashboard UI. Do not over-engineer the data model.

DevVault does **not** have authentication, so do not create a `user` object or any authentication-related data.

## Git-Ready Data Structure

Although Git synchronization is not being implemented yet, structure the mock data so it can transition naturally to the future Git-backed model.

DevVault's Git repository will eventually be the source of truth. The project overview defines:

- Git repository as the source of truth
- Local-first storage
- Markdown + YAML frontmatter for text-based items
- Files and images stored inside the repository
- Collections represented through repository structure and/or metadata

Therefore:

- Give every item a stable `id`.
- Give collections and item types stable `id` values as well.
- Include fields that can naturally map to Markdown frontmatter later, such as:
  - `id`
  - `title`
  - `type`
  - `tags`
  - `createdAt`
  - `updatedAt`

- For items that need it, include simple fields such as `content`, `language`, `url`, or `fileName`.
- Do not add database-specific fields such as `userId`, Prisma relations, database IDs, or ORM-specific structures.
- Do not create Git helper functions or synchronization logic.
- Do not create filesystem or repository helper methods.
- Do not implement persistence.

The mock objects should represent the **domain data**, not a future database schema.

## Important

Do NOT:

- Create Prisma models
- Create a database
- Create API calls
- Create helper methods
- Create mock-data factories
- Create Git synchronization logic
- Create a separate mock-data service
- Create authentication or user data
- Add unnecessary abstraction

The only requested implementation is:

`src/lib/mock-data.ts`

Export the static mock data so dashboard components can import it directly.

For example:

```ts
export const itemTypes = [...]

export const collections = [...]

export const items = [...]
```

Use realistic DevVault data that is useful for the dashboard screenshot.

The mock data should be easy to replace later with data read from the local Git repository without requiring dashboard components to depend on database-specific concepts.
