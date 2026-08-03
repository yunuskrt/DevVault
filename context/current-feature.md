# Current Feature: Mock Data for Dashboard UI

## Status

<!-- Not Started|In Progress|Completed -->

In Progress

## Goals

<!-- Goals & requirements -->

- Create `src/lib/mock-data.ts` as the single source of truth for dashboard mock data until Git-backed storage exists.
- Export three static arrays: `itemTypes`, `collections`, `items`.
- Give every item, collection, and item type a stable `id`.
- Items include frontmatter-mappable fields: `id`, `title`, `type`, `tags`, `createdAt`, `updatedAt`.
- Include type-specific fields only where needed: `content`, `language`, `url`, `fileName`.
- Provide realistic data matching the dashboard screenshot (12 items, 5 favorites, 3 pinned, 6 collections, 7 types).
- Keep data importable directly by dashboard components with no database-specific concepts.

## Notes

<!-- Any extra notes -->

Spec: `context/features/mock-data-spec.md`
Reference UI: `context/screenshots/dashboard-ui-main.png`

Screenshot-derived shape:

- Collections: React Patterns (2), Python Snippets (1), AI Prompts (2), Context Files (2), DevOps & Commands (4), Resources & Links (1)
- Types: Snippet (3), Prompt (2), Note (2), Command (2), File (1), Image (1), URL (1)
- Cards show title, type · collection, content preview, tags, relative updated time, favorite star and pinned icon

Constraints (from spec):

- No auth/user object — DevVault has no authentication
- No Prisma, database, API calls, or persistence
- No helper methods, factories, or mock-data service
- No Git sync or filesystem logic
- No `userId`, ORM relations, or database IDs
- No unnecessary abstraction — domain data only

## History

<!-- Keep this updated. Earliest to latest -->
