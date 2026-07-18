import { cn } from '../lib/cn.js'
import { useFontSizeStore, FONT_SIZES } from '../store/fontSizeStore.js'

const SIZE_LABELS = {
  sm: 'A',
  md: 'A',
  lg: 'A',
}

const sizeScale = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}

export function FontSizeSwitcher() {
  const { fontSize, setFontSize } = useFontSizeStore()

  const cycle = () => {
    const idx = FONT_SIZES.indexOf(fontSize)
    const next = FONT_SIZES[(idx + 1) % FONT_SIZES.length]
    setFontSize(next)
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        'inline-flex items-center justify-center size-9 rounded-lg border border-border bg-surface text-text-muted transition-colors duration-150 cursor-pointer',
        'hover:border-accent-border hover:text-accent',
        sizeScale[fontSize],
        fontSize !== 'sm' && 'font-bold text-accent',
      )}
      title={`Font: ${fontSize === 'sm' ? 'Nhỏ' : fontSize === 'md' ? 'Vừa' : 'Lớn'}`}
      aria-label={`Font size: ${fontSize}`}
    >
      {SIZE_LABELS[fontSize]}
    </button>
  )
}
