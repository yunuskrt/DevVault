'use client'

import React, { useTransition } from 'react'
import { ExternalLink, FileWarning, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { openInEditor, resolveConflict } from '@/actions/vault'
import TypeIcon from '@/components/dashboard/TypeIcon'
import { Button } from '@/components/ui/button'
import type { ConflictSide } from '@/lib/git/types'
import type { ConflictEntry } from '@/types/dashboard'

type Props = {
  conflict: ConflictEntry
}

/**
 * One conflicted file, with the three actions the spec requires.
 *
 * **The two keep buttons are labelled by meaning, never by Git's flag.** Which
 * of `--ours`/`--theirs` each becomes is decided in `lib/git/conflict-sides.ts`
 * from what the repository is actually doing — during a rebase, and after a
 * failed autostash restore, `--ours` is the *other* computer. Nothing at this
 * layer is allowed an opinion about that, which is why the action takes
 * `'mine' | 'theirs'` and there is no way to express a raw flag from here.
 *
 * Its own `useTransition` rather than one shared by the dialog: resolving one
 * file must not grey out the buttons on every other row, and each row's spinner
 * should sit on the button that was actually clicked.
 */
const ConflictRow = ({ conflict }: Props) => {
  const [isPending, startTransition] = useTransition()

  const keep = (side: ConflictSide) => {
    startTransition(async () => {
      const result = await resolveConflict({ path: conflict.path, side })

      if (result.success) {
        toast.success(
          side === 'mine'
            ? 'Kept this computer’s version'
            : 'Kept the other computer’s version',
          { description: conflict.title ?? conflict.path },
        )
      } else {
        toast.error(result.error)
      }
    })
  }

  const open = () => {
    startTransition(async () => {
      const result = await openInEditor({ path: conflict.path })
      if (!result.success) toast.error(result.error)
    })
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-start gap-2.5">
        {conflict.type ? (
          <TypeIcon type={conflict.type} chip />
        ) : (
          /*
           * A file under no type directory at all — a collection, or something
           * hand-placed. It still has to be resolvable, so it gets a neutral
           * chip rather than being hidden or crashing the row.
           */
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileWarning aria-hidden="true" className="size-4" />
          </span>
        )}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium">
            {/*
             * The title is a nicety and the path is the fact. When the file is
             * too mangled to name, the path carries the row on its own rather
             * than the row rendering an em dash and telling the user nothing.
             */}
            {conflict.title ?? conflict.path}
          </span>
          {conflict.title && (
            <span className="truncate font-mono text-xs text-muted-foreground">
              {conflict.path}
            </span>
          )}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        {/*
         * The visible labels are the spec's own ("Keep mine" / "Keep theirs"),
         * which fit the row; the accessible names spell out what those mean,
         * which is the thing the spec insists on. "Mine" and "theirs" are
         * genuinely ambiguous words for a decision this destructive, and they
         * must never be read as Git's `--ours`/`--theirs` — which point the
         * opposite way in three of the five states this dialog can appear in.
         */}
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => keep('mine')}
          aria-label={`Keep this computer’s version of ${conflict.title ?? conflict.path}`}
          title="Keep this computer’s version"
        >
          {isPending && <Loader2 className="animate-spin" />}
          Keep mine
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => keep('theirs')}
          aria-label={`Keep the incoming version of ${conflict.title ?? conflict.path}`}
          title="Keep the version that came from the remote"
        >
          Keep theirs
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={isPending}
          onClick={open}
          // The icon alone says nothing about *which* file it would open, and
          // every row's button looks identical.
          aria-label={`Open ${conflict.path} in your editor`}
        >
          <ExternalLink />
        </Button>
      </span>
    </li>
  )
}

export default ConflictRow
