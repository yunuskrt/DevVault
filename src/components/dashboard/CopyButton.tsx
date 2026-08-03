'use client'

import React from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  text: string
  label: string
}

const CopyButton = ({ text, label }: Props) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Content Copied To The Clipboard')
    } catch {
      toast.error('Could not copy to the clipboard')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Copy className="size-3.5" />
    </button>
  )
}

export default CopyButton
