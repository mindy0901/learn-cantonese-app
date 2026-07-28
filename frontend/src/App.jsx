import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate.jsx";
import { CloudGate } from "./components/CloudGate.jsx";
import { Layout } from "./components/Layout.jsx";
import { GrammarBankPage } from "./pages/GrammarBankPage.jsx";
import { SentencePatternsPage } from "./pages/SentencePatternsPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { LessonDetailPage } from "./pages/LessonDetailPage.jsx";
import { LessonEditPage } from "./pages/LessonEditPage.jsx";
import { LessonsPage } from "./pages/LessonsPage.jsx";
import { FlashcardPage } from "./pages/FlashcardPage.jsx";
import { HanCharactersPage } from "./pages/HanCharactersPage.jsx";
import { HanCharacterDetailPage } from "./pages/HanCharacterDetailPage.jsx";
import { WordBankPage } from "./pages/WordBankPage.jsx";
import { WordDetailPage } from "./pages/WordDetailPage.jsx";
import { ErrorPage } from "./pages/ErrorPage.jsx";

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
                            <Route path="lessons" element={<LessonsPage />} />
                            <Route path="lessons/new" element={<LessonEditPage />} />
                            <Route path="lessons/:id/edit" element={<LessonEditPage />} />
                            <Route path="lessons/:id" element={<LessonDetailPage />} />
                            <Route path="han-characters" element={<HanCharactersPage />} />
                            <Route path="han-characters/:id" element={<HanCharacterDetailPage />} />
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
