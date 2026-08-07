import React from 'react'
import { notFound } from 'next/navigation'
import MainHeader from '@/components/dashboard/MainHeader'
import ItemBrowser from '@/components/dashboard/ItemBrowser'
import { getCollectionById, getItemsByCollection } from '@/lib/dashboard-data'
import { pluralize } from '@/lib/format'

type Props = {
  params: Promise<{ collectionId: string }>
}

/** Reads the vault, so it can never be a build-time snapshot. */
export const dynamic = 'force-dynamic'

const CollectionPage = async ({ params }: Props) => {
  const { collectionId } = await params
  const collection = await getCollectionById(collectionId)

  if (!collection) {
    notFound()
  }

  const collectionItems = await getItemsByCollection(collection.id)

  return (
    <>
      <MainHeader
        title={collection.name}
        subtitle={`${pluralize(collectionItems.length, 'item')} in this collection`}
      />
      <div className="p-6">
        <ItemBrowser
          items={collectionItems}
          emptyMessage="No items in this collection yet."
        />
      </div>
    </>
  )
}

export default CollectionPage
