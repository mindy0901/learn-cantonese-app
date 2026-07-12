import { useUiStore } from '../store/uiStore.js'
import { useLocale } from '../store/localeStore.js'
import { uiIconButtonClass } from './ui/controlStyles.js'

export function UiSettings() {
  const { t } = useLocale()
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)

  return (
    <button
      type="button"
      className={uiIconButtonClass}
      onClick={toggleTheme}
      title={theme === 'dark' ? t.settings.themeLight : t.settings.theme}
      aria-label={theme === 'dark' ? t.settings.themeLight : t.settings.theme}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
