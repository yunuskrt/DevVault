import React from 'react'
import MainHeader from '@/components/dashboard/MainHeader'

type Props = {}

const Home = ({}: Props) => {
  return (
    <>
      <MainHeader title="All Items" subtitle="Everything in your vault" />
      <div className="p-6">
        <h2 className="text-lg font-semibold">Main</h2>
      </div>
    </>
  )
}

export default Home
