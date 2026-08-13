import { Component, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import App from "./App.jsx";
import { useAuthStore } from "./store/authStore.js";
import { logError } from "./lib/actionLog.js";

function showBootError(message) {
    const root = document.getElementById("root");
    if (!root) return;
    root.innerHTML = `<pre style="margin:0;padding:2rem;font:14px/1.5 system-ui,sans-serif;color:#fca5a5;background:#0f172a;min-height:100vh;white-space:pre-wrap">${message}</pre>`;
}

/** True once React has mounted — after that, global errors only get logged
 *  (never nuke the whole UI, e.g. a dev-only HMR websocket rejection). */
let appMounted = false;

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        logError("Lỗi render ứng dụng", error?.message ?? error);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="min-h-dvh bg-background p-8 text-destructive">
                    <h1 className="m-0 mb-3 text-lg font-semibold text-foreground">Ứng dụng không thể hiển thị</h1>
                    <pre className="m-0 whitespace-pre-wrap text-sm">{this.state.error.message}</pre>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{ marginTop: "1rem", padding: "0.5rem 1rem", cursor: "pointer" }}
                    >
                        Tải lại trang
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

function Root() {
    const init = useAuthStore((s) => s.init);

    useEffect(() => {
        init().catch(() => {});
    }, [init]);

    return <App />;
}

// Only show the boot error screen while React hasn't mounted yet — at that
// point there is nothing else to display. Once the app is up, global errors
// are logged (not displayed), and dev-only HMR/websocket rejections are
// ignored so they can't blank out the page.
window.addEventListener("error", (event) => {
    if (!appMounted) {
        showBootError(`Lỗi JavaScript:\n${event.message}`);
        return;
    }
    logError("Lỗi JavaScript", event.message);
});

window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "Lỗi không xác định");
    // Ignore dev-server HMR/websocket noise — not a real app failure.
    if (/WebSocket|websocket|HMR|vite/i.test(reason)) {
        logError("HMR/WebSocket (bỏ qua)", reason);
        return;
    }
    if (!appMounted) {
        showBootError(`Lỗi promise chưa xử lý:\n${reason}`);
        return;
    }
    logError("Lỗi promise chưa xử lý", reason);
});

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Thiếu phần tử #root");
}

createRoot(mount).render(
    <ErrorBoundary>
        <Root />
    </ErrorBoundary>,
);
appMounted = true;
