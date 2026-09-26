/**
 * ⚠️ 2026-09-19: Component TRÌNH BÀY DÙNG CHUNG cho nội dung 1 từ vựng —
 * trang detail (`VocabularyDetailContent.jsx`) và thẻ flashcard (`FlashcardDeck.jsx`)
 * đều render từ file này ⇒ không còn 2 bản markup song song bị lệch nhau.
 *
 * Gồm:
 *  - `AlignedHanColumns` — cụm hán tự căn CỘT DỌC theo từng ký tự (sino / hanzi / romanization).
 *  - `VocabularyMeaningsBlock` — danh sách nghĩa (số thứ tự + đường nối) + ví dụ (A/B/C…).
 *  - Các helper căn cột: `splitHanCharsAlign`, `splitAlignedTokens`, `buildAlignedColumns`,
 *    `vocabMatchIndices`.
 */
import { Badge } from "./shadcn/badge.jsx";
import { Button } from "./shadcn/button.jsx";
import { AudioPlayButton } from "./AudioPlayButton.jsx";
import { MeaningExamples } from "./MeaningExamples.jsx";
import { useDisplaySettings } from "../store/displaySettingsStore.js";
import { cn } from "../lib/cn.js";
import { capitalizeSentences, displayMeaning } from "../lib/wordNormalize.js";

/** Regex khớp ký tự chữ Hán (dùng để tách cột theo line hanzi). */
const HAN_SCRIPT_RE = /\p{Script=Han}/u;

/** Tách chuỗi thành các ký tự Hán (giữ thứ tự & ký tự lặp) — line hanzi là chuẩn. */
export function splitHanCharsAlign(text) {
    return [...String(text ?? "").trim()].filter((ch) => HAN_SCRIPT_RE.test(ch));
}

