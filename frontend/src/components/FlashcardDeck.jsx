import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, CheckCircle2, Copy, Heart, HeartOff, MousePointerClick, Settings2 } from "lucide-react";
import { FlashcardSessionSummary } from "./FlashcardSessionSummary.jsx";
import { FlashcardDetailDialog } from "./FlashcardDetailDialog.jsx";
import { AudioPlayButton } from "./AudioPlayButton.jsx";
import { AlignedHanColumns, VocabularyMeaningsBlock, buildAlignedColumns } from "./VocabularyContent.jsx";
import { VocabularySetPicker } from "./VocabularySetPicker.jsx";
import { Button } from "./shadcn/button.jsx";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./shadcn/dropdown-menu.jsx";
import { toast } from "./shadcn/toast.jsx";
import { useLocale } from "../store/localeStore.js";
import { useIsAdmin, useIsSignedIn } from "../store/authStore.js";
import { loadFlashcardPrefs } from "../lib/flashcardPrefs.js";
import {
    useVocabularies,
    useVocabularyMastery,
    useFavoriteVocabularyIds,
    useDislikedVocabularyIds,
    useAppActions,
    useMandarinVocabularies,
} from "../store/appStore.js";
import { useDisplaySettings } from "../store/displaySettingsStore.js";
import { useHkSuggestion } from "../lib/hkSuggestion.js";
import { log } from "../lib/actionLog.js";
import { recordFlashcardSession } from "../lib/flashcardStats.js";
import {
    vocabularyFieldDisplayText,
    isVocabularyFieldPending,
    vocabRomanizationField,
    vocabMeanings,
} from "../lib/wordDisplay.js";
import { cn } from "../lib/cn.js";
import { copyToClipboard } from "../lib/clipboard.js";
import { vocabularyFieldPendingClass } from "./VocabularyFieldText.jsx";
import { btnClass } from "./ui/buttonStyles.js";

import { controlButtonClass } from "./ui/controlStyles.js";

const rateBase = cn(
    controlButtonClass,
    "px-1.5 rounded-xl text-sm font-semibold leading-normal cursor-pointer shadow-sm",
    "transition-[background,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed",
);

// ⚠️ 2026-09-02: bước cộng dồn tiến độ mastered — khó +5, trung bình +10, dễ +25.
const MASTERY_STEPS = { hard: 5, medium: 10, easy: 25 };

/** Ngôn ngữ của vocab (theo reading/han form) — dùng cho map mastery. */
function vocabLanguage(vocab) {
    return Boolean(vocab.jyutping || vocab.hanHongKong) ? "cantonese" : "mandarin";
}

/** Hán tự hiển thị trên thẻ (khớp FlashcardCardBody: simplified → hongKong → traditional). */
function cardHanText(vocab) {
    return String(vocab?.hanSimplified || vocab?.hanHongKong || vocab?.hanTraditional || "").trim();
}

function flashcardField(vocab, field, updatingLabel) {
    return {
        text: vocabularyFieldDisplayText(vocab, field, updatingLabel),
        pending: isVocabularyFieldPending(vocab, field),
    };
}

/**
 * 🔊 trong thẻ — bọc stopPropagation để bấm audio KHÔNG lật thẻ (nút nằm TRONG khối lật).
 */
function CardAudio(props) {
    return (
        <span
            className="inline-flex shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            <AudioPlayButton {...props} />
        </span>
    );
}

/**
 * Thân thẻ flashcard (2026-09-19: KHÔNG còn 2 mặt / không lật thẻ).
 * ⚠️ 2026-09-19: TÁI SỬ DỤNG component của trang detail từ vựng (`VocabularyContent.jsx`):
 * hero = `AlignedHanColumns` (cùng cụm hán tự căn cột như hero detail), phần nghĩa =
 * `VocabularyMeaningsBlock` (cùng danh sách nghĩa đánh số + ví dụ A/B/C như trang detail).
 * Cấu trúc: [hàng icon ★🔖 + số đếm] → [hero hán tự CĂN GIỮA] → [vùng bấm: chưa mở = text
 * "Nhấn để hiển thị nghĩa và ví dụ"; đã mở = nghĩa + ví dụ].
 */
