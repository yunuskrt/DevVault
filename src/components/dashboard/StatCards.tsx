import React from 'react'
import { Card } from '@/components/ui/card'
import { WIDE_GRID_CLASS } from '@/lib/ui-classes'
import type { DashboardStat } from '@/lib/dashboard-data'

type Props = {
  stats: DashboardStat[]
}

const StatCards = ({ stats }: Props) => {
  return (
    <section className={WIDE_GRID_CLASS}>
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
