import React from 'react'
import { ITEM_TYPE_META } from '@/lib/item-types'
import type { ItemTypeId } from '@/types/vault'

type Props = {
  type: ItemTypeId
  /**
   * Wraps the icon in a square tinted with the type's own colour. Decorative:
   * a chip takes no label, since the card it sits on already names the item.
   */
  chip?: boolean
}

const TypeIcon = ({ type, chip = false }: Props) => {
  const { icon: Icon, color, label } = ITEM_TYPE_META[type]

  if (chip) {
    return (
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}1f`, color }}
      >
        <Icon className="size-4" />
      </span>
    )
  }

  /*
   * role="img" is load-bearing: lucide only drops its default aria-hidden when
   * a label is present, and a bare aria-label on an svg is not reliably
   * exposed. Without it the icon is silent.
   */
  return (
    <Icon
      className="size-4 shrink-0"
      style={{ color }}
      role="img"
      aria-label={label}
    />
  )
}

export default TypeIcon
