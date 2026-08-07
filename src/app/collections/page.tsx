import React from 'react'
import MainHeader from '@/components/dashboard/MainHeader'
import CollectionBrowser from '@/components/dashboard/CollectionBrowser'
import { getAllCollections } from '@/lib/dashboard-data'
import { pluralize } from '@/lib/format'

type Props = {}

/** Reads the vault, so it can never be a build-time snapshot. */
export const dynamic = 'force-dynamic'

const CollectionsPage = async ({}: Props) => {
  const allCollections = await getAllCollections()

  return (
    <>
      <MainHeader
        title="Collections"
        subtitle={`${pluralize(allCollections.length, 'collection')} in your vault`}
      />
      <div className="p-6">
        <CollectionBrowser collections={allCollections} />
      </div>
    </>
  )
}

export default CollectionsPage