function FlashcardCardBody({
    vocab,
    updatingLabel,
    listenTitle,
    actions,
    revealed,
    revealHint,
    t,
    fmt,
    examplesDefaultOpen = true,
    mandarinSuggestion = null,
}) {
    const pendingClass = vocabularyFieldPendingClass;
    const sinoVietnamese = flashcardField(vocab, "sinoVietnamese", updatingLabel);
    const vietMeanings = flashcardField(vocab, "vietMeanings", updatingLabel);
    const engMeanings = flashcardField(vocab, "engMeanings", updatingLabel);
    const meaningRows = vocabMeanings(vocab);
    const han = vocab.hanSimplified || vocab.hanHongKong || vocab.hanTraditional || "—";
    const jyutping = vocabRomanizationField(vocab, "jyutping") || vocab.jyutping || "—";
    // ⚠️ 2026-09-02: màu hán theo ngôn ngữ — Mandarin → xanh (text-han-simp), Cantonese → đỏ
    // (text-han-trad). Bỏ màu đỏ hardcode legacy (.flashcard-han:not(...) trong globals.css).
    const isCantonese = Boolean(vocab.jyutping || vocab.hanHongKong);
    const hanClass = cn("flashcard-han", isCantonese ? "text-han-trad" : "text-han-simp");
    // ⚠️ 2026-09-02: romanization hiển thị theo ngôn ngữ — cantonese → jyutping, mandarin → pinyin.
    const romanization = isCantonese ? jyutping : vocabRomanizationField(vocab, "pinyin") || vocab.pinyin || "";
    // ⚠️ 2026-09-17: nút 🔊 nghe cách đọc hán — cantonese CHỈ dùng hanHongKong (gTTS yue),
    // mandarin CHỈ dùng hanSimplified (gTTS zh-CN); KHÔNG fallback chéo form.
    const audioHan = isCantonese ? String(vocab.hanHongKong ?? "").trim() : String(vocab.hanSimplified ?? "").trim();
    // ⚠️ 2026-09-17: chặn sự kiện lan ra thân thẻ — bấm 🔊 chỉ phát âm, KHÔNG mở nghĩa.
    const hanAudio = audioHan ? (
        <CardAudio
            cantoneseText={isCantonese ? audioHan : undefined}
            mandarinText={isCantonese ? undefined : audioHan}
            title={listenTitle}
            size="icon-sm"
            className="text-muted-foreground"
        />
    ) : null;

    const hanColumns = buildAlignedColumns(han, sinoVietnamese.text, romanization);
    // ⚠️ 2026-09-19: cột GỢI Ý MANDARIN (tuỳ chọn, chỉ từ Cantonese) — giản thể + pinyin + Hán-Việt
    // lấy từ kho Mandarin (khớp form giản thể do backend gợi ý). Cùng cấu trúc cột như trang detail.
    const suggestVocab = mandarinSuggestion?.vocab ?? null;
    const suggestColumns = suggestVocab
        ? buildAlignedColumns(
              (suggestVocab.hanSimplified ?? "").trim(),
              (suggestVocab.sinoVietnamese ?? "").trim(),
              (suggestVocab.pinyin ?? "").trim(),
          )
        : [];
    /**
     * ⚠️ 2026-09-19: hero NGHĨA căn TRÁI (`items-start`) nhưng riêng block hero hán tự phải
     * **CĂN GIỮA ngang** → bọc `w-full justify-center`; danh sách nghĩa/ví dụ vẫn căn trái.
     * Có cột gợi ý Mandarin → 2 cột (Cantonese | Mandarin) như trang detail, mỗi cột 1 nhãn nhỏ.
     */
    const heroColumn = (label, node) => (
        <div className="flex flex-col items-center gap-2">
            {label ? <p className="m-0 text-xs font-medium tracking-wide text-muted-foreground">{label}</p> : null}
            {node}
        </div>
    );
    const mainColumns = (
        <AlignedHanColumns
            columns={hanColumns}
            hanClass={hanClass}
            sinoClass="flashcard-sino-vietnamese"
            romanClass={isCantonese ? "text-jyutping" : "text-pinyin"}
            audio={hanAudio}
        />
    );
    const hero = (
        <div className={cn("flex w-full justify-center", sinoVietnamese.pending && pendingClass)}>
            {mandarinSuggestion && suggestColumns.length > 0 ? (
                <div className="flex flex-wrap items-start justify-center gap-8">
                    {heroColumn(isCantonese ? t.wordBank.colHanTitleCantonese : null, mainColumns)}
                    {heroColumn(
                        t.wordBank.colHanSuggestedSimplified,
                        <AlignedHanColumns
                            columns={suggestColumns}
                            hanClass="flashcard-han text-han-simp"
                            sinoClass="flashcard-sino-vietnamese"
                            romanClass="text-pinyin"
                        />,
                    )}
                </div>
            ) : (
                mainColumns
            )}
        </div>
    );

    /**
     * ⚠️ 2026-09-17: khung nội dung thẻ — hàng icon (★/🔖) nằm ở DÒNG ĐẦU theo flow
     * (KHÔNG overlay absolute ngoài khối lật) nên không chồng lên hán tự.
     * `actions` nằm TRONG khối bấm-mở-nghĩa → click icon phải stopPropagation (xem `cardActions`).
     */
    const face = (content, { center = false, align = "center", gap = "gap-3" } = {}) => (
        <div className="flex min-h-0 w-full flex-1 flex-col">
            {/* Hàng actions (icon ★🔖⚡ + số đếm thẻ) — đã là 1 row `w-full` riêng (xem cardActions) */}
            {actions}
            {/* ⚠️ 2026-09-17: vùng nội dung PHẢI có `overflow-y-auto` + `min-h-0` — thiếu thì nội
                dung cao hơn thẻ bị CẮT ở trên (flex + justify-start: phần đầu tràn ra ngoài mà
                KHÔNG cuộn tới được → mất hero hán tự / meaning đầu). */}
            <div
                className={cn(
                    // ⚠️ 2026-09-19: `pt-3` — nội dung KHÔNG chạm hàng icon (header) phía trên.
                    // `flashcard-scroll` — ẩn THANH scrollbar (vẫn cuộn bằng wheel/touch/phím).
                    // ⚠️ `relative` BẮT BUỘC: vùng cuộn phải là containing block của các phần tử
                    // `position: absolute` bên trong (VD `<span class="sr-only">` của nút Ví dụ) —
                    // nếu không, containing block rơi ra ngoài vùng cuộn ⇒ phần tử absolute KHÔNG bị
                    // cắt, kéo dài xuống dưới và làm `main` bị scroll (thấy khoảng trống dưới trang).
                    "flashcard-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-y-auto pt-3",
                    // ⚠️ 2026-09-17: mặt nội dung (nghĩa + ví dụ) bám TRÊN + căn TRÁI; mặt hán tự
                    // giữ căn giữa ngang. `text-left` cần thiết vì `.radicals-flip__face` là center.
                    align === "start" ? "items-start text-left" : "items-center",
                    gap,
                    center ? "justify-center" : "justify-start",
                )}
            >
                {content}
            </div>
        </div>
    );

    /** Danh sách nghĩa + ví dụ — DÙNG CHUNG component với trang detail. */
    const meaningArea = revealed ? (
        meaningRows.length ? (
            <div className="flex w-full flex-col items-start text-left">
                <VocabularyMeaningsBlock
                    meanings={meaningRows}
                    type={isCantonese ? "jyutping" : "pinyin"}
                    t={t}
                    fmt={fmt}
                    hanTraditional={vocab.hanTraditional}
                    hanSimplified={vocab.hanSimplified}
                    hanHongKong={vocab.hanHongKong}
                    defaultOpenExamples={examplesDefaultOpen}
                    showEmpty={false}
                />
            </div>
        ) : (
            <>
                <p className={cn("flashcard-viet", vietMeanings.pending && pendingClass)}>{vietMeanings.text}</p>
                <p className={cn("flashcard-english", engMeanings.pending && pendingClass)}>{engMeanings.text}</p>
            </>
        )
    ) : (
        // ⚠️ 2026-09-19: thay cho việc lật thẻ — bấm thân thẻ (hoặc nút "Tiếp") để mở phần này.
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
            <MousePointerClick className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="flashcard-reveal-hint m-0 text-sm text-muted-foreground">{revealHint}</p>
        </div>
    );

    return face(
        <>
            {/* Hero hán tự DÙNG CHUNG (luôn hiện): Hán-Việt / hán tự / 🔊 / phiên âm — căn giữa. */}
            {hero}
            {meaningArea}
        </>,
        { align: "start", gap: "gap-4" },
    );
}

