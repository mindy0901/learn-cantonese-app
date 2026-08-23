import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Spinner } from "./shadcn/spinner.jsx";
import { useAppActions, useDataError, useDataHydrated, useDataLoading, useDataLoadingStep } from "../store/appStore.js";
import { useAuthInitialized, useIsAdmin } from "../store/authStore.js";
import { useLocale } from "../store/localeStore.js";

export function CloudGate() {
    const navigate = useNavigate();
    const { t } = useLocale();
    const isAdmin = useIsAdmin();
    const authInitialized = useAuthInitialized();
    const dataLoading = useDataLoading();
    const dataError = useDataError();
    const hydrated = useDataHydrated();
    const dataLoadingStep = useDataLoadingStep();
    const { hydrateFromCloud } = useAppActions();

    const [showLoading, setShowLoading] = useState(true);
    const finishTimerRef = useRef(null);

    useEffect(() => {
        if (!authInitialized || hydrated || dataError) return;
        hydrateFromCloud().catch(() => {});
    }, [authInitialized, hydrated, dataLoading, dataError, hydrateFromCloud]);

    // Once hydration finishes, keep the "all done ✓" checklist visible briefly
    // before fading the overlay away so users can see the steps complete.
    useEffect(() => {
        if (hydrated) {
            clearTimeout(finishTimerRef.current);
            finishTimerRef.current = setTimeout(() => setShowLoading(false), 500);
        }
        return () => clearTimeout(finishTimerRef.current);
    }, [hydrated]);

    // Redirect to error page on fetch failure
    useEffect(() => {
        if (dataError) {
            navigate("/error", { replace: true });
        }
    }, [dataError, navigate]);

    if (!authInitialized || !hydrated || showLoading || dataLoading) {
        // Full-screen overlay covering everything (incl. navbar) so no
        // interaction is possible during the initial load / hard refresh
        // AND khi đổi mode học (dataLoading).
        // - Load đầu: checklist đầy đủ 4 bước (checking-user → indexing).
        // - Đổi mode: CHỈ hiện bước loading-data (không check/pending giả —
        //   các bước khác không chạy trong flow này).
        const isModeSwitch = dataLoading && hydrated;
        const steps = isModeSwitch
            ? [{ key: "loading-data", label: t.data.stepLoadingData }]
            : [
                  { key: "checking-user", label: t.data.stepCheckingUser },
                  { key: "loading-data", label: t.data.stepLoadingData },
                  { key: "saving-cache", label: t.data.stepSavingCache },
                  { key: "indexing", label: t.data.stepIndexing },
              ];
        const activeStep = isModeSwitch
            ? "loading-data"
            : !authInitialized
              ? "checking-user"
              : dataLoadingStep || "loading-data";
        // When loading finished, mark every step as done (✓) so users see the
        // full checklist complete before the overlay fades away.
        const activeIdx = activeStep === "done" ? steps.length : steps.findIndex((s) => s.key === activeStep);
        return (
            <div
                className="fixed inset-0 z-100 flex items-center justify-center p-8 px-6"
                role="status"
                aria-live="polite"
                aria-busy="true"
            >
                <ul className="flex list-none flex-col items-center gap-2 text-sm">
                    {steps.map((step, i) => {
                        const state = i < activeIdx ? "done" : i === activeIdx ? "active" : "pending";
                        return (
                            <li key={step.key} className="flex items-center gap-2">
                                <span className="flex size-4 items-center justify-center" aria-hidden="true">
                                    {state === "done" && <span className="text-primary">✓</span>}
                                    {state === "active" && <Spinner className="size-3.5 text-primary" />}
                                    {state === "pending" && (
                                        <span className="size-2 rounded-full bg-muted-foreground/30" />
                                    )}
                                </span>
                                <span
                                    className={
                                        state === "active"
                                            ? "text-foreground"
                                            : state === "done"
                                              ? "text-muted-foreground"
                                              : "text-muted-foreground/60"
                                    }
                                >
                                    {step.label}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    if (dataError) {
        return null;
    }

    return <Outlet context={{ isAdmin }} />;
}
