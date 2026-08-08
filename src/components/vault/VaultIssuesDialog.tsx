'use client'

import React, { useTransition } from 'react'
import { ExternalLink, FileWarning } from 'lucide-react'
import { toast } from 'sonner'

import { openInEditor } from '@/actions/vault'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { pluralize } from '@/lib/format'
import type { VaultIssue } from '@/types/dashboard'

type Props = {
  issues: VaultIssue[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Files the vault could not load (§7.6).
 *
 * `VaultLoadResult.errors` has been populated since spec 1 and logged to the
 * server console since spec 3, where nobody using the app could see it. This is
 * its user-facing surface.
 *
 * **Persistent, never a toast.** Every entry here is a file the user has to go
 * and fix by hand in an editor, and a message that disappears after four
 * seconds is useless for that. There is nothing to click to make these go away
 * — the count drops on its own once the file parses, which is why the list is
 * read-only apart from the shortcut into an editor.
 */
const VaultIssuesDialog = ({ issues, open, onOpenChange }: Props) => {
  const [isPending, startTransition] = useTransition()

  const openFile = (path: string) => {
    startTransition(async () => {
      const result = await openInEditor({ path })
      if (!result.success) toast.error(result.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileWarning aria-hidden="true" className="size-4 text-amber-500" />
            Files that need attention
          </DialogTitle>
          <DialogDescription>
            {`DevVault could not read ${pluralize(issues.length, 'file')} in your vault, so ${issues.length === 1 ? 'it is' : 'they are'} missing from the app. Everything else loaded normally. Fix ${issues.length === 1 ? 'it' : 'them'} in your editor and the list updates on the next page load.`}
          </DialogDescription>
        </DialogHeader>

        <ul className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
          {issues.map((issue) => (
            <li
              key={issue.path}
              className="flex items-start gap-2 rounded-lg border border-border p-3"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {issue.path}
                </span>
                {/*
                 * The reader writes these to be acted on — "`type` is missing",
                 * not a Zod dump — and they are already free of absolute paths
                 * and stack traces by construction (`readErrorMessage`).
                 */}
                <span className="text-sm">{issue.message}</span>
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => openFile(issue.path)}
                aria-label={`Open ${issue.path} in your editor`}
              >
                <ExternalLink />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

export default VaultIssuesDialog
