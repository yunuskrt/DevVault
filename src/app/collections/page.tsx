import React from 'react'
import MainHeader from '@/components/dashboard/MainHeader'
import CollectionBrowser from '@/components/dashboard/CollectionBrowser'
import { getAllCollections } from '@/lib/dashboard-data'

type Props = {}

const CollectionsPage = ({}: Props) => {
  const allCollections = getAllCollections()

  return (
    <>
      <MainHeader
        title="Collections"
        subtitle={`${allCollections.length} ${allCollections.length === 1 ? 'collection' : 'collections'} in your vault`}
      />
      <div className="p-6">
        <CollectionBrowser collections={allCollections} />
      </div>
    </>
  )
}

export default CollectionsPage
