import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthGate } from "./components/AuthGate.jsx";
import { CloudGate } from "./components/CloudGate.jsx";
import { Layout } from "./components/Layout.jsx";
import { GrammarBankPage } from "./pages/GrammarBankPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { FlashcardPage } from "./pages/FlashcardPage.jsx";
import { RadicalsPage } from "./pages/RadicalsPage.jsx";
import { MandarinPinyinTablePage } from "./pages/MandarinPinyinTablePage.jsx";
import { CantoneseJyutpingTablePage } from "./pages/CantoneseJyutpingTablePage.jsx";
import { PronunciationTablesPage } from "./pages/PronunciationTablesPage.jsx";
import { ProfilePage } from "./pages/ProfilePage.jsx";
import { ThemePage } from "./pages/ThemePage.jsx";
import { VocabularyBankPage } from "./pages/VocabularyBankPage.jsx";
import { VocabularyDetailPage } from "./pages/VocabularyDetailPage.jsx";
import { ErrorPage } from "./pages/ErrorPage.jsx";
import { useLanguage } from "./store/appStore.js";
import { languageRoutePrefix } from "./lib/wordRoutes.js";

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
                            <Route path="c/vocabulary" element={<VocabularyBankPage />} />
                            <Route path="m/vocabulary" element={<VocabularyBankPage />} />
                            <Route path="c/vocabulary/:han" element={<VocabularyDetailPage />} />
                            <Route path="m/vocabulary/:han" element={<VocabularyDetailPage />} />
                            <Route path="c/jyutping" element={<CantoneseJyutpingTablePage />} />
                            <Route path="m/pinyin" element={<MandarinPinyinTablePage />} />
                            {/* Redirect route cũ → ngôn ngữ active */}
                            <Route path="vocabulary" element={<LanguageRedirect to="bank" />} />
                            <Route path="vocabulary/:han" element={<LanguageRedirect to="detail" />} />
                            <Route path="pinyin" element={<Navigate to="/m/pinyin" replace />} />
                            <Route path="jyutping" element={<Navigate to="/c/jyutping" replace />} />
                            <Route path="pronunciation" element={<PronunciationTablesPage />} />
                            <Route path="grammar" element={<GrammarBankPage />} />
                            <Route path="radicals" element={<RadicalsPage />} />
                            <Route path="theme" element={<ThemePage />} />
                            <Route path="profile" element={<ProfilePage />} />
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
