import { describe, expect, it } from 'vitest'

import {
  SIDEBAR_COLLECTION_LIMIT,
  getCollectionNav,
  getPrimaryNav,
  getTypeNav,
  getTypeNavEntry,
} from '@/lib/dashboard-nav'
import { ITEM_TYPE_META } from '@/lib/item-types'
import { PRIMARY_NAV_ICONS } from '@/lib/nav-icons'
import { collections, items, itemTypes } from '@/lib/mock-data'
import type { SidebarNav } from '@/types/dashboard'

const nav = (): SidebarNav => ({
  primary: getPrimaryNav(),
  types: getTypeNav(),
  collections: getCollectionNav(),
})

describe('getPrimaryNav', () => {
  it('counts every item and every favorite', () => {
    const [dashboard, favorites] = getPrimaryNav()

    expect(dashboard).toMatchObject({ id: 'all', label: 'Dashboard', href: '/' })
    expect(dashboard.count).toBe(items.length)
    expect(favorites).toMatchObject({
      id: 'favorites',
      label: 'Favorites',
      href: '/favorites',
    })
    expect(favorites.count).toBe(items.filter((item) => item.favorite).length)
  })

  it('names an icon the client can resolve', () => {
    for (const entry of getPrimaryNav()) {
      expect(PRIMARY_NAV_ICONS[entry.icon]).toBeTypeOf('object')
    }
  })
})

describe('getTypeNav', () => {
  it('lists every item type in declaration order', () => {
    expect(getTypeNav().map((entry) => entry.id)).toEqual(
      itemTypes.map((type) => type.id),
    )
  })

  it('counts each type and accounts for every item', () => {
    const entries = getTypeNav()

    for (const entry of entries) {
      expect(entry.count).toBe(
        items.filter((item) => item.type === entry.id).length,
      )
    }

    const total = entries.reduce((sum, entry) => sum + entry.count, 0)
    expect(total).toBe(items.length)
  })

  it('builds the route each row links to', () => {
    for (const entry of getTypeNav()) {
      expect(entry.href).toBe(`/items/${entry.id}`)
    }
  })

  /*
   * The icon and colour used to travel on the entry. They now come from
   * ITEM_TYPE_META in the client, so every id has to be a key of it — that
   * lookup is what keeps the rendered row identical.
   */
  it('yields ids that ITEM_TYPE_META can resolve', () => {
    for (const entry of getTypeNav()) {
      expect(ITEM_TYPE_META[entry.id]).toBeDefined()
    }
  })
})

describe('getTypeNavEntry', () => {
  it('finds a real type', () => {
    expect(getTypeNavEntry('snippet')).toEqual(
      getTypeNav().find((entry) => entry.id === 'snippet'),
    )
  })

  it('returns undefined for an unknown type, which is the 404 on /items/[type]', () => {
    expect(getTypeNavEntry('nope')).toBeUndefined()
    expect(getTypeNavEntry('')).toBeUndefined()
    expect(getTypeNavEntry('Snippet')).toBeUndefined()
  })
})

describe('getCollectionNav', () => {
  it('caps the list at the three most recently updated collections', () => {
    const entries = getCollectionNav()
    const expected = [...collections]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, SIDEBAR_COLLECTION_LIMIT)

    expect(entries).toHaveLength(SIDEBAR_COLLECTION_LIMIT)
    expect(entries.map((entry) => entry.id)).toEqual(
      expected.map((collection) => collection.id),
    )
  })

  it('counts the items filed in each collection and links to its page', () => {
    for (const entry of getCollectionNav()) {
      expect(entry.count).toBe(
        items.filter((item) => item.collectionIds.includes(entry.id)).length,
      )
      expect(entry.href).toBe(`/collections/${entry.id}`)
    }
  })

  it('takes its dot colour from the collection’s dominant type', () => {
    const colors = Object.values(ITEM_TYPE_META).map((meta) => meta.color)

    for (const entry of getCollectionNav()) {
      // undefined is legitimate: an empty collection has no dominant type.
      if (entry.color !== undefined) expect(colors).toContain(entry.color)
    }
  })
})

describe('the nav as a whole', () => {
  /*
   * The reason these became functions. Next.js rejects a non-serializable
   * prop at build time; this catches it in a unit run, and says which field.
   */
  it('is serializable, so it can cross into the client as a prop', () => {
    const value = nav()

    expect(JSON.parse(JSON.stringify(value))).toEqual(value)

    for (const entry of [...value.primary, ...value.types, ...value.collections]) {
      for (const [key, field] of Object.entries(entry)) {
        expect(
          typeof field,
          `${key} must not be a function or component`,
        ).not.toBe('function')
      }
    }
  })

  /*
   * They used to be shared module-scope constants. Now that every call builds
   * a fresh list, a caller sorting or splicing one must not affect the next.
   */
  it('hands out a fresh list on every call', () => {
    const first = getTypeNav()
    const before = first.length

    first.reverse()
    first.pop()

    expect(getTypeNav()).toHaveLength(before)
    expect(getTypeNav()[0].id).toBe(itemTypes[0].id)
  })
})

/*
 * Guards a live duplication: the sidebar and the type page take their label
 * from itemTypes, while cards take theirs from ITEM_TYPE_META. Whichever ends
 * up owning it, the two must not drift while both exist.
 */
describe('item type labels', () => {
  it('agree between the vault and the presentation map', () => {
    for (const type of itemTypes) {
      expect(ITEM_TYPE_META[type.id].label).toBe(type.label)
    }
  })
})
