import { useMemo } from "react";
import { Heart, HeartOff, RotateCcw } from "lucide-react";
import { useLocale } from "../store/localeStore.js";
import {
    useFavoriteVocabularyIds,
    useDislikedVocabularyIds,
    useMandarinVocabularies,
    useCantoneseVocabularies,
    useAppActions,
} from "../store/appStore.js";
import { useAuthUser, useIsSignedIn } from "../store/authStore.js";
import { collectMeaningsField } from "../lib/wordNormalize.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/shadcn/card.jsx";
import { Button } from "../components/shadcn/button.jsx";
import { Skeleton } from "../components/shadcn/skeleton.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { toast } from "../components/shadcn/toast.jsx";
import { cn } from "../lib/cn.js";

/** Hán tự hiển thị theo ngôn ngữ (KHÔNG fallback chéo form — §0.1 AGENTS). */
function hanFor(word, lang) {
    return (lang === "mandarin" ? word.hanSimplified : word.hanHongKong) || "-";
}

/** Phiên âm hiển thị theo ngôn ngữ. */
function readingFor(word, lang) {
    return (lang === "mandarin" ? word.pinyin : word.jyutping) || "-";
}

/** Nghĩa tiếng Việt: ưu tiên meanings child → fallback cột phẳng (§0.1 AGENTS). */
function vietMeaningFor(word) {
    return collectMeaningsField(word.meanings, "vietMeanings") || word.vietMeanings || "-";
}

/** 1 dòng từ trong danh sách — hán tự (theo màu ngôn ngữ) + phiên âm + nghĩa + nút hành động. */
function MarkedRow({ word, lang, actionLabel, onAction, actionIcon }) {
    return (
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <span
                    className={cn(
                        "wd-han shrink-0 text-xl font-semibold",
                        lang === "mandarin" ? "text-han-simp" : "text-han-trad",
                    )}
                >
                    {hanFor(word, lang)}
                </span>
                <span className={cn("shrink-0 text-sm", lang === "mandarin" ? "text-pinyin" : "text-jyutping")}>
                    {readingFor(word, lang)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{vietMeaningFor(word)}</span>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => onAction(word, lang)}>
                {actionIcon}
                {actionLabel}
            </Button>
        </div>
    );
}

/**
 * Trang Hồ sơ (/profile) — 2026-09-20.
 * Hiện 2 danh sách đánh dấu theo user (cặp ❤️ yêu thích / 🚫 không muốn học):
 *  - 🚫 "Từ không muốn học": từ bị LOẠI khỏi flashcard random → có nút "Học lại từ này" để bỏ đánh dấu.
 *  - ❤️ "Từ yêu thích": các từ user đã đánh dấu yêu thích khi luyện flashcard.
 */
export function ProfilePage() {
    const { t, fmt } = useLocale();
    const signedIn = useIsSignedIn();
    const user = useAuthUser();
    const favoriteIds = useFavoriteVocabularyIds();
    const dislikedIds = useDislikedVocabularyIds();
    const mandarinBank = useMandarinVocabularies();
    const cantoneseBank = useCantoneseVocabularies();
    const { toggleVocabularyFavorite, toggleVocabularyDisliked } = useAppActions();

    // id → { word, lang } — 2 bank độc lập nên tra theo từng bank (id uuid unique toàn cục).
    const lookup = useMemo(() => {
        const map = new Map();
        for (const w of mandarinBank) map.set(w.id, { word: w, lang: "mandarin" });
        for (const w of cantoneseBank) map.set(w.id, { word: w, lang: "cantonese" });
        return map;
    }, [mandarinBank, cantoneseBank]);

    const dislikedRows = useMemo(() => {
        const rows = [];
        for (const id of dislikedIds) {
            const hit = lookup.get(id);
            if (hit) rows.push({ id, ...hit });
        }
        return rows;
    }, [dislikedIds, lookup]);
    const favoriteRows = useMemo(() => {
        const rows = [];
        for (const id of favoriteIds) {
            const hit = lookup.get(id);
            if (hit) rows.push({ id, ...hit });
        }
        return rows;
    }, [favoriteIds, lookup]);
    const loading = mandarinBank.length === 0 && cantoneseBank.length === 0;

    const handleRestore = (word, lang) => {
        toggleVocabularyDisliked(word.id, lang, false)
            .then(() => toast.add({ type: "success", title: t.profile.restored, duration: 2000 }))
            .catch(() => {});
    };

    const handleUnfavorite = (word, lang) => {
        toggleVocabularyFavorite(word.id, lang, false)
            .then(() => toast.add({ type: "info", title: t.wordDetail.unmarkedFavorite, duration: 2000 }))
            .catch(() => {});
    };

    if (!signedIn) {
        return (
            <main className="flex-1 w-full px-5 pt-8 pb-12">
                <EmptyState title={t.profile.title} description={t.auth.loginDescription} />
            </main>
        );
    }

    return (
        <main className="flex-1 w-full px-5 pt-8 pb-12">
            <div className="mb-6 flex flex-col gap-2">
                <h1>{t.profile.title}</h1>
                <p className="text-sm text-muted-foreground">{user?.email ?? t.profile.subtitle}</p>
            </div>

            <div className="flex flex-col gap-4">
                {/* 🚫 Không muốn học */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <HeartOff className="size-5 text-destructive" aria-hidden="true" />
                            {t.profile.dislikedTitle}
                            <span className="text-sm font-normal text-muted-foreground">
                                {fmt(t.profile.dislikedCount, { count: dislikedRows.length })}
                            </span>
                        </CardTitle>
                        <CardDescription>{t.profile.dislikedDescription}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {loading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton key={i} className="h-14 w-full rounded-xl" />
                            ))
                        ) : dislikedRows.length === 0 ? (
                            <EmptyState
                                icon={<HeartOff size={28} />}
                                title={t.profile.dislikedEmpty}
                                description={t.profile.dislikedEmptyHint}
                                className="py-10"
                            />
                        ) : (
                            dislikedRows.map(({ id, word, lang }) => (
                                <MarkedRow
                                    key={id}
                                    word={word}
                                    lang={lang}
                                    actionLabel={t.profile.restore}
                                    actionIcon={
                                        <RotateCcw className="size-4" data-icon="inline-start" aria-hidden="true" />
                                    }
                                    onAction={handleRestore}
                                />
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* ❤️ Yêu thích */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Heart className="size-5 fill-current text-favorite" aria-hidden="true" />
                            {t.profile.favoriteTitle}
                            <span className="text-sm font-normal text-muted-foreground">
                                {fmt(t.profile.favoriteCount, { count: favoriteRows.length })}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {loading ? (
                            Array.from({ length: 2 }).map((_, i) => (
                                <Skeleton key={i} className="h-14 w-full rounded-xl" />
                            ))
                        ) : favoriteRows.length === 0 ? (
                            <EmptyState
                                icon={<Heart size={28} />}
                                title={t.profile.favoriteEmpty}
                                description={t.profile.favoriteEmptyHint}
                                className="py-10"
                            />
                        ) : (
                            favoriteRows.map(({ id, word, lang }) => (
                                <MarkedRow
                                    key={id}
                                    word={word}
                                    lang={lang}
                                    actionLabel={t.wordDetail.unmarkFavorite}
                                    actionIcon={
                                        <HeartOff className="size-4" data-icon="inline-start" aria-hidden="true" />
                                    }
                                    onAction={handleUnfavorite}
                                />
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
