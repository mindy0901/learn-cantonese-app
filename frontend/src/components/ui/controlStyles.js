import { cn } from '../../lib/cn.js'

const controlShellClass =
  'box-border m-0 shrink-0 rounded-lg border border-border bg-surface'

/** Standard 44px field shell — inputs, selects. */
export const controlBoxClass = cn(controlShellClass, 'h-11 min-h-11 py-0')

/** Standard 44px button shell — matches Button size="md". */
export const controlButtonClass = cn(
  controlShellClass,
  'inline-flex h-11 min-h-11 items-center justify-center px-5 py-0',
)

export const uiSelectClass = cn(
  controlBoxClass,
  'px-4 pr-9 text-sm leading-10 text-text-h outline-none cursor-pointer transition-colors focus:border-accent-border',
)

export const uiInputClass = cn(
  controlBoxClass,
  'w-full px-4 text-sm leading-6 text-text-h outline-none transition-colors focus:border-accent-border py-3',
)

export const uiTextareaClass = cn(
  'box-border m-0 w-full rounded-lg border border-border bg-surface px-3.5 py-2.5',
  'text-sm text-text-h outline-none transition-colors focus:border-accent-border resize-y',
)

export const uiIconButtonClass = cn(
  controlButtonClass,
  'size-10 p-0 text-base leading-normal shadow-sm',
  'text-text-h transition-colors hover:border-accent-border hover:bg-accent-bg',
  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
)

export const uiControlRowClass = 'flex flex-wrap items-center gap-2'

/** Compact icon/emoji button — tables, modals, flags. */
export const uiCompactIconButtonClass =
  'inline-flex items-center justify-center border-0 bg-transparent p-0 leading-normal'

export const uiModalCloseButtonClass = cn(
  uiCompactIconButtonClass,
  'size-8 text-2xl text-text-muted rounded-md hover:bg-bg',
)
