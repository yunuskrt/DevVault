import React from 'react'

type Props = {
  message: string
}

const EmptyState = ({ message }: Props) => {
  return (
    <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
      {message}
    </p>
  )
}

export default EmptyState
