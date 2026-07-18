import { Component, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { useAuthStore } from "./store/authStore.js";
import { logError } from "./lib/actionLog.js";

function showBootError(message) {
    const root = document.getElementById("root");
    if (!root) return;
    root.innerHTML = `<pre style="margin:0;padding:2rem;font:14px/1.5 system-ui,sans-serif;color:#fca5a5;background:#0f172a;min-height:100vh;white-space:pre-wrap">${message}</pre>`;
}

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        logError("App render error", error?.message ?? error);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="min-h-dvh bg-bg p-8 text-error-text">
                    <h1 className="m-0 mb-3 text-lg font-semibold text-text-h">App failed to render</h1>
                    <pre className="m-0 whitespace-pre-wrap text-sm">{this.state.error.message}</pre>
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

window.addEventListener("error", (event) => {
    showBootError(`JavaScript error:\n${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "Unknown error");
    showBootError(`Unhandled promise rejection:\n${reason}`);
});

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Missing #root element");
}

createRoot(mount).render(
    <ErrorBoundary>
        <Root />
    </ErrorBoundary>,
);
