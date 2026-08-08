'use client'

import React, { useTransition } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { abortMerge, completeMerge } from '@/actions/vault'
import ConflictRow from '@/components/vault/ConflictRow'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { pluralize } from '@/lib/format'
import type { VaultAlerts } from '@/types/dashboard'

type Props = {
  /** Derived on the server; this component renders it and derives nothing. */
  alerts: VaultAlerts
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Resolving a merge conflict without leaving DevVault (§7.4).
 *
 * Until this shipped, a conflicted vault was a state the app could describe but
 * not exit — `coding-standards.md` requires conflicts to be handled explicitly,
 * and the only way out was a terminal.
 *
 * The list re-renders from the server after every action: each Server Action
 * revalidates layout-scoped, so `alerts` arrives with one fewer conflict rather
 * than this component tracking its own copy. That is what keeps the footer's
 * enabled state honest — it reflects the repository, not a click count.
 */
const ConflictDialog = ({ alerts, open, onOpenChange }: Props) => {
  const [isPending, startTransition] = useTransition()
  const { conflicts, operation } = alerts

  const remaining = conflicts.length

  const complete = () => {
    startTransition(async () => {
      const result = await completeMerge({})

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(
        result.data.kind === 'continued'
          ? 'Merge completed'
          : // A failed autostash restore leaves nothing to continue; the
            // resolved files are staged and the Commit button takes it from
            // here. Saying "merge completed" there would be a small lie.
            'Conflicts resolved — your changes are staged and ready to commit',
      )
      onOpenChange(false)
    })
  }

  const abort = () => {
    startTransition(async () => {
      const result = await abortMerge({})

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(
        result.data.operation
          ? `${result.data.operation === 'rebase' ? 'Rebase' : 'Merge'} aborted — your vault is back where it started`
          : 'There was nothing in progress to abort',
      )
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * Wide and tall rather than the base `sm:max-w-sm`, because every row
       * carries a path plus three controls. Both overrides have to beat the
       * component's own classes through `tailwind-merge`, which fails silently
       * when it does not — verified in the rendered class list.
       */}
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert
              aria-hidden="true"
              className="size-4 text-destructive"
            />
            Resolve conflicts
          </DialogTitle>
          <DialogDescription>
            {remaining > 0
              ? `The same ${pluralize(remaining, 'file')} changed on this computer and on the remote. Choose which version to keep — nothing is saved to your vault until you do.`
              : 'Everything is resolved. Finish the merge to apply it.'}
          </DialogDescription>
        </DialogHeader>

        {remaining > 0 ? (
          <ul className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
            {conflicts.map((conflict) => (
              <ConflictRow key={conflict.path} conflict={conflict} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No files are in conflict.
          </p>
        )}

        <DialogFooter className="sm:justify-between">
          {/*
           * Abort renders only when there is genuinely an operation to abort.
           * After a failed autostash restore there is none, and the only thing
           * an "abort" could throw away would be the user's own uncommitted
           * edits — the exact silent overwrite this spec exists to prevent.
           */}
          {operation ? (
            <Button
              variant="destructive"
              onClick={abort}
              disabled={isPending}
              title="Undo the whole sync and put your vault back where it started"
            >
              Abort
            </Button>
          ) : (
            <span />
          )}

          <Button
            onClick={complete}
            disabled={isPending || remaining > 0}
            title={
              remaining > 0
                ? 'Resolve every file first'
                : 'Finish the merge and apply it'
            }
          >
            {isPending && <Loader2 className="animate-spin" />}
            Complete merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ConflictDialog
