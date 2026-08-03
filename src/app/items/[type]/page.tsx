import React from 'react'
import { notFound } from 'next/navigation'
import MainHeader from '@/components/dashboard/MainHeader'
import { getTypeNavEntry, typeNav } from '@/lib/dashboard-nav'

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
        <h2 className="text-lg font-semibold">Main</h2>
      </div>
    </>
  )
}

export default ItemTypePage
