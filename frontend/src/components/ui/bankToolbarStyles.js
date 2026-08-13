import { cn } from '../../lib/cn.js'
import {
  controlBoxClass,
  controlButtonClass,
  uiControlRowClass,
  uiInputClass,
  uiSelectClass,
} from './controlStyles.js'

export const bankToolbarControlClass = uiSelectClass

/** Search input in a vertical/block layout (pickers, standalone). */
export const bankSearchInputClass = cn(uiInputClass, 'min-w-0 w-full shrink-0')

/** Search input inside the horizontal word/grammar bank toolbar. */
export const bankToolbarSearchClass = cn(
  bankSearchInputClass,
  'min-[640px]:w-auto min-[640px]:min-w-[220px] min-[640px]:max-w-[300px] min-[640px]:flex-[1_1_240px]',
)

export const bankToolbarSelectClass = cn(
  controlBoxClass,
  'w-auto max-w-full shrink-0 field-sizing-content',
  'pl-3 pr-7 text-sm leading-10 text-foreground outline-none cursor-pointer transition-colors focus:border-primary/25',
)

export const bankToolbarButtonClass = cn(
  controlButtonClass,
  'px-4 text-sm font-medium leading-normal text-foreground shadow-sm',
  'transition-colors hover:bg-background hover:border-text-muted',
  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
)

export const bankToolbarRowClass = cn(uiControlRowClass, 'mb-4')
