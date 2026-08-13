import { Link } from "react-router-dom";
import {
    useVocabularyCount,
    useMasteredVocabularyCount,
    useGrammarCount,
    useSentenceCount,
} from "../store/appStore.js";
import { useLocale } from "../store/localeStore.js";
import { FlashcardStatsPanel } from "../components/FlashcardStatsPanel.jsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/shadcn/card.jsx";
import { IconWordBank, IconGrammar, IconSentences, IconFlashcard } from "../components/NavIcons.jsx";

export function HomePage() {
    const wordCount = useVocabularyCount();
    const masteredCount = useMasteredVocabularyCount();
    const grammarCount = useGrammarCount();
    const sentenceCount = useSentenceCount();
    const { t, fmt } = useLocale();
    const remaining = wordCount - masteredCount;

    const quickLinks = [
        {
            to: "/vocabulary",
            icon: IconWordBank,
            title: t.home.goWordBank,
            meta: fmt(t.home.wordCountMeta, { count: wordCount }),
        },
        {
            to: "/grammar",
            icon: IconGrammar,
            title: t.home.goGrammar,
            meta: fmt(t.home.grammarCountMeta, { count: grammarCount }),
        },
        {
            to: "/sentences",
            icon: IconSentences,
            title: t.nav.sentenceBank,
            meta: `${sentenceCount} ${t.nav.sentenceBank.toLowerCase()}`,
        },
        {
            to: "/flashcard",
            icon: IconFlashcard,
            title: t.home.goFlashcard,
            meta: fmt(t.home.flashcardMeta, { remaining }),
        },
    ];

    const libGroups = [
        {
            title: t.techStack.frontend,
            libs: [
                ["React", t.techStack.react],
                ["React Router", t.techStack.reactRouter],
                ["Zustand", t.techStack.zustand],
                ["Tailwind CSS", t.techStack.tailwind],
                ["tailwind-merge + clsx", t.techStack.classUtils],
                ["Vite", t.techStack.vite],
                ["react-markdown + remark-gfm", t.techStack.markdown],
                ["oxlint", t.techStack.oxlint],
            ],
        },
        {
            title: t.techStack.backend,
            libs: [
                ["Fastify", t.techStack.fastify],
                ["@fastify/session + cookie", t.techStack.session],
                ["@fastify/cors + formbody", t.techStack.cors],
                ["Prisma", t.techStack.prisma],
                ["bcryptjs", t.techStack.bcrypt],
                ["dotenv", t.techStack.dotenv],
            ],
        },
        {
            title: t.techStack.data,
            libs: [
                ["PostgreSQL", t.techStack.postgres],
                ["pg", t.techStack.pg],
                ["connect-pg-simple", t.techStack.connectPgSimple],
                ["Docker", t.techStack.docker],
                ["tsx", t.techStack.tsx],
                ["pinyin-pro", t.techStack.pinyinPro],
                ["opencc-js", t.techStack.opencc],
            ],
        },
    ];

    return (
        <main className="flex-1 w-full">
            <div className="w-full px-5 pb-12">
                {/* ── Stats ── */}
                <section className="mt-7 mb-7">
                    <FlashcardStatsPanel />
                </section>

                {/* ── Quick Nav ── */}
                <section className="mb-7">
                    <h2 className="mb-3 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
                        {t.home.quickNav}
                    </h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        {quickLinks.map(({ to, icon: Icon, title, meta }) => (
                            <Link key={to} to={to} className="group h-full">
                                <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
                                    <CardContent className="flex flex-col gap-2">
                                        <Icon
                                            className="text-primary transition-transform duration-200 group-hover:scale-110"
                                            size={22}
                                        />
                                        <CardTitle className="text-sm">{title}</CardTitle>
                                        <CardDescription>{meta}</CardDescription>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* ── Tech Stack ── */}
                <section className="mt-2 mb-7">
                    <h2 className="mb-1 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
                        {t.techStack.title}
                    </h2>
                    <p className="mb-4 text-sm text-muted-foreground">{t.techStack.subtitle}</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {libGroups.map((group) => (
                            <Card key={group.title}>
                                <CardHeader>
                                    <CardTitle className="text-sm">{group.title}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-2">
                                    {group.libs.map(([name, role]) => (
                                        <div key={name} className="flex flex-col">
                                            <span className="text-sm font-medium text-card-foreground">{name}</span>
                                            <span className="text-xs leading-snug text-muted-foreground">{role}</span>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}
