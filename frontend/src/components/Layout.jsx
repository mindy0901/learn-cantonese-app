import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { UiSettings } from "./UiSettings.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";
import { UserMenu } from "./UserMenu.jsx";
import { useIsAdmin } from "../store/authStore.js";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import {
    IconWordBank,
    IconGrammar,
    IconSentences,
    IconFlashcard,
    IconHanChars,
    IconRadicals,
    IconPinyin,
    IconJyutping,
    IconMenu,
    IconClose,
} from "./NavIcons.jsx";

const navLinkClass = ({ isActive, isExternal = false }) =>
    cn(
        "flex items-center gap-1.5 px-3.5 py-2 rounded-lg no-underline text-muted-foreground text-sm font-medium transition-colors duration-150 hover:bg-muted hover:text-foreground",
        isActive && "bg-muted text-foreground",
        isExternal && "after:content-['↗'] after:text-[0.6875rem] after:opacity-65",
    );

/**
 * App navbar — adapted from Tailwind's "Header · With call-to-action"
 * (https://tailwindcss.com/plus/ui-blocks/marketing/elements/headers), mapped to
 * the app's design tokens. Three zones: brand | centered nav | actions (+ CTA).
 */
export function Layout() {
    const { t } = useLocale();
    const isAdmin = useIsAdmin();
    const [mobileOpen, setMobileOpen] = useState(false);

    const navItems = [
        { to: "/vocabulary", label: t.nav.wordBank, Icon: IconWordBank },
        { to: "/radicals", label: t.nav.radicals, Icon: IconRadicals },
        { to: "/pinyin", label: t.nav.pinyinTable, Icon: IconPinyin },
        { to: "/jyutping", label: t.nav.jyutpingTable, Icon: IconJyutping },
        { to: "/grammar", label: t.nav.grammarBank, Icon: IconGrammar },
        { to: "/sentences", label: t.nav.sentenceBank, Icon: IconSentences },
        { to: "/flashcard", label: t.nav.flashcard, Icon: IconFlashcard },
        ...(isAdmin ? [{ to: "/han-characters", label: t.nav.hanCharacters, Icon: IconHanChars }] : []),
    ];

    return (
        <div className="min-h-svh flex flex-col">
            <header className="sticky top-0 z-20 border-b border-border bg-background">
                <nav
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"
                    aria-label={t.common.main}
                >
                    {/* Left: brand */}
                    <div className="flex lg:flex-1">
                        <Link to="/" className="flex items-center gap-2.5 no-underline text-foreground">
                            <span
                                className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-base font-bold text-primary-foreground"
                                aria-hidden="true"
                            >
                                粵
                            </span>
                            <span className="hidden flex-col leading-[1.15] sm:flex">
                                <span className="text-[1.0625rem] font-bold tracking-tight text-foreground">
                                    {t.brand}
                                </span>
                                <span className="text-[0.6875rem] font-medium tracking-wide uppercase text-muted-foreground">
                                    {t.brandTagline}
                                </span>
                            </span>
                        </Link>
                    </div>

                    {/* Center: nav links (desktop) */}
                    <div className="hidden gap-1 lg:flex">
                        {navItems.map(({ to, label, Icon }) => (
                            <NavLink key={to} to={to} className={({ isActive }) => navLinkClass({ isActive })}>
                                <Icon /> {label}
                            </NavLink>
                        ))}
                    </div>

                    {/* Right: actions + mobile menu toggle */}
                    <div className="flex items-center justify-end gap-2 lg:flex-1">
                        <UiSettings />
                        <LanguageSwitcher />
                        <UserMenu />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="lg:hidden"
                            onClick={() => setMobileOpen((v) => !v)}
                            aria-label={t.common.toggleNav}
                            aria-expanded={mobileOpen}
                        >
                            {mobileOpen ? <IconClose /> : <IconMenu />}
                        </Button>
                    </div>
                </nav>

                {/* Mobile nav panel */}
                {mobileOpen && (
                    <div className="border-t border-border bg-background px-4 py-3 lg:hidden">
                        <div className="mx-auto flex w-full max-w-7xl flex-col gap-1">
                            {navItems.map(({ to, label, Icon }) => (
                                <NavLink
                                    key={to}
                                    to={to}
                                    onClick={() => setMobileOpen(false)}
                                    className={({ isActive }) => navLinkClass({ isActive })}
                                >
                                    <Icon /> {label}
                                </NavLink>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            <Outlet context={{ isAdmin }} />
        </div>
    );
}
