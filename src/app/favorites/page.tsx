import React from 'react'
import MainHeader from '@/components/dashboard/MainHeader'
import ItemBrowser from '@/components/dashboard/ItemBrowser'
import { getFavoriteItems } from '@/lib/dashboard-data'
import { pluralize } from '@/lib/format'

type Props = {}

const FavoritesPage = ({}: Props) => {
  const favoriteItems = getFavoriteItems()

  return (
    <>
      <MainHeader
        title="Favorites"
        subtitle={`${pluralize(favoriteItems.length, 'favorite item')} in your vault`}
      />
      <div className="p-6">
        <ItemBrowser
          items={favoriteItems}
          emptyMessage="No favorite items yet."
        />
      </div>
    </>
  )
}

export default FavoritesPage
