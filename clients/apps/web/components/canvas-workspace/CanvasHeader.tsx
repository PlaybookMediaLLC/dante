'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { CanvasSession, CanvasSessionState } from '@/lib/canvas/session'
import { useCanvasUi } from '@/lib/canvas/ui-store'
import { cn } from '@/lib/utils'
import { ArrowUUpLeftIcon } from '@phosphor-icons/react/dist/ssr/ArrowUUpLeft'
import { ArrowUUpRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowUUpRight'
import { CaretDownIcon } from '@phosphor-icons/react/dist/ssr/CaretDown'
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise'
import { ExportIcon } from '@phosphor-icons/react/dist/ssr/Export'
import { MegaphoneIcon } from '@phosphor-icons/react/dist/ssr/Megaphone'
import { PaletteIcon } from '@phosphor-icons/react/dist/ssr/Palette'
import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/ssr/SidebarSimple'
import { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/ssr/SlidersHorizontal'
import { StackIcon } from '@phosphor-icons/react/dist/ssr/Stack'
import { XIcon } from '@phosphor-icons/react/dist/ssr/X'
import { RenameDialog } from './CanvasLibrary'
import type { CanvasActions } from './use-canvas-actions'
import type { CanvasDialog } from './CanvasDialogs'

const STATUS: Record<CanvasSessionState['status'], string> = {
  saved: 'Saved to workspace',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  offline: 'Offline · kept on this device',
  conflict: 'Save conflict',
  error: 'Not saved',
}

/** Name, save state, undo and redo, and the document-wide actions. */
export function CanvasHeader({
  session,
  state,
  actions,
  canEdit,
  canHandOff,
  onDialog,
  presence,
}: {
  session: CanvasSession
  state: CanvasSessionState
  actions: CanvasActions
  canEdit: boolean
  canHandOff: boolean
  onDialog: (dialog: CanvasDialog) => void
  /** Who else has this canvas open. */
  presence?: React.ReactNode
}) {
  const [name, setName] = useState(session.record.name)
  const [renaming, setRenaming] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const router = useRouter()
  const leftOpen = useCanvasUi((ui) => ui.leftOpen)
  const rightOpen = useCanvasUi((ui) => ui.rightOpen)
  const togglePanel = useCanvasUi((ui) => ui.togglePanel)
  const status = STATUS[state.status]
  useEffect(() => {
    const previous = document.title
    document.title = `${name} · Canvas`
    return () => {
      document.title = previous
    }
  }, [name])
  const pill =
    'flex min-w-0 items-center gap-0.5 rounded-full border border-black/[0.06] bg-background p-1 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_20px_-8px_rgba(0,0,0,0.12)] dark:border-white/10'
  return (
    // Floating pills on the board's own grey, like a slides tool, instead of a bar.
    <header className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-3 pb-1 lg:flex-nowrap">
      <div className={pill}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 min-w-0 max-w-[40vw] shrink gap-1.5 rounded-full px-3 text-[13px] font-medium"
          disabled={!canEdit}
          onClick={() => setRenaming(true)}
          title="Rename canvas"
        >
          <StackIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h1 className="truncate">{name}</h1>
          {canEdit ? (
            <CaretDownIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : null}
        </Button>
        <span
          role="status"
          data-testid="canvas-save-status"
          title={`Revision ${state.revision}`}
          className={cn(
            'me-1 shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px]',
            (state.status === 'saved' || state.status === 'unsaved' || state.status === 'saving') &&
              'text-muted-foreground',
            (state.status === 'offline' ||
              state.status === 'conflict' ||
              state.status === 'error') &&
              'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          )}
        >
          {status}
        </span>
      </div>
      <div className={pill}>
        {/* Phones open the panels as sheets from the board's own bar instead. */}
        <span className="hidden items-center gap-0.5 md:flex">
          <Tool label="Artboards & tools" pressed={leftOpen} onClick={() => togglePanel('left')}>
            <SidebarSimpleIcon className="size-4" />
          </Tool>
          <Tool label="Properties" pressed={rightOpen} onClick={() => togglePanel('right')}>
            <SlidersHorizontalIcon className="size-4" />
          </Tool>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        </span>
        {canEdit ? (
          <>
            <Tool
              label="Undo"
              shortcut="⌘Z"
              disabled={!state.canUndo}
              onClick={() => actions.undo()}
            >
              <ArrowUUpLeftIcon className="size-4" />
            </Tool>
            <Tool
              label="Redo"
              shortcut="⇧⌘Z"
              disabled={!state.canRedo}
              onClick={() => actions.redo()}
            >
              <ArrowUUpRightIcon className="size-4" />
            </Tool>
          </>
        ) : null}
        <Tool label="History" onClick={() => onDialog('history')}>
          <ClockCounterClockwiseIcon className="size-4" />
        </Tool>
      </div>
      {presence}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div className={pill}>
          {canEdit ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3 text-[13px] font-normal"
              onClick={() => onDialog('brand')}
            >
              <PaletteIcon className="size-4" aria-hidden="true" />
              Brand
            </Button>
          ) : null}
          {canEdit && canHandOff ? (
            <Button
              className="h-8 shrink-0 gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-normal"
              variant="ghost"
              size="sm"
              onClick={() => onDialog('campaign')}
            >
              <MegaphoneIcon className="size-4" aria-hidden="true" />
              Campaign
            </Button>
          ) : null}
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-full px-3.5 text-[13px]"
            onClick={() => onDialog('export')}
          >
            <ExportIcon className="size-4" aria-hidden="true" />
            Export
          </Button>
        </div>
        <Link
          href="/canvas"
          aria-label="Back to Canvas"
          title="Back to Canvas"
          className={cn(
            pill,
            'size-10 shrink-0 justify-center p-0 text-foreground/80 hover:text-foreground'
          )}
          aria-busy={leaving}
          onNavigate={(event) => {
            event.preventDefault()
            if (leaving) return
            setLeaving(true)
            void (async () => {
              try {
                actions.exitEdit()
                if (canEdit && !(await session.save())) {
                  toast.error(
                    'The canvas could not be saved. Resolve the save problem before leaving.'
                  )
                  return
                }
                router.push('/canvas')
              } catch (failure) {
                toast.error(
                  failure instanceof Error ? failure.message : 'Could not save the canvas.'
                )
              } finally {
                setLeaving(false)
              }
            })()
          }}
        >
          <XIcon className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {renaming ? (
        <RenameDialog
          name={name}
          onClose={() => setRenaming(false)}
          onSave={async (next) => {
            const record = await session.client.canvas.rename.mutate({
              canvasId: session.record.id,
              name: next,
            })
            setName(record.name)
            session.record.name = record.name
            setRenaming(false)
          }}
        />
      ) : null}
    </header>
  )
}

/** An icon button in a toolbar pill; its label is its name and its tooltip. */
function Tool({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  shortcut?: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          className="size-8 rounded-full p-0 text-foreground/75 hover:text-foreground aria-pressed:bg-foreground/[0.07] aria-pressed:text-foreground"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{shortcut ? `${label} ${shortcut}` : label}</TooltipContent>
    </Tooltip>
  )
}
