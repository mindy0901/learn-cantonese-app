import { Moon, Sun } from "lucide-react";
import { useUiStore } from "../store/uiStore.js";
import { useLocale } from "../store/localeStore.js";
import { Button } from "./shadcn/button.jsx";

export function UiSettings() {
    const { t } = useLocale();
    const theme = useUiStore((s) => s.theme);
    const toggleTheme = useUiStore((s) => s.toggleTheme);

    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            title={theme === "dark" ? t.settings.themeLight : t.settings.theme}
            aria-label={theme === "dark" ? t.settings.themeLight : t.settings.theme}
        >
            {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
    );
}
