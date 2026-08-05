import React from 'react'
import { notFound } from 'next/navigation'
import MainHeader from '@/components/dashboard/MainHeader'
import ItemBrowser from '@/components/dashboard/ItemBrowser'
import { getCollectionById, getItemsByCollection } from '@/lib/dashboard-data'
import { collections } from '@/lib/mock-data'
import { pluralize } from '@/lib/format'

type Props = {
  params: Promise<{ collectionId: string }>
}

export const generateStaticParams = () =>
  collections.map((collection) => ({ collectionId: collection.id }))

const CollectionPage = async ({ params }: Props) => {
  const { collectionId } = await params
  const collection = getCollectionById(collectionId)

  if (!collection) {
    notFound()
  }

  const collectionItems = getItemsByCollection(collection.id)

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
