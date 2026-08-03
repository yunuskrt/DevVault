import React from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

type Props = {
  title: string
  subtitle: string
}

const MainHeader = ({ title, subtitle }: Props) => {
  return (
    <div className="border-b border-border px-6 py-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search"
          placeholder="Search content, titles, tags, types…"
          className="h-10 pl-9"
          readOnly
        />
      </div>
    </div>
  )
}

export default MainHeader
