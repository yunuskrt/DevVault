import React from 'react'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'size-2',
  md: 'size-2.5',
} as const

type Props = {
  /** Omitted when a collection has no dominant type; falls back to muted. */
  color?: string
  size?: keyof typeof SIZES
}

const ColorDot = ({ color, size = 'sm' }: Props) => {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'shrink-0 rounded-full',
        SIZES[size],
        !color && 'bg-muted-foreground',
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

export default ColorDot