/** Tách chuỗi phân tách bằng khoảng trắng (sino / romanization) thành các token. */
export function splitAlignedTokens(value) {
    return String(value ?? "")
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Build các cột căn thẳng theo line hanzi: mỗi ký tự Hán = 1 cột
 * `{ han, sino, roman }` (sino trên, roman dưới). Thiếu dữ liệu → "-".
 */
export function buildAlignedColumns(hanText, sinoVietnamese, romanization) {
    const chars = splitHanCharsAlign(hanText);
    if (chars.length === 0) return [];
    const sino = splitAlignedTokens(sinoVietnamese);
    const roman = splitAlignedTokens(romanization);
    return chars.map((ch, i) => ({
        han: ch,
        sino: sino[i] || "-",
        roman: roman[i] || "-",
    }));
}

/**
 * Set of INDICES (trong mảng hán tự đã lọc) thuộc cụm từ khớp CONTIGUOUS với
 * từ đang xem (cả trad + simp). CHỈ highlight khi từ xuất hiện ĐỦ cụm liền nhau
 * trong câu ví dụ — không highlight lẻ từng chữ rời (highlight thừa) và không
 * bỏ sót cụm đúng (highlight thiếu). (2026-08-20)
 */
export function vocabMatchIndices(hanChars, wordForms) {
    const matched = new Set();
    for (const form of wordForms ?? []) {
        if (!form) continue;
        const wordChars = [...String(form)].filter((c) => HAN_SCRIPT_RE.test(c));
        if (!wordChars.length) continue;
        outer: for (let i = 0; i + wordChars.length <= hanChars.length; i++) {
            for (let k = 0; k < wordChars.length; k++) {
                if (hanChars[i + k] !== wordChars[k]) continue outer;
            }
            for (let k = 0; k < wordChars.length; k++) matched.add(i + k);
        }
    }
    return matched;
}

export const highlightMarkClass = "rounded bg-transparent font-semibold text-amber-600 dark:text-amber-300";

const hanGlyphClass = "wd-han block text-[clamp(3rem,8vw,7rem)] leading-none";

/**
 * Header 3 dòng (sino / hanzi / romanization) căn thẳng CỘT DỌC theo từng ký tự
 * Hán — line hanzi làm chuẩn (áp dụng mọi từ).
 *
 * - Có `copyText` + `onCopy` (trang detail) → cả cụm là 1 NÚT copy.
 * - Không có (flashcard) → render `<span>` tĩnh, KHÔNG phải nút (thân thẻ đã có
 *   hành vi click riêng — không lồng button trong button).
 * - `audio` (flashcard) → nút 🔊 đặt NGAY SAU cụm hán; caller tự bọc stopPropagation.
 * - Ký tự khác form bên kia (chỉ cột Mandarin) được đánh dấu `*` vàng.
 */
export function AlignedHanColumns({
    columns,
    hanClass,
    sinoClass,
    romanClass,
    diffFlags = null,
    copyText = "",
    onCopy,
    audio = null,
    t,
}) {
    const cols = columns ?? [];
    const copyable = Boolean(copyText && onCopy);
    // ⚠️ Nút 🔊 đặt ABSOLUTE ngay sau cụm hán — nếu để chung hàng (flex + gap) thì cụm hán bị
    // đẩy lệch sang trái đúng (bề rộng icon + gap)/2 ⇒ không còn căn giữa chính xác theo thẻ.
    const audioSlot = () =>
        audio ? (
            <span className="absolute top-1/2 left-full ml-3 inline-flex shrink-0 -translate-y-1/2 items-center">
                {audio}
            </span>
        ) : null;
    const body = (
        <span className="inline-flex flex-wrap items-start justify-center gap-2">
            {cols.map((col, i) => {
                const isDiff = diffFlags && diffFlags[i] && !diffFlags[i].same;
                return (
                    <span key={i} className="inline-flex flex-col items-center gap-2">
                        <span
                            className={cn(
                                "m-0 text-center text-sm font-semibold not-italic tracking-wide text-muted-foreground leading-none",
                                sinoClass,
                            )}
                        >
                            {col.sino}
                        </span>
                        <span className={cn(hanGlyphClass, "relative font-semibold", hanClass)}>
                            {isDiff && (
                                <span
                                    className="absolute top-0 -right-1 text-sm leading-none text-yellow-500"
                                    aria-hidden="true"
                                >
                                    *
                                </span>
                            )}
                            {col.han}
                        </span>
                        <span
                            className={cn(
                                "m-0 mt-1 text-center text-base font-semibold not-italic tracking-wide leading-none",
                                romanClass,
                            )}
                        >
                            {col.roman}
                        </span>
                    </span>
                );
            })}
        </span>
    );
    if (!copyable) {
        return (
            <span className="relative inline-flex items-center justify-center">
                {body}
                {audioSlot()}
            </span>
        );
    }
    return (
        <span className="relative inline-flex items-center justify-center">
            <button
                type="button"
                className="relative inline cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit leading-tight rounded transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                onClick={(e) => {
                    e.stopPropagation();
                    onCopy(copyText);
                }}
                title={`${copyText} — ${t?.common?.copy ?? "Copy"}`}
            >
                {body}
            </button>
            {audioSlot()}
        </span>
    );
}

/**
 * Danh sách nghĩa + ví dụ của 1 từ vựng (KHÔNG có header cách đọc).
 *
 * Dùng chung: trang detail (`ReadingMeaningsBlock` = `<ReadingHeader>` + block này)
 * và flashcard. Nghĩa đánh số liên tục, nối bằng đường dọc; ví dụ đánh chữ cái A/B/C,
 * hán tự căn cột với phiên âm từng chữ, tô sáng cụm từ đang học, 🔊 câu ví dụ.
 *
 * @param {object[]} meanings  mảng nghĩa (shape legacy: `vietMeanings`/`engMeanings`/`gloss`/`examples`)
 * @param {"pinyin"|"jyutping"} type  loại phiên âm ⇒ quyết định gloss zh + cột hán của ví dụ + giọng 🔊
 * @param {boolean} [defaultOpenExamples]  ép trạng thái mở của khối ví dụ (mặc định theo display settings)
 */
