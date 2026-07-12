import { memo } from 'react'
import { cn } from '../lib/cn.js'

export const GrammarPickerItem = memo(function GrammarPickerItem({ item, checked, onToggle }) {
  return (
    <label
      className={cn(
        'grid grid-cols-[auto_1fr_auto_auto] items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer border border-transparent hover:bg-bg',
        checked && 'bg-accent-bg border-accent-border',
      )}
    >
      <input type="checkbox" checked={checked} onChange={() => onToggle(item.id)} />
      <span className="flex items-center gap-2 min-w-0 text-sm">
        <span className="font-semibold text-text-h">{item.title}</span>
        {item.important && <span className="text-yellow-500 text-xs">★</span>}
      </span>
      {item.content && (
        <span className="text-[0.8125rem] text-text-muted text-right whitespace-nowrap max-w-64 overflow-hidden text-ellipsis">
          {item.content}
        </span>
      )}
    </label>
  )
})
