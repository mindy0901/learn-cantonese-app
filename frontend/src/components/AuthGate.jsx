// AuthGate giữ vai trò passthrough (không bọc UI), nhưng NẮM bootstrap dữ liệu + gỡ
// spinner tĩnh của lần tải đầu — vì nó luôn mount ở mọi route (kể cả /error, 404).
// ⚠️ 2026-09-20: bỏ checklist overlay trong CloudGate ⇒ lần tải đầu chỉ còn 1 màn loading
// (`#boot-fallback` trong index.html).
import { useEffect } from "react";
import { useAuthInitialized } from "../store/authStore.js";
import { useAppActions, useDataError, useDataHydrated } from "../store/appStore.js";

/** Gỡ spinner tĩnh trong `index.html` (`#boot-fallback`) — lộ app ra. */
export function removeBootFallback() {
    document.getElementById("boot-fallback")?.remove();
}

export function AuthGate({ children }) {
    const authInitialized = useAuthInitialized();
    const dataError = useDataError();
    const hydrated = useDataHydrated();
    const { hydrateFromCloud } = useAppActions();

    useEffect(() => {
        if (!authInitialized || hydrated || dataError) return;
        hydrateFromCloud().catch(() => {});
    }, [authInitialized, hydrated, dataError, hydrateFromCloud]);

    // Xong (hoặc lỗi) → gỡ spinner tĩnh để lộ app.
    useEffect(() => {
        if (authInitialized && (hydrated || dataError)) removeBootFallback();
    }, [authInitialized, hydrated, dataError]);

    return children;
}
