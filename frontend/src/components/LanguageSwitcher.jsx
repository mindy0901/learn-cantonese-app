import { Languages } from "lucide-react";
import { useLocale } from "../store/localeStore.js";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "./shadcn/select.jsx";

/**
 * App language switcher (Tiếng Việt / English). Defaults to Vietnamese,
 * persists the choice in localStorage via localeStore.
 */
export function LanguageSwitcher() {
    const { t, locale, setLocale } = useLocale();

    return (
        <Select value={locale} onValueChange={(value) => setLocale(value)}>
            <SelectTrigger
                className="w-auto gap-1.5 px-2.5 text-sm"
                aria-label={t.settings.language || "Language"}
                title={t.settings.language || "Language"}
            >
                <Languages data-icon="inline-start" />
                <span className="uppercase tracking-wide text-xs font-semibold">{locale}</span>
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <SelectItem value="vi">{t.lang.vi}</SelectItem>
                    <SelectItem value="en">{t.lang.en}</SelectItem>
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}
