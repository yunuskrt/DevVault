'use client'

import React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SortOption<T extends string> = {
  readonly id: T
  readonly label: string
}

type Props<T extends string> = {
  value: T
  onChange: (value: T) => void
  /** Sort options as declared, e.g. `ITEM_SORT_OPTIONS`. */
  options: readonly SortOption<T>[]
  /** aria-label for the trigger, e.g. "Sort items by". */
  label: string
}

const SortSelect = <T extends string>({
  value,
  onChange,
  options,
  label,
}: Props<T>) => {
  /**
   * Radix only learns an item's label once SelectContent mounts, so a bare
   * SelectValue renders blank in the prerendered HTML. Passing the label as a
   * child gives the trigger its text on the server too.
   */
  const selectedLabel = options.find((option) => option.id === value)?.label

  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger size="sm" className="w-48" aria-label={label}>
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default SortSelect
