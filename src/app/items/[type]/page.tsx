import React from 'react'
import { notFound } from 'next/navigation'
import MainHeader from '@/components/dashboard/MainHeader'
import ItemBrowser from '@/components/dashboard/ItemBrowser'
import { getTypeNavEntry } from '@/lib/dashboard-nav'
import { getItemsByType } from '@/lib/dashboard-data'
import { pluralize } from '@/lib/format'

type Props = {
  params: Promise<{ type: string }>
}

/** Reads the vault, so it can never be a build-time snapshot. */
export const dynamic = 'force-dynamic'

const ItemTypePage = async ({ params }: Props) => {
  const { type } = await params
  const entry = await getTypeNavEntry(type)

  if (!entry) {
    notFound()
  }

  return (
    <>
      <MainHeader
        title={entry.label}
        subtitle={`${pluralize(entry.count, 'item')} in your vault`}
      />
      <div className="p-6">
        <ItemBrowser
          items={await getItemsByType(entry.id)}
          emptyMessage={`No ${entry.label} items in your vault yet.`}
          createLabel={`New ${entry.label}`}
        />
      </div>
    </>
  )
}

export default ItemTypePage
