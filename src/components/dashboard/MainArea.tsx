import React from 'react'

type Props = {
  children: React.ReactNode
}

const MainArea = ({ children }: Props) => {
  return <main className="flex-1 overflow-y-auto">{children}</main>
}

export default MainArea
