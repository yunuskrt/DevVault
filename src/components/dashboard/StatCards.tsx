import React from 'react'
import { Card } from '@/components/ui/card'
import type { DashboardStat } from '@/lib/dashboard-data'

type Props = {
  stats: DashboardStat[]
}

const StatCards = ({ stats }: Props) => {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.id} className="gap-1 p-4">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            {stat.label}
          </p>
          <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
        </Card>
      ))}
    </section>
  )
}

export default StatCards
