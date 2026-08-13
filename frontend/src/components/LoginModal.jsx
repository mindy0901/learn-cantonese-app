import { useEffect, useState } from "react";
import { useAuthError, useAuthStore, useGoogleReady } from "../store/authStore.js";
import { Button } from "./shadcn/button.jsx";
import { Input } from "./shadcn/input.jsx";
import { Label } from "./shadcn/label.jsx";
import { Alert, AlertDescription } from "./shadcn/alert.jsx";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./shadcn/dialog.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./shadcn/tabs.jsx";
import { Separator } from "./shadcn/separator.jsx";
import { Spinner } from "./shadcn/spinner.jsx";
import { GoogleIcon } from "./GoogleIcon.jsx";
import { useLocale } from "../store/localeStore.js";

export function LoginModal({ onClose }) {
    const { t } = useLocale();
    const googleReady = useGoogleReady();
    const authError = useAuthError();
    const { signInWithGoogle, signInWithPassword, signUpWithPassword, clearAuthError } = useAuthStore();

    const [mode, setMode] = useState("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [localError, setLocalError] = useState(null);

    useEffect(() => {
        clearAuthError();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const errorMessage = authError === "google_not_configured" ? t.auth.oauthNotConfigured : (authError ?? localError);

    const handleModeChange = (value) => {
        setMode(value);
        setLocalError(null);
        clearAuthError();
        setPassword("");
        setConfirmPassword("");
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!email || !password) return;
        setLoading(true);
        setLocalError(null);
        clearAuthError();
        try {
            await signInWithPassword(email, password);
            onClose();
        } catch {
            // Error is stored in the auth store → displayed via `errorMessage`
        } finally {
            setLoading(false);
        }
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        if (!email || !password || !confirmPassword) return;
        if (password !== confirmPassword) {
            setLocalError(t.auth.passwordMismatch);
            return;
        }
        setLoading(true);
        setLocalError(null);
        clearAuthError();
        try {
            await signUpWithPassword(email, password);
            onClose();
        } catch {
            // Error is stored in the auth store → displayed via `errorMessage`
        } finally {
            setLoading(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{mode === "login" ? t.auth.loginTitle : t.auth.signUpTitle}</DialogTitle>
                <DialogDescription>
                    {mode === "login" ? t.auth.loginDescription : t.auth.signUpDescription}
                </DialogDescription>
            </DialogHeader>

            <Tabs value={mode} onValueChange={handleModeChange} className="w-full">
                <TabsList className="w-full">
                    <TabsTrigger value="login" className="flex-1">
                        {t.auth.login}
                    </TabsTrigger>
                    <TabsTrigger value="signup" className="flex-1">
                        {t.auth.signUp}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="pt-4">
                    <form onSubmit={handleLogin} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="login-email">{t.auth.email}</Label>
                            <Input
                                id="login-email"
                                type="text"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                autoComplete="email"
                                autoFocus
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="login-password">{t.auth.password}</Label>
                            <Input
                                id="login-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                required
                            />
                        </div>
                        {errorMessage && (
                            <Alert variant="destructive">
                                <AlertDescription>{errorMessage}</AlertDescription>
                            </Alert>
                        )}
                        <Button type="submit" disabled={loading || !email || !password}>
                            {loading && <Spinner data-icon="inline-start" />}
                            {loading ? t.auth.signingIn : t.auth.signIn}
                        </Button>
                    </form>
                </TabsContent>

                <TabsContent value="signup" className="pt-4">
                    <form onSubmit={handleSignUp} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="signup-email">{t.auth.email}</Label>
                            <Input
                                id="signup-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                autoComplete="email"
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="signup-password">{t.auth.password}</Label>
                            <Input
                                id="signup-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="signup-confirm">{t.auth.confirmPassword}</Label>
                            <Input
                                id="signup-confirm"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                required
                            />
                        </div>
                        {errorMessage && (
                            <Alert variant="destructive">
                                <AlertDescription>{errorMessage}</AlertDescription>
                            </Alert>
                        )}
                        <Button type="submit" disabled={loading || !email || !password || !confirmPassword}>
                            {loading && <Spinner data-icon="inline-start" />}
                            {loading ? t.auth.signingUp : t.auth.signUp}
                        </Button>
                    </form>
                </TabsContent>
            </Tabs>

            <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">{t.auth.or}</span>
                <Separator className="flex-1" />
            </div>

            <Button
                type="button"
                variant="outline"
                onClick={signInWithGoogle}
                title={!googleReady ? t.auth.oauthNotConfigured : undefined}
            >
                <GoogleIcon data-icon="inline-start" />
                {t.auth.continueWithGoogle}
            </Button>
        </DialogContent>
    );
}
