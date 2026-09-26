import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useDataError, useDataHydrated } from "../store/appStore.js";
import { useAuthInitialized, useIsAdmin } from "../store/authStore.js";

/**
 * Gate cho các route của app (navbar + page).
 *
 * ⚠️ 2026-09-20: BỎ checklist overlay (màn loading thứ 2). Giờ chỉ có 1 loader duy nhất =
 * spinner tĩnh `#boot-fallback` (index.html) cho tới khi dữ liệu sẵn sàng; AuthGate gỡ nó ra.
 *  - Lần tải đầu (chưa auth/xong data) → render `null`: spinner tĩnh vẫn phủ toàn màn hình.
 *  - Đổi mode học (dataLoading nhưng đã hydrated) → render page (GIỮ page đang xem, không overlay).
 */
export function CloudGate() {
    const navigate = useNavigate();
    const isAdmin = useIsAdmin();
    const authInitialized = useAuthInitialized();
    const dataError = useDataError();
    const hydrated = useDataHydrated();

    // Redirect to error page on fetch failure
    useEffect(() => {
        if (dataError) {
            navigate("/error", { replace: true });
        }
    }, [dataError, navigate]);

    if (!authInitialized || !hydrated || dataError) {
        return null;
    }

    return <Outlet context={{ isAdmin }} />;
}
