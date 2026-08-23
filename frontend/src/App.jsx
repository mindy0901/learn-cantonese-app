import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthGate } from "./components/AuthGate.jsx";
import { CloudGate } from "./components/CloudGate.jsx";
import { Layout } from "./components/Layout.jsx";
import { GrammarBankPage } from "./pages/GrammarBankPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { FlashcardPage } from "./pages/FlashcardPage.jsx";
import { HanCharactersPage } from "./pages/HanCharactersPage.jsx";
import { HanCharacterDetailPage } from "./pages/HanCharacterDetailPage.jsx";
import { RadicalsPage } from "./pages/RadicalsPage.jsx";
import { PinyinTablePage } from "./pages/PinyinTablePage.jsx";
import { JyutpingChartPage } from "./pages/JyutpingChartPage.jsx";
import { PronunciationTablesPage } from "./pages/PronunciationTablesPage.jsx";
import { ThemePage } from "./pages/ThemePage.jsx";
import { WordBankPage } from "./pages/WordBankPage.jsx";
import { WordDetailPage } from "./pages/WordDetailPage.jsx";
import { ErrorPage } from "./pages/ErrorPage.jsx";
import { useIsAdmin } from "./store/authStore.js";
import { useLanguage } from "./store/appStore.js";
import { languageRoutePrefix } from "./lib/wordRoutes.js";

function RequireAdmin({ children }) {
    const isAdmin = useIsAdmin();
    if (!isAdmin) return <Navigate to="/" replace />;
    return children;
}

/** Redirect route cũ (/vocabulary...) → route có prefix ngôn ngữ active (2026-08-22). */
function LanguageRedirect({ to }) {
    const language = useLanguage();
    const params = useParams();
    const p = languageRoutePrefix(language);
    if (to === "bank") return <Navigate to={`/${p}/vocabulary`} replace />;
    if (to === "detail")
        return <Navigate to={`/${p}/vocabulary/${encodeURIComponent(String(params.han ?? ""))}`} replace />;
    return <Navigate to={`/${p}/jyutping`} replace />;
}

function App() {
    return (
        <BrowserRouter>
            <AuthGate>
                <Routes>
                    <Route path="error" element={<ErrorPage />} />
                    <Route path="*" element={<ErrorPage />} />
                    {/* CloudGate renders the loading screen WITHOUT the navbar;
                        once hydrated it renders Layout (navbar) + the page. */}
                    <Route element={<CloudGate />}>
                        <Route element={<Layout />}>
                            <Route index element={<HomePage />} />
                            {/* Ngôn ngữ-tách (route-driven — KHÔNG còn mode toggle) (2026-08-22) */}
                            <Route path="c/vocabulary" element={<WordBankPage />} />
                            <Route path="m/vocabulary" element={<WordBankPage />} />
                            <Route path="c/vocabulary/:han" element={<WordDetailPage />} />
                            <Route path="m/vocabulary/:han" element={<WordDetailPage />} />
                            <Route path="c/jyutping" element={<JyutpingChartPage />} />
                            <Route path="m/pinyin" element={<PinyinTablePage />} />
                            {/* Redirect route cũ → ngôn ngữ active */}
                            <Route path="vocabulary" element={<LanguageRedirect to="bank" />} />
                            <Route path="vocabulary/:han" element={<LanguageRedirect to="detail" />} />
                            <Route path="pinyin" element={<Navigate to="/m/pinyin" replace />} />
                            <Route path="jyutping" element={<Navigate to="/c/jyutping" replace />} />
                            <Route path="pronunciation" element={<PronunciationTablesPage />} />
                            <Route path="grammar" element={<GrammarBankPage />} />
                            <Route path="radicals" element={<RadicalsPage />} />
                            <Route path="theme" element={<ThemePage />} />
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
