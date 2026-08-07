import React from 'react'
import { FolderGit2 } from 'lucide-react'

type Props = {
  /**
   * A `VaultError` message. These are written for a human and are safe to
   * render — never a stack trace, a repository path or a raw stderr line.
   */
  message: string
}

/**
 * What the app renders instead of the dashboard when there is no vault to read.
 *
 * This replaces the whole shell rather than sitting inside it: a sidebar of
 * zeroes next to an empty grid reads as "your vault is empty", which is a very
 * different thing from "DevVault does not know where your vault is".
 */
const VaultSetup = ({ message }: Props) => {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-lg bg-primary/10"
            aria-hidden="true"
          >
            <FolderGit2 className="size-5 text-primary" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">No vault configured</h1>
            <p className="text-sm text-muted-foreground">
              DevVault reads your knowledge from a Git repository on disk.
            </p>
          </div>
        </div>

        <p className="rounded-lg border border-dashed p-4 text-sm">{message}</p>

        <div className="space-y-2">
          <h2 className="text-sm font-medium">Getting started</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Create a directory for your vault, or clone an existing one.</li>
            <li>
              Add{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                DEVVAULT_PATH=/path/to/your/vault
              </code>{' '}
              to{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                .env.local
              </code>{' '}
              in the project root.
            </li>
            <li>
              Run{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                npm run seed
              </code>{' '}
              to populate a new vault with example items, then restart the dev
              server.
            </li>
          </ol>
        </div>
      </div>
    </main>
  )
}

export default VaultSetup
