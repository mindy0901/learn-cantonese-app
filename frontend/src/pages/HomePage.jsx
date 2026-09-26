import { Link } from "react-router-dom";
import { useVocabularyCount, useMasteredVocabularyCount, useGrammarCount } from "../store/appStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { useLocale } from "../store/localeStore.js";
import { vocabularyBankPath } from "../lib/wordRoutes.js";
import { FlashcardStatsPanel } from "../components/FlashcardStatsPanel.jsx";
import { CheckinCalendar } from "../components/CheckinCalendar.jsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/shadcn/card.jsx";
import { IconWordBank, IconGrammar, IconFlashcard } from "../components/NavIcons.jsx";

export function HomePage() {
    const wordCount = useVocabularyCount();
    const masteredCount = useMasteredVocabularyCount();
    const grammarCount = useGrammarCount();
    const signedIn = useIsSignedIn();
    const { t, fmt } = useLocale();
    const remaining = wordCount - masteredCount;

    return (
        <main className="flex-1 w-full">
            <div className="w-full px-5 pb-12">
                {/* ── Stats — CHỈ hiện khi đã đăng nhập (2026-09-02) ── */}
                {signedIn && (
                    <section className="mt-7 mb-7">
                        <FlashcardStatsPanel />
                    </section>
                )}

                {/* ── Check-in calendar (2026-08-24) ── */}
                <section className="mb-7">
                    <CheckinCalendar className="max-w-md" />
                </section>
            </div>
        </main>
    );
}
