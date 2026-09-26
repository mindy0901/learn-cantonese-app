import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderCog, UserRound } from "lucide-react";
import { useAuthSigningOut, useAuthStore, useAuthUser } from "../store/authStore.js";
import { useUiStore } from "../store/uiStore.js";
import { Button } from "./shadcn/button.jsx";
import { Dialog, DialogTrigger } from "./shadcn/dialog.jsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./shadcn/dropdown-menu.jsx";
import { LoginModal } from "./LoginModal.jsx";
import { useLocale } from "../store/localeStore.js";

export function UserMenu() {
    const { t } = useLocale();
    const user = useAuthUser();
    const signingOut = useAuthSigningOut();
    const { signOut, clearAuthError } = useAuthStore();
    const setVocabSetsManagerOpen = useUiStore((s) => s.setVocabSetsManagerOpen);
    const navigate = useNavigate();

    const [loginOpen, setLoginOpen] = useState(false);

    if (!user) {
        return (
            <Dialog
                open={loginOpen}
                onOpenChange={(open) => {
                    if (open) clearAuthError();
                    setLoginOpen(open);
                }}
            >
                <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
                    {t.auth.login}
                </DialogTrigger>
                <LoginModal onClose={() => setLoginOpen(false)} />
            </Dialog>
        );
    }

    const initial = (user.name ?? user.email ?? "?").charAt(0).toUpperCase();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="flex max-w-48 items-center gap-2 rounded-full border border-border bg-card py-1 pr-2 pl-1 text-[0.8125rem] text-card-foreground cursor-pointer hover:bg-primary/10"
                title={user.email ?? user.name}
            >
                {user.picture ? (
                    <img
                        className="size-7 shrink-0 rounded-full object-cover"
                        src={user.picture}
                        alt=""
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <span
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                        aria-hidden="true"
                    >
                        {initial}
                    </span>
                )}
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{user.name ?? user.email}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8}>
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="max-w-56 break-all">{user.email}</DropdownMenuLabel>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => setVocabSetsManagerOpen(true)}>
                        <FolderCog className="size-3.5 shrink-0" aria-hidden="true" />
                        {t.vocabSets.manage}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/profile")}>
                        <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                        {t.nav.profile}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        className="cursor-pointer"
                        disabled={signingOut}
                        onClick={() => {
                            signOut();
                        }}
                    >
                        {signingOut ? t.auth.signingOut : t.auth.signOut}
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
