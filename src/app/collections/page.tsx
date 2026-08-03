import React from 'react'
import MainHeader from '@/components/dashboard/MainHeader'
import { collections } from '@/lib/mock-data'

type Props = {}

const CollectionsPage = ({}: Props) => {
  return (
    <>
      <MainHeader
        title="Collections"
        subtitle={`${collections.length} ${collections.length === 1 ? 'collection' : 'collections'} in your vault`}
      />
      <div className="p-6">
        <h2 className="text-lg font-semibold">Main</h2>
      </div>
    </>
  )
}

export default CollectionsPage
