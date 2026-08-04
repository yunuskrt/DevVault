import React from 'react'
import MainHeader from '@/components/dashboard/MainHeader'
import StatCards from '@/components/dashboard/StatCards'
import RecentCollections from '@/components/dashboard/RecentCollections'
import ItemsBrowser from '@/components/dashboard/ItemsBrowser'
import {
  getDashboardStats,
  getPinnedItems,
  getRecentCollections,
  getRecentItems,
} from '@/lib/dashboard-data'

type Props = {}

const Home = ({}: Props) => {
  const now = Date.now()

  return (
    <>
      <MainHeader
        title="Dashboard"
        subtitle="Your developer knowledge, versioned"
      />
      <div className="flex flex-col gap-8 p-6">
        <StatCards stats={getDashboardStats()} />
        <RecentCollections collections={getRecentCollections(now)} />
        <ItemsBrowser
          pinnedItems={getPinnedItems(now)}
          recentItems={getRecentItems(now)}
        />
      </div>
    </>
  )
}

export default Home
