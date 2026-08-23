import { useEffect, useState } from "react";
import { useLocation, Link, NavLink, Outlet } from "react-router-dom";
import { UiSettings } from "./UiSettings.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";
import { UserMenu } from "./UserMenu.jsx";
import { VocabularySetsManager } from "./VocabularySetsManager.jsx";
import { HeaderSearch } from "./HeaderSearch.jsx";
import { useUiStore } from "../store/uiStore.js";
import { useAppStore } from "../store/appStore.js";
import { useIsAdmin } from "../store/authStore.js";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import { Toaster } from "./shadcn/toast.jsx";
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
    navigationMenuTriggerStyle,
} from "./shadcn/navigation-menu.jsx";
import {
    IconWordBank,
    IconGrammar,
    IconFlashcard,
    IconHanChars,
    IconRadicals,
    IconPinyin,
    IconJyutping,
    IconMenu,
    IconClose,
    IconPalette,
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
    const vocabSetsManagerOpen = useUiStore((s) => s.vocabSetsManagerOpen);
    const setVocabSetsManagerOpen = useUiStore((s) => s.setVocabSetsManagerOpen);
    const { pathname } = useLocation();
    const setActiveLanguage = useAppStore((s) => s.setActiveLanguage);

    // Route-driven language (2026-08-22): route /c/... = Cantonese, /m/... = Mandarin.
    // KHÔNG còn nút toggle mode — ngôn ngữ active đi theo URL.
    useEffect(() => {
        if (pathname.startsWith("/m/")) setActiveLanguage("mandarin");
        else if (pathname.startsWith("/c/")) setActiveLanguage("cantonese");
    }, [pathname, setActiveLanguage]);

    // Nav — chia theo NGÔN NGỮ (Cantonese / Mandarin) + nhóm công dụng (2026-08-22):
    //   Cantonese ▾: Kho từ vựng (C), Bảng Jyutping
    //   Mandarin ▾:  Kho từ vựng (M), Bảng Pinyin
    //   Hán tự ▾:    Hán tự, 214 bộ thủ (dùng chung)
    //   Direct:      Ngữ pháp, Flashcard (dùng chung)
    //   Công cụ ▾:   Bảng màu
    const navGroups = [
        {
            key: "cantonese",
            trigger: t.nav.cantoneseGroup,
            items: [
                { to: "/c/vocabulary", label: t.nav.vocabCantonese, Icon: IconWordBank },
                { to: "/c/jyutping", label: t.nav.jyutpingTable, Icon: IconJyutping },
            ],
        },
        {
            key: "mandarin",
            trigger: t.nav.mandarinGroup,
            items: [
                { to: "/m/vocabulary", label: t.nav.vocabMandarin, Icon: IconWordBank },
                { to: "/m/pinyin", label: t.nav.pinyinTable, Icon: IconPinyin },
            ],
        },
        {
            key: "hanzi",
            trigger: t.nav.hanGroup,
            items: [
                ...(isAdmin ? [{ to: "/han-characters", label: t.nav.hanCharacters, Icon: IconHanChars }] : []),
                { to: "/radicals", label: t.nav.radicals, Icon: IconRadicals },
            ],
        },
        {
            key: "tools",
            trigger: t.nav.toolsGroup,
            items: [{ to: "/theme", label: t.nav.theme, Icon: IconPalette }],
        },
    ];
    const navDirect = [
        { to: "/grammar", label: t.nav.grammarBank, Icon: IconGrammar },
        { to: "/flashcard", label: t.nav.flashcard, Icon: IconFlashcard },
    ];
    const allNavItems = [...navGroups.flatMap((g) => g.items), ...navDirect];
    const isActiveRoute = (to) => pathname === to || pathname.startsWith(`${to}/`);

    return (
        <div className="min-h-svh flex flex-col">
            <header className="sticky top-0 z-20 border-b border-border bg-background">
                <nav
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"
                    aria-label={t.common.main}
                >
                    {/* Left: brand + nav (desktop) */}
                    <div className="flex items-center gap-3 lg:flex-1">
                        <Link to="/" className="flex items-center gap-2.5 no-underline text-foreground">
                            <span
                                className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-base font-bold text-primary-foreground"
                                aria-hidden="true"
                            >
                                粵
                            </span>
                            <span className="hidden flex-col leading-[1.15] sm:flex">
                                <span className="text-[1.0625rem] font-bold tracking-tight text-foreground">
                                    3107Hanzi
                                </span>
                            </span>
                        </Link>
                        {/* Nav links (desktop) — shadcn NavigationMenu (Base UI), dropdown theo MODE + CÔNG DỤNG */}
                        <div className="hidden lg:flex">
                            <NavigationMenu>
                                <NavigationMenuList>
                                    {navGroups.map((group) => {
                                        const groupActive = group.items.some((it) => isActiveRoute(it.to));
                                        return (
                                            <NavigationMenuItem key={group.key}>
                                                <NavigationMenuTrigger
                                                    className={cn(groupActive && "bg-muted text-foreground")}
                                                >
                                                    {group.trigger}
                                                </NavigationMenuTrigger>
                                                <NavigationMenuContent>
                                                    <ul className="grid w-60 gap-1 p-2">
                                                        {group.items.map(({ to, label, Icon }) => {
                                                            const active = isActiveRoute(to);
                                                            return (
                                                                <li key={to}>
                                                                    <NavigationMenuLink
                                                                        render={<Link to={to} />}
                                                                        data-active={active || undefined}
                                                                        className={cn(
                                                                            "gap-2.5 px-3 py-2 [&_svg]:size-5",
                                                                            active && "bg-muted text-foreground",
                                                                        )}
                                                                    >
                                                                        <Icon /> <span>{label}</span>
                                                                    </NavigationMenuLink>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </NavigationMenuContent>
                                            </NavigationMenuItem>
                                        );
                                    })}
                                    {navDirect.map(({ to, label, Icon }) => {
                                        const active = isActiveRoute(to);
                                        return (
                                            <NavigationMenuItem key={to}>
                                                <NavigationMenuLink
                                                    render={<Link to={to} />}
                                                    data-active={active || undefined}
                                                    className={cn(
                                                        navigationMenuTriggerStyle(),
                                                        "[&_svg]:size-5", // giữ icon 20px như cũ
                                                        active && "bg-muted text-foreground",
                                                    )}
                                                >
                                                    <Icon /> {label}
                                                </NavigationMenuLink>
                                            </NavigationMenuItem>
                                        );
                                    })}
                                </NavigationMenuList>
                            </NavigationMenu>
                        </div>
                    </div>

                    {/* Center: header search (hán tự) — TRÊN header, giữa nav và actions (2026-08-23).
                        Ẩn trên mobile (<md) để không tràn header — mobile dùng search trong trang kho từ. */}
                    <HeaderSearch className="mx-auto hidden w-full max-w-md md:block" />

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

                {vocabSetsManagerOpen && <VocabularySetsManager onClose={() => setVocabSetsManagerOpen(false)} />}

                {/* Mobile nav panel */}
                {mobileOpen && (
                    <div className="border-t border-border bg-background px-4 py-3 lg:hidden">
                        <div className="mx-auto flex w-full max-w-7xl flex-col gap-1">
                            {allNavItems.map(({ to, label, Icon }) => (
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
            <Toaster />
        </div>
    );
}
