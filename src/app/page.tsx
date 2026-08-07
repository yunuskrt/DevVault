import React from 'react'
import MainHeader from '@/components/dashboard/MainHeader'
import StatCards from '@/components/dashboard/StatCards'
import RecentCollections from '@/components/dashboard/RecentCollections'
import DashboardItemSections from '@/components/dashboard/DashboardItemSections'
import {
  getDashboardStats,
  getPinnedItems,
  getRecentCollections,
  getRecentItems,
} from '@/lib/dashboard-data'

type Props = {}

/** Reads the vault, so it can never be a build-time snapshot. */
export const dynamic = 'force-dynamic'

const Home = async ({}: Props) => {
  const now = Date.now()

  return (
    <>
      <MainHeader
        title="Dashboard"
        subtitle="Your developer knowledge, versioned"
      />
      <div className="flex flex-col gap-8 p-6">
        <StatCards stats={await getDashboardStats()} />
        <RecentCollections collections={await getRecentCollections(now)} />
        <DashboardItemSections
          pinnedItems={await getPinnedItems(now)}
          recentItems={await getRecentItems(now)}
        />
      </div>
    </>
  )
}

export default Home