export function VocabularyMeaningsBlock({
    meanings,
    type,
    t,
    fmt,
    hanTraditional,
    hanSimplified,
    hanHongKong,
    englishAudio = null,
    defaultOpenExamples,
    showEmpty = true,
    onAddMeaning,
}) {
    const { showMeaningEn, showMeaningGloss, showExampleEn, examplesDefaultOpen } = useDisplaySettings();
    const rows = Array.isArray(meanings) ? meanings : [];
    const openExamples = defaultOpenExamples ?? examplesDefaultOpen;

    // ⚠️ 2026-08-30: bỏ hẳn group/category meaning — hiển thị nghĩa PHẲNG, đánh số liên tục.
    if (rows.length === 0) {
        if (!showEmpty) return null;
        return (
            <div className="flex items-center gap-2 py-2">
                <p className="text-sm text-muted-foreground italic">{t.wordDetail.noMeaningsYet}</p>
                {onAddMeaning && (
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto px-0 py-0 text-sm font-semibold text-viet hover:bg-transparent hover:text-viet/80 dark:hover:bg-transparent"
                        onClick={onAddMeaning}
                    >
                        {t.wordDetail.addNow}
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {rows.map((m, i, arr) => (
                <div key={m.id || i} className="relative flex flex-col">
                    {i < arr.length - 1 && (
                        <div aria-hidden className="absolute left-3.5 top-2 -bottom-4 w-px bg-border/70" />
                    )}
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2">
                        {/* Cột trái: số thứ tự — nằm trên line */}
                        <div className="relative z-10 flex w-7 items-baseline justify-center rounded-md bg-card">
                            <Badge variant="outline" className="shrink-0 rounded-md px-1 text-sm text-viet">
                                {i + 1}
                            </Badge>
                        </div>
                        {/* Cột phải: detail meanings (vi / en / gloss) + ví dụ */}
                        <div className="flex flex-col gap-1">
                            <span className="text-base font-semibold text-foreground">
                                {displayMeaning(m.vietMeanings) || "-"}
                            </span>
                            {showMeaningEn && (
                                <span className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-muted-foreground">
                                        {displayMeaning(m.engMeanings) || "-"}
                                    </span>
                                    {/* 🔊 Anh đặt SAU text (2026-08-22) */}
                                    {i === 0 && englishAudio && (
                                        <AudioPlayButton url={englishAudio} title={t.wordDetail?.listenEn} size="xs2" />
                                    )}
                                </span>
                            )}
                            {showMeaningGloss && type === "pinyin" && (
                                // ⚠️ 2026-08-22: gloss zh CHỈ mandarin — cantonese bỏ gloss (yue).
                                <span className="text-sm font-semibold text-muted-foreground">
                                    {m.gloss?.trim() || "-"}
                                </span>
                            )}
                            {(m.examples ?? []).length > 0 && (
                                <MeaningExamples
                                    label={fmt(t.wordDetail.examples, { count: (m.examples ?? []).length })}
                                    defaultOpen={openExamples}
                                >
                                    <div className="flex flex-col gap-2">
                                        {m.examples.map((ex, j, exArr) => {
                                            const exSimp = (ex.hanSimplified ?? "").trim();
                                            const exTrad = (ex.hanTraditional ?? "").trim();
                                            const exFallback = (ex.hanExample ?? "").trim();
                                            // Cột dọc theo ký tự Hán — chọn line hán theo loại phiên âm
                                            const exHan =
                                                type === "jyutping"
                                                    ? exTrad || exSimp || exFallback
                                                    : exSimp || exTrad || exFallback;
                                            const exRoman =
                                                (type === "pinyin" ? ex.pinyinExample : ex.jyutpingExample)?.trim() ||
                                                "";
                                            const hanChars = splitHanCharsAlign(exHan);
                                            const romanTokens = splitAlignedTokens(exRoman);
                                            const exampleMatched = vocabMatchIndices(hanChars, [
                                                hanTraditional,
                                                hanHongKong,
                                                hanSimplified,
                                            ]);
                                            const hasExampleColumns = hanChars.length > 0 || romanTokens.length > 0;
                                            return (
                                                <div
                                                    key={ex.id || j}
                                                    className="relative grid grid-cols-[auto_1fr] items-start gap-x-2"
                                                >
                                                    {j < exArr.length - 1 && (
                                                        <div
                                                            aria-hidden
                                                            className="absolute left-3.5 top-2 -bottom-2 w-px bg-border/70"
                                                        />
                                                    )}
                                                    {/* Cột counter nằm trên line (giống Hanzii — 2026-08-22) */}
                                                    <div className="relative z-10 flex w-7 items-start justify-center rounded-md bg-card pt-1">
                                                        <Badge
                                                            variant="outline"
                                                            className="shrink-0 rounded-md px-1 text-sm text-viet"
                                                        >
                                                            {String.fromCharCode(65 + j)}
                                                        </Badge>
                                                    </div>
                                                    {/* Cột nội dung — card */}
                                                    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted p-4">
                                                        {/* Cặp 1: câu (hanzi + romanization) + 🔊 hán sau text */}
                                                        <div className="flex items-start gap-2">
                                                            <div className="min-w-0">
                                                                {hasExampleColumns ? (
                                                                    <div className="flex flex-wrap items-start justify-start gap-1">
                                                                        {hanChars.length > 0 ? (
                                                                            hanChars.map((ch, ci) => (
                                                                                <span
                                                                                    key={ci}
                                                                                    className="inline-flex flex-col items-center gap-1"
                                                                                >
                                                                                    <span
                                                                                        className={cn(
                                                                                            "vocab-han m-0 text-center text-[24px] font-semibold leading-none text-foreground",
                                                                                            exampleMatched.has(ci) &&
                                                                                                highlightMarkClass,
                                                                                        )}
                                                                                    >
                                                                                        {ch}
                                                                                    </span>
                                                                                    <span
                                                                                        className={cn(
                                                                                            "m-0 text-center text-xs font-semibold leading-none",
                                                                                            exampleMatched.has(ci)
                                                                                                ? highlightMarkClass
                                                                                                : "text-muted-foreground",
                                                                                        )}
                                                                                    >
                                                                                        {romanTokens[ci] || "-"}
                                                                                    </span>
                                                                                </span>
                                                                            ))
                                                                        ) : (
                                                                            <span className="text-xs font-semibold text-muted-foreground">
                                                                                {exRoman}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-sm font-semibold text-muted-foreground">
                                                                        -
                                                                    </p>
                                                                )}
                                                            </div>
                                                            {/* 🔊 hán đặt SAU text — Cantonese: gTTS yue (cache R2), fallback Tracy; Mandarin: gTTS zh-CN, fallback giọng Windows (2026-08-25) */}
                                                            {type === "jyutping" && exHan && (
                                                                <AudioPlayButton
                                                                    cantoneseText={exHan}
                                                                    title={t.wordDetail?.listenHan}
                                                                    size="xs2"
                                                                    className="self-start pt-0.5"
                                                                />
                                                            )}
                                                            {type === "pinyin" && exHan && (
                                                                <AudioPlayButton
                                                                    mandarinText={exHan}
                                                                    title={t.wordDetail?.listenHan}
                                                                    size="xs2"
                                                                    className="self-start pt-0.5"
                                                                />
                                                            )}
                                                        </div>
                                                        {/* Cặp 2+3: vi + en gom sát nhau (2026-08-22) */}
                                                        <div className="flex flex-col gap-0.5">
                                                            <p className="text-base text-foreground font-semibold">
                                                                {ex.vietExamples?.trim()
                                                                    ? capitalizeSentences(ex.vietExamples)
                                                                    : "-"}
                                                            </p>
                                                            {showExampleEn && (
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-sm text-muted-foreground font-semibold">
                                                                        {ex.engExamples?.trim()
                                                                            ? capitalizeSentences(ex.engExamples)
                                                                            : "-"}
                                                                    </p>
                                                                    {/* 🔊 Anh đặt SAU text */}
                                                                    {ex.englishAudio && (
                                                                        <AudioPlayButton
                                                                            url={ex.englishAudio}
                                                                            title={t.wordDetail?.listenEn}
                                                                            size="xs2"
                                                                        />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </MeaningExamples>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
