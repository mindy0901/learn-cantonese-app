// AuthGate is a passthrough: the single loading screen (auth init + data load)
// is handled by CloudGate so a hard refresh only shows one loading page.
export function AuthGate({ children }) {
    return children;
}
