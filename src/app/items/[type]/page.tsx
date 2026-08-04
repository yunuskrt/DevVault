import React from 'react'
import { notFound } from 'next/navigation'
import MainHeader from '@/components/dashboard/MainHeader'
import ItemBrowser from '@/components/dashboard/ItemBrowser'
import { getTypeNavEntry, typeNav } from '@/lib/dashboard-nav'
import { getItemsByType } from '@/lib/dashboard-data'

type Props = {
  params: Promise<{ type: string }>
}

export const generateStaticParams = () =>
  typeNav.map((entry) => ({ type: entry.id }))

const ItemTypePage = async ({ params }: Props) => {
  const { type } = await params
  const entry = getTypeNavEntry(type)

  if (!entry) {
    notFound()
  }

  return (
    <>
      <MainHeader
        title={entry.label}
        subtitle={`${entry.count} ${entry.count === 1 ? 'item' : 'items'} in your vault`}
      />
      <div className="p-6">
        <ItemBrowser
          items={getItemsByType(entry.id)}
          emptyMessage={`No ${entry.label} items in your vault yet.`}
          createLabel={`New ${entry.label}`}
        />
      </div>
    </>
  )
}

export default ItemTypePage
