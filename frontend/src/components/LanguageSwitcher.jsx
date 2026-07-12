import { useLocale } from '../store/localeStore.js'
import { LOCALE_LABELS } from '../i18n/types.js'
import { uiSelectClass } from './ui/controlStyles.js'

const LOCALES = ['en', 'vi', 'zh-CN', 'zh-TW']

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()

  return (
    <select
      className={uiSelectClass}
      value={locale}
      onChange={(e) => setLocale(e.target.value)}
      aria-label="Language"
    >
      {LOCALES.map((loc) => (
        <option key={loc} value={loc}>
          {LOCALE_LABELS[loc]}
        </option>
      ))}
    </select>
  )
}