function vocabSnapshot(vocab) {
    return {
        id: vocab.id,
        hanTraditional: vocab.hanTraditional ?? "",
        sinoVietnamese: vocabRomanizationField(vocab, "sinoVietnamese") || vocab.sinoVietnamese,
        jyutping: vocabRomanizationField(vocab, "jyutping") || (vocab.jyutping ?? ""),
        vietMeanings: vocab.vietMeanings ?? "",
        engMeanings: vocab.engMeanings ?? "",
        popularity: vocab.popularity,
    };
}

function upsertSessionEntry(log, vocab, outcome) {
    const snap = vocabSnapshot(vocab);
    const idx = log.findIndex((e) => e.id === snap.id);
    if (outcome === "again") {
        if (idx >= 0) {
            return log.map((e, i) => (i === idx ? { ...e, outcome: "again", againTimes: (e.againTimes ?? 0) + 1 } : e));
        }
        return [...log, { ...snap, outcome: "again", againTimes: 1 }];
    }
    if (outcome === "passed") {
        if (idx >= 0) {
            if (log[idx].outcome === "again" || log[idx].outcome === "mastered") return log;
            return log.map((e, i) => (i === idx ? { ...e, outcome: "passed" } : e));
        }
        return [...log, { ...snap, outcome: "passed", againTimes: 0 }];
    }
    if (idx >= 0) {
        if (log[idx].outcome === "mastered") return log;
        return log.map((e, i) => (i === idx ? { ...e, outcome } : e));
    }
    return [...log, { ...snap, outcome, againTimes: 0 }];
}

function buildSessionSummary(initialVocabularies, sessionLog) {
    const logById = new Map(sessionLog.map((e) => [e.id, e]));
    return initialVocabularies.map((vocab) => {
        const logged = logById.get(vocab.id);
        if (logged) return logged;
        return { ...vocabSnapshot(vocab), outcome: "passed", againTimes: 0 };
    });
}

