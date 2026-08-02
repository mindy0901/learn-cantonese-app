import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate.jsx";
import { CloudGate } from "./components/CloudGate.jsx";
import { Layout } from "./components/Layout.jsx";
import { GrammarBankPage } from "./pages/GrammarBankPage.jsx";
import { SentencePatternsPage } from "./pages/SentencePatternsPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { FlashcardPage } from "./pages/FlashcardPage.jsx";
import { HanCharactersPage } from "./pages/HanCharactersPage.jsx";
import { HanCharacterDetailPage } from "./pages/HanCharacterDetailPage.jsx";
import { WordBankPage } from "./pages/WordBankPage.jsx";
import { WordDetailPage } from "./pages/WordDetailPage.jsx";
import { ErrorPage } from "./pages/ErrorPage.jsx";
import { useIsAdmin } from "./store/authStore.js";

function RequireAdmin({ children }) {
    const isAdmin = useIsAdmin();
    if (!isAdmin) return <Navigate to="/" replace />;
    return children;
}

function App() {
    return (
        <BrowserRouter>
            <AuthGate>
                <Routes>
                    <Route element={<Layout />}>
                        <Route path="error" element={<ErrorPage />} />
                        <Route element={<CloudGate />}>
                            <Route index element={<HomePage />} />
                            <Route path="vocabulary" element={<WordBankPage />} />
                            <Route path="vocabulary/:id" element={<WordDetailPage />} />
                            <Route path="grammar" element={<GrammarBankPage />} />
                            <Route path="sentences" element={<SentencePatternsPage />} />
                            <Route
                                path="han-characters"
                                element={
                                    <RequireAdmin>
                                        <HanCharactersPage />
                                    </RequireAdmin>
                                }
                            />
                            <Route
                                path="han-characters/:id"
                                element={
                                    <RequireAdmin>
                                        <HanCharacterDetailPage />
                                    </RequireAdmin>
                                }
                            />
                            <Route path="flashcard" element={<FlashcardPage />} />
                            <Route path="study" element={<Navigate to="/flashcard" replace />} />
                        </Route>
                    </Route>
                </Routes>
            </AuthGate>
        </BrowserRouter>
    );
}

export default App;
