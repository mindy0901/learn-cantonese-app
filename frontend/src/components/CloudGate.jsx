import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, useOutletContext } from "react-router-dom";
import { BtnSpinner } from "./LoadingButton.jsx";
import { useAppActions, useDataError, useDataHydrated, useDataLoading } from "../store/appStore.js";
import { useAuthInitialized } from "../store/authStore.js";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";

const pageClass = "flex-1 w-full px-5 py-8 pb-12";

const emptyStateClass = "text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4";

export function CloudGate() {
    const layoutContext = useOutletContext();
    const navigate = useNavigate();
    const { t } = useLocale();
    const authInitialized = useAuthInitialized();
    const dataLoading = useDataLoading();
    const dataError = useDataError();
    const hydrated = useDataHydrated();
    const { hydrateFromCloud } = useAppActions();

    // Animated progress 0→90% while loading, then finish to 100%
    const [progress, setProgress] = useState(0);
    const progressRef = useRef(0);
    const [showLoading, setShowLoading] = useState(true);
    const progressDoneRef = useRef(false);
    const finishTimerRef = useRef(null);

    useEffect(() => {
        if (!authInitialized || hydrated || dataError) return;
        hydrateFromCloud().catch(() => {});
    }, [authInitialized, hydrated, dataLoading, dataError, hydrateFromCloud]);

    // Animate progress bar while loading
    useEffect(() => {
        if (!dataLoading) {
            if (hydrated && !progressDoneRef.current) {
                progressDoneRef.current = true;
                // Smooth finish: animate current → 100% over 300ms
                const startP = progressRef.current;
                const startT = Date.now();
                const finish = setInterval(() => {
                    const elapsed = Date.now() - startT;
                    const p = Math.min(100, Math.round(startP + (100 - startP) * Math.min(1, elapsed / 300)));
                    setProgress(p);
                    progressRef.current = p;
                    if (p >= 100) {
                        clearInterval(finish);
                        finishTimerRef.current = setTimeout(() => setShowLoading(false), 250);
                    }
                }, 30);
                return () => {
                    clearInterval(finish);
                    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
                };
            }
            return;
        }
        clearTimeout(finishTimerRef.current);
        progressDoneRef.current = false;
        setShowLoading(true);
        progressRef.current = 0;
        setProgress(0);
        const start = Date.now();
        const timer = setInterval(() => {
            const elapsed = Date.now() - start;
            const p = Math.min(90, Math.round(90 * (1 - Math.exp(-elapsed / 2000))));
            setProgress(p);
            progressRef.current = p;
        }, 80);
        return () => clearInterval(timer);
    }, [dataLoading, hydrated]);

    // Redirect to error page on fetch failure
    useEffect(() => {
        if (dataError) {
            navigate("/error", { replace: true });
        }
    }, [dataError, navigate]);

    if (!authInitialized || !hydrated || showLoading) {
        return (
            <div className={cn(pageClass, emptyStateClass)} role="status" aria-live="polite" aria-busy="true">
                <div className="flex flex-col items-center gap-4 w-full max-w-xs">
                    <p className="inline-flex items-center gap-2">
                        <BtnSpinner /> {t.data.loading}
                    </p>
                    <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                        <div
                            className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${Math.max(1, progress)}%` }}
                        />
                    </div>
                    <span className="text-xs font-mono tabular-nums text-text-muted">{progress}%</span>
                </div>
            </div>
        );
    }

    if (dataError) {
        return null;
    }

    return <Outlet context={layoutContext} />;
}