export function FlashcardDeck({ vocabularies, onNewSession, onPlayAgain, loading = false }) {
    const { t, fmt } = useLocale();
    const isAdmin = useIsAdmin();
    const mastery = useVocabularyMastery();
    const signedIn = useIsSignedIn();
    const favoriteVocabularyIds = useFavoriteVocabularyIds();
    const dislikedVocabularyIds = useDislikedVocabularyIds();
    const { updateVocabularyMastery, toggleVocabularyFavorite, toggleVocabularyDisliked } = useAppActions();

    const [deck, setDeck] = useState([]);
    const [index, setIndex] = useState(0);
    const [revealed, setRevealed] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const [sessionComplete, setSessionComplete] = useState(false);
    const [sessionLog, setSessionLog] = useState([]);
    const [initialVocabularies, setInitialVocabularies] = useState([]);
    const [stats, setStats] = useState({ again: 0, mastered: 0 });

    useEffect(() => {
        const initial = vocabularies;
        setInitialVocabularies(initial);
        setSessionLog([]);
        setSessionComplete(false);
        setDeck(initial);
        setIndex(0);
        setRevealed(false);
        setStats({ again: 0, mastered: 0 });
    }, [vocabularies]);

    // ⚠️ 2026-09-01: đồng bộ deck entry với store bank — khi edit trong detail dialog, store
    // cập nhật (editVocabulary) → merge data mới vào deck THEO id (KHÔNG reset session/index).
    const bank = useVocabularies();
    useEffect(() => {
        if (!bank || bank.length === 0) return;
        setDeck((d) => {
            const byId = new Map(bank.map((v) => [v.id, v]));
            let changed = false;
            const next = d.map((w) => {
                const fresh = byId.get(w.id);
                if (fresh && fresh !== w) {
                    changed = true;
                    return fresh;
                }
                return w;
            });
            return changed ? next : d;
        });
    }, [bank]);

    const recordOutcome = useCallback((vocab, outcome) => {
        if (!vocab) return;
        setSessionLog((log) => upsertSessionEntry(log, vocab, outcome));
    }, []);

    const finishSession = useCallback(
        (vocab) => {
            // ⚠️ 2026-09-02: KHÔNG đặt tên biến `log` — che mất hàm log import từ actionLog.js
            // → `log("Flashcard session done")` crash "log is not a function" khi kết thúc phiên.
            const nextLog = vocab ? upsertSessionEntry(sessionLog, vocab, "passed") : sessionLog;
            if (vocab) setSessionLog(nextLog);
            const entries = buildSessionSummary(initialVocabularies, nextLog);
            recordFlashcardSession(entries);
            log("Flashcard session done", initialVocabularies.length);
            setSessionComplete(true);
        },
        [initialVocabularies, sessionLog],
    );

    const deckCard = deck[index];
    const current = deckCard;
    // Tiến độ mastered (0-100%) của card hiện tại — hiện badge góc phải khi đã nắm (>= 100).
    const currentProgress = current ? (mastery?.[vocabLanguage(current)]?.[current.id] ?? 0) : 0;
    const total = deck.length;

    // ⚠️ 2026-09-19: bỏ `canGoPrev`/`canGoNext` (2 nút mũi tên đã xóa) — chỉ còn `isLastCard`
    // để biết khi nào chấm điểm xong thì KẾT THÚC phiên.
    const isLastCard = index >= deck.length - 1;

    // Xóa 1 thẻ khỏi phiên hiện tại (dùng cho "Đã thuộc" + 🚫 "không muốn học").
    // ⚠️ 2026-09-20: khai báo Ở ĐÂY (trước các handler icon) — nếu để sau `cardActions` useMemo
    // thì deps của useCallback tham chiếu biến chưa khởi tạo ⇒ TDZ ReferenceError.
    const removeMasteredCard = useCallback(
        (vocab) => {
            setDeck((d) => {
                const next = d.filter((w) => w.id !== vocab.id);
                if (index >= next.length) setIndex(Math.max(0, next.length - 1));
                return next;
            });
            setRevealed(false);
            if (deck.length <= 1) finishSession();
        },
        [deck.length, finishSession, index],
    );

    // ⚠️ 2026-09-17 → 2026-09-20: cặp icon trên thẻ (giống trang detail): ❤️ Heart = "yêu thích",
    // 🚫 HeartOff = "không muốn học" (LOẠI TRỪ NHAU). Chỉ hiện khi đã đăng nhập (bảng theo user).
    const isFavorite = Boolean(current && favoriteVocabularyIds.includes(current.id));
    const isDisliked = Boolean(current && dislikedVocabularyIds.includes(current.id));
    const handleToggleFavorite = useCallback(() => {
        if (!current || !signedIn) return;
        const next = !isFavorite;
        toggleVocabularyFavorite(current.id, vocabLanguage(current), next)
            .then(() => {
                toast.add({
                    type: next ? "success" : "info",
                    title: next ? t.wordDetail.markedFavorite : t.wordDetail.unmarkedFavorite,
                    duration: 2000,
                });
            })
            .catch(() => {});
    }, [
        current,
        isFavorite,
        signedIn,
        toggleVocabularyFavorite,
        t.wordDetail.markedFavorite,
        t.wordDetail.unmarkedFavorite,
    ]);

    // 🚫 "Không muốn học" → bỏ thẻ khỏi phiên hiện tại (không hỏi lại từ này nữa) + loại khỏi
    // flashcard random ở các lần sau (backend excludeDisliked) + hiện trong danh sách ở /profile.
    const handleToggleDisliked = useCallback(() => {
        if (!current || !signedIn) return;
        const next = !isDisliked;
        const vocab = current;
        toggleVocabularyDisliked(vocab.id, vocabLanguage(vocab), next)
            .then(() => {
                toast.add({
                    type: next ? "info" : "success",
                    title: next ? t.wordDetail.markedDisliked : t.wordDetail.unmarkedDisliked,
                    duration: 2500,
                });
                if (next) removeMasteredCard(vocab);
            })
            .catch(() => {});
    }, [
        current,
        isDisliked,
        signedIn,
        toggleVocabularyDisliked,
        removeMasteredCard,
        t.wordDetail.markedDisliked,
        t.wordDetail.unmarkedDisliked,
    ]);

    // ⚠️ 2026-09-20: icon COPY hán tự của thẻ hiện tại (copy nhanh, không cần đăng nhập).
    const handleCopyHan = useCallback(() => {
        const text = cardHanText(current);
        if (!text) return;
        copyToClipboard(text).then((ok) => {
            toast.add({
                type: ok ? "success" : "error",
                title: ok ? t.common.copied : t.common.error,
                description: ok ? text : undefined,
            });
        });
    }, [current, t.common.copied, t.common.error]);

    // ⚠️ 2026-09-19: MEMO hàng icon (★/🔖 + số đếm) + THÂN THẺ.
    // Lý do: `cardBody` mà tạo lại MỖI lần render thì React phải reconcile lại toàn bộ nội dung
    // (thẻ nặng ~1500 node: nhiều nghĩa + ví dụ) ⇒ đo được tới ~43ms → giật khi mở/đóng nghĩa.
    // Memo theo `current` (mọi nội dung thẻ đều derive từ vocab) + prop hiển thị: các render KHÁC
    // (đổi index, rating, toast…) sẽ giữ nguyên reference → React bỏ qua re-render thân thẻ.
    const listenTitle = t.wordDetail?.listenHan;
    // ⚠️ 2026-09-19: TÙY CHỌN HIỂN THỊ trên thẻ (nút ⚙ ở hàng icon) — dùng CHUNG store với trang
    // detail (`displaySettingsStore`): ví dụ mở sẵn + cột gợi ý Mandarin (cho từ Cantonese).
    const {
        examplesDefaultOpen,
        showMandarinCol,
        toggleExamplesDefaultOpen,
        toggleMandarinCol,
        showMeaningEn,
        toggleMeaningEn,
    } = useDisplaySettings();
    // Cột gợi ý Mandarin cho từ Cantonese: tra on-demand như hero trang detail (hook phải gọi
    // ở THÂN component — KHÔNG được gọi trong `FlashcardCardBody` vì hàm đó chạy trong useMemo).
    const mandarinVocabularies = useMandarinVocabularies();
    const wantSuggestion = showMandarinCol && Boolean(current?.hanHongKong) && !current?.hanSimplified;
    const hkForm = wantSuggestion ? String(current?.hanHongKong ?? "").trim() : "";
    const { suggestion } = useHkSuggestion(hkForm);
    // Vocab Mandarin khớp form giản thể gợi ý — lấy pinyin/sino để render cột gợi ý.
    const suggestedVocab = useMemo(() => {
        const simp = (suggestion?.simplified ?? "").trim();
        if (!simp) return null;
        return mandarinVocabularies.find((v) => (v.hanSimplified ?? "").trim() === simp) ?? null;
    }, [suggestion, mandarinVocabularies]);

    // ⚠️ 2026-09-17: hàng icon của thẻ (★ mark + 🔖 bộ từ) — nằm TRONG nội dung
    // thẻ (flow, xem `face()` trong FlashcardCardBody), KHÔNG phải overlay absolute ở stage
    // (trước đây icon chồng lên hàng sino/hán tự đầu tiên). Vì nằm trong khối bấm-để-mở-nghĩa →
    // PHẢI stopPropagation, nếu không bấm icon sẽ mở/đóng phần nghĩa.
    // ⚠️ 2026-09-19: số đếm thẻ (1 / 20) dời VÀO cùng hàng này, nằm GÓC PHẢI (justify-between).
    const cardActions = useMemo(
        () =>
            current ? (
                <div
                    className="flex w-full shrink-0 items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center gap-2">
                        {signedIn && (
                            <>
                                {/* ❤️ yêu thích (thay ★ "quan trọng" cũ) */}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className={cn(
                                        "rounded-full",
                                        // ⚠️ 2026-09-27: ❤️ yêu thích = ĐỎ (`text-favorite`).
                                        isFavorite ? "text-favorite hover:text-favorite/80" : "text-muted-foreground",
                                    )}
                                    onClick={handleToggleFavorite}
                                    aria-pressed={isFavorite}
                                    aria-label={isFavorite ? t.wordDetail.unmarkFavorite : t.wordDetail.markFavorite}
                                    title={isFavorite ? t.wordDetail.unmarkFavorite : t.wordDetail.markFavorite}
                                >
                                    <Heart className={cn("size-4", isFavorite && "fill-current")} />
                                </Button>
                                {/* 🚫 không muốn học (HeartOff) — cặp với ❤️, loại trừ nhau */}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className={cn(
                                        "rounded-full",
                                        isDisliked ? "text-destructive" : "text-muted-foreground",
                                    )}
                                    onClick={handleToggleDisliked}
                                    aria-pressed={isDisliked}
                                    aria-label={isDisliked ? t.wordDetail.unmarkDisliked : t.wordDetail.markDisliked}
                                    title={isDisliked ? t.wordDetail.unmarkDisliked : t.wordDetail.markDisliked}
                                >
                                    <HeartOff className={cn("size-4", isDisliked && "fill-current")} />
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        render={
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                className="rounded-full text-muted-foreground"
                                                aria-label={t.vocabSets.addToSet}
                                                title={t.vocabSets.addToSet}
                                            >
                                                <Bookmark className="size-4" />
                                            </Button>
                                        }
                                    />
                                    <DropdownMenuContent align="start" className="min-w-56">
                                        <VocabularySetPicker vocabId={current.id} lang={vocabLanguage(current)} />
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        )}
                        {/* ⚠️ 2026-09-20: icon COPY HÁN TỰ của thẻ (mọi user) — giữa 🔖 và ⚙. */}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-full text-muted-foreground"
                            onClick={handleCopyHan}
                            aria-label={t.common.copy}
                            title={t.common.copy}
                        >
                            <Copy className="size-4" />
                        </Button>
                        {/* ⚠️ 2026-09-19: nút ⚙ TÙY CHỌN HIỂN THỊ (giống trang detail) — áp dụng
                            ngay cho thẻ đang xem: ví dụ mở sẵn / cột gợi ý Mandarin / nghĩa tiếng Anh. */}
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        className="rounded-full text-muted-foreground"
                                        aria-label={t.wordDetail.displaySettings}
                                        title={t.wordDetail.displaySettings}
                                    >
                                        <Settings2 className="size-4" />
                                    </Button>
                                }
                            />
                            <DropdownMenuContent align="start" className="min-w-56">
                                {/* ⚠️ Base UI: `DropdownMenuLabel` BẮT BUỘC nằm trong `DropdownMenuGroup`. */}
                                <DropdownMenuGroup>
                                    <DropdownMenuLabel>{t.wordDetail.displaySettings}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuCheckboxItem
                                        checked={examplesDefaultOpen}
                                        onCheckedChange={() => toggleExamplesDefaultOpen()}
                                    >
                                        {t.wordDetail.displaySettingsShowExamplesOpen}
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem
                                        checked={showMandarinCol}
                                        onCheckedChange={() => toggleMandarinCol()}
                                    >
                                        {t.wordDetail.toggleMandarinCol}
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuCheckboxItem
                                        checked={showMeaningEn}
                                        onCheckedChange={() => toggleMeaningEn()}
                                    >
                                        {t.wordDetail.displaySettingsShowMeaningEn}
                                    </DropdownMenuCheckboxItem>
                                </DropdownMenuGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    {/* ⚠️ 2026-09-19: số đếm thẻ (1 / 20) — GÓC PHẢI của hàng icon (trước đây là <p> riêng
                phía trên thẻ). */}
                    <span className="text-sm text-muted-foreground">
                        {fmt(t.flashcard.progress, { current: index + 1, total })}
                    </span>
                </div>
            ) : null,
        // biome-ignore lint/correctness/useExhaustiveDependencies: `t`/`fmt` đổi khi đổi ngôn ngữ;
        // `handleToggleFavorite`/`handleToggleDisliked` là useCallback ổn định.
        [
            current,
            signedIn,
            isFavorite,
            isDisliked,
            index,
            total,
            t,
            fmt,
            handleToggleFavorite,
            handleToggleDisliked,
            handleCopyHan,
            examplesDefaultOpen,
            showMandarinCol,
            showMeaningEn,
            toggleExamplesDefaultOpen,
            toggleMandarinCol,
            toggleMeaningEn,
        ],
    );

    const cardBody = useMemo(
        () =>
            current
                ? FlashcardCardBody({
                      vocab: current,
                      updatingLabel: t.wordBank.fieldUpdating,
                      listenTitle,
                      actions: cardActions,
                      revealed,
                      revealHint: t.flashcard.revealHint,
                      t,
                      fmt,
                      examplesDefaultOpen,
                      mandarinSuggestion: wantSuggestion ? { vocab: suggestedVocab } : null,
                  })
                : null,
        [current, revealed, t, fmt, listenTitle, cardActions, examplesDefaultOpen, suggestedVocab, wantSuggestion],
    );

    // ⚠️ 2026-09-19: bấm thân thẻ = MỞ nghĩa (một chiều, KHÔNG đóng lại — user bỏ tính năng
    // click mặt nghĩa để quay về mặt hán tự vì thừa).
    const revealMeaning = useCallback(() => {
        if (revealed) return;
        log("Flashcard reveal", current);
        setRevealed(true);
    }, [current, revealed]);

    const openDetail = useCallback(() => {
        if (!current) return;
        log("Open vocabulary detail", current);
        setDetailOpen(true);
    }, [current]);

    // Xóa từ từ detail dialog → xóa khỏi store + xóa khỏi deck session + đóng dialog.
    const deleteFromDetail = useCallback(
        (vocabId) => {
            const v = deck.find((w) => w.id === vocabId);
            if (v) removeMasteredCard(v);
            setDetailOpen(false);
        },
        [deck, removeMasteredCard],
    );

    const advanceAfterRating = useCallback(() => {
        if (isLastCard) {
            finishSession(current);
            return;
        }
        recordOutcome(current, "passed");
        setRevealed(false);
        setIndex((i) => Math.min(i + 1, deck.length - 1));
    }, [current, finishSession, isLastCard, recordOutcome]);

    // ⚠️ 2026-09-02: cộng dồn tiến độ mastered theo user (bảng user_vocabulary_mastery):
    //   - Khó (hard) +5 · Trung bình (medium) +10 · Dễ (easy) +25 — cộng dồn tới 100% = đã nắm.
    //   - Lại nữa (again) → reset 0% (nếu đang > 0%).
    //   - Đã nắm (mastered) → set 100% + xóa khỏi deck session (khỏi random; trong bộ riêng vẫn
    //     hiển thị qua badge mastered góc phải card).
    const handleRate = useCallback(
        (rating) => {
            if (!current) return;
            log(`Flashcard rate ${rating}`, current);
            setStats((s) => ({ ...s, [rating]: (s[rating] ?? 0) + 1 }));

            const lang = vocabLanguage(current);
            const prevProgress = mastery?.[lang]?.[current.id] ?? 0;

            if (rating === "mastered") {
                if (prevProgress < 100) updateVocabularyMastery(lang, current.id, 100);
                recordOutcome(current, "mastered");
                removeMasteredCard(current);
                return;
            }

            if (rating === "again") {
                // Đã quên → reset về 0% (nếu đang > 0%).
                if (prevProgress > 0) updateVocabularyMastery(lang, current.id, 0);
                recordOutcome(current, "again");
                setRevealed(false);
                setDeck((d) => {
                    if (d.length <= 1) return d;
                    const copy = [...d];
                    const [card] = copy.splice(index, 1);
                    copy.push(card);
                    return copy;
                });
                return;
            }

            // Khó/Trung bình/Dễ → cộng dồn; chạm 100% = đã nắm.
            const step = MASTERY_STEPS[rating] ?? 0;
            const nextProgress = Math.min(100, prevProgress + step);
            if (nextProgress >= 100) {
                updateVocabularyMastery(lang, current.id, 100);
                recordOutcome(current, "mastered");
                removeMasteredCard(current);
                return;
            }
            if (nextProgress !== prevProgress) updateVocabularyMastery(lang, current.id, nextProgress);
            recordOutcome(current, rating);
            advanceAfterRating();
        },
        [advanceAfterRating, current, index, mastery, recordOutcome, removeMasteredCard, updateVocabularyMastery],
    );

    // ⚠️ 2026-09-19: BỎ phím ArrowLeft/ArrowRight (2 nút điều hướng đã xóa) — chỉ còn bấm thân thẻ
    // để mở nghĩa + chấm điểm 1-5; mỗi lần chấm điểm là sang thẻ kế tiếp (không nhảy tay).
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.closest("input, textarea, select")) return;
            if (revealed) {
                if (e.key === "1") handleRate("again");
                else if (e.key === "2") handleRate("hard");
                else if (e.key === "3") handleRate("medium");
                else if (e.key === "4") handleRate("easy");
                else if (e.key === "5") handleRate("mastered");
                else if (e.key === "d" || e.key === "D") openDetail();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [revealed, handleRate, openDetail]);

    if (!vocabularies || vocabularies.length === 0) return null;

    if (sessionComplete) {
        const entries = buildSessionSummary(initialVocabularies, sessionLog);
        return (
            <FlashcardSessionSummary
                entries={entries}
                loading={loading}
                onPlayAgain={() => onPlayAgain?.()}
                onNewSession={() => onNewSession?.()}
            />
        );
    }

    if (!current) {
        return (
            <div className="text-center py-12 px-6 bg-card border border-border rounded-2xl shadow-md">
                <h2>{t.flashcard.sessionComplete}</h2>
                <p className="mt-2">{fmt(t.flashcard.cardsStudied, { count: stats.again + stats.mastered })}</p>
                <div className="flex flex-wrap justify-center gap-4 my-4 text-sm text-muted-foreground">
                    <span>
                        {t.flashcard.again}: {stats.again}
                    </span>
                    <span>
                        {t.flashcard.master}: {stats.mastered}
                    </span>
                </div>
                <button type="button" className={btnClass("primary")} onClick={() => onNewSession?.()}>
                    {t.flashcard.newSession}
                </button>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flashcard-nav-row">
                <div className="flashcard-stage flex-1 min-w-0 relative">
                    {/* ⚠️ 2026-09-19: badge "đã thuộc" (mastered, ≥100%) căn GIỮA NGANG ở mép trên
                        thẻ — trước đây đặt `right-2` nên TRÙNG với counter `1 / 20` (cũng ở góc phải
                        hàng actions của thẻ). */}
                    {currentProgress >= 100 && (
                        <span
                            className="absolute top-2 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-emerald-500/95 px-2 py-0.5 text-xs font-semibold text-white shadow-sm"
                            title={t.flashcard.master}
                        >
                            <CheckCircle2 className="size-3.5" data-icon="inline-start" />
                            {t.flashcard.master}
                        </span>
                    )}
                    {/* ⚠️ 2026-09-19: THẺ 1 MẶT — hero hán tự luôn hiện; bấm thân thẻ = MỞ nghĩa +
                        ví dụ (một chiều, KHÔNG đóng lại). `radicals-flip*` giữ lại CHỈ để dùng style khung
                        thẻ sẵn có (`.radicals-flip__face`: border/radius/bg/padding,
                        `.flashcard-stage .radicals-flip`: max-width 60rem + height 100%). */}
                    <div
                        key={current.id}
                        className={cn("radicals-flip", !revealed && "cursor-pointer")}
                        onClick={revealed ? undefined : revealMeaning}
                        role={revealed ? undefined : "button"}
                        tabIndex={revealed ? -1 : 0}
                        aria-label={revealed ? undefined : t.flashcard.revealHint}
                        onKeyDown={
                            revealed
                                ? undefined
                                : (e) => {
                                      if (e.key === " " || e.key === "Enter") {
                                          e.preventDefault();
                                          revealMeaning();
                                      }
                                  }
                        }
                    >
                        <div className="radicals-flip__inner">
                            <div className="radicals-flip__face">{cardBody}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-2.5 p-3.5 border border-border rounded-[0.875rem] bg-card shadow-sm">
                <div className="grid grid-cols-5 gap-1.5 max-sm:grid-cols-2">
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "border-destructive/30 bg-linear-to-b from-destructive/10 to-red-100/65 text-destructive hover:border-red-400 hover:bg-rose-100 hover:shadow-[0_2px_8px_rgba(244,63,94,0.12)] dark:from-red-950/55 dark:to-red-950/85 dark:hover:border-rose-400 dark:hover:bg-red-950/75 dark:hover:shadow-[0_2px_10px_rgba(251,113,133,0.15)]",
                        )}
                        onClick={() => handleRate("again")}
                    >
                        {t.flashcard.again}
                    </button>
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "border-amber-400/45 bg-linear-to-b from-amber-50 to-amber-100 text-amber-800 hover:border-amber-400 hover:bg-amber-200 hover:shadow-[0_2px_8px_rgba(245,158,11,0.15)] dark:from-amber-950/55 dark:to-amber-900/35 dark:text-amber-300 dark:hover:border-amber-300 dark:hover:bg-amber-900/45",
                        )}
                        onClick={() => handleRate("hard")}
                    >
                        {t.flashcard.hard}
                    </button>
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "border-sky-400/45 bg-linear-to-b from-sky-50 to-sky-100 text-sky-800 hover:border-sky-400 hover:bg-sky-200 hover:shadow-[0_2px_8px_rgba(14,165,233,0.15)] dark:from-sky-950/55 dark:to-sky-900/35 dark:text-sky-300 dark:hover:border-sky-300 dark:hover:bg-sky-900/45",
                        )}
                        onClick={() => handleRate("medium")}
                    >
                        {t.flashcard.medium}
                    </button>
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "border-emerald-400/45 bg-linear-to-b from-emerald-50 to-emerald-100 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-200 hover:shadow-[0_2px_8px_rgba(16,185,129,0.15)] dark:from-emerald-950/55 dark:to-emerald-900/35 dark:text-emerald-300 dark:hover:border-emerald-300 dark:hover:bg-emerald-900/45",
                        )}
                        onClick={() => handleRate("easy")}
                    >
                        {t.flashcard.easy}
                    </button>
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "border-primary bg-linear-to-b from-primary to-emerald-200/45 text-primary hover:border-primary/25 hover:bg-primary/10 hover:text-primary hover:shadow-[0_2px_8px_rgba(15,118,110,0.15)] dark:from-emerald-950/75 dark:to-emerald-900/35 dark:hover:border-primary/25 dark:hover:bg-primary/10 dark:hover:text-primary dark:hover:shadow-[0_2px_10px_rgba(45,212,191,0.18)]",
                        )}
                        onClick={() => handleRate("mastered")}
                    >
                        {t.flashcard.master}
                    </button>
                </div>
                <div className="flex justify-center gap-2">
                    {/* ⚠️ 2026-09-19: nút "Chỉnh sửa" (đổi tên từ "Chi tiết") — CHỈ hiện cho ADMIN và mở
                        dialog detail ở CHẾ ĐỘ EDIT luôn (trước đây mở view rồi phải bấm "Sửa" thêm 1 lần). */}
                    {isAdmin && (
                        <button
                            type="button"
                            className={cn(
                                rateBase,
                                "min-w-28 border-primary bg-primary text-primary-foreground hover:bg-primary/80",
                            )}
                            onClick={openDetail}
                        >
                            {t.flashcard.editDetail}
                        </button>
                    )}
                </div>
            </div>

            <FlashcardDetailDialog
                vocab={current}
                open={detailOpen}
                onOpenChange={setDetailOpen}
                onDeleteVocabulary={deleteFromDetail}
                startEditing={isAdmin}
            />
        </div>
    );
}
