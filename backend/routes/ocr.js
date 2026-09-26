import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma.js";
import { toPinyin } from "../lib/pinyin.js";
import { lookupJyutping } from "../lib/jyutpingLookup.js";
import { normVocabularyField, vocabularyMergeKey } from "../lib/wordNormalize.js";
import { buildMergedSinoVietnameseMap } from "../lib/sinoVietnamesesMap.js";
import { applyDictMeanings, enrichMeaningsFromHanzi } from "../lib/meaningPipeline.js";

const __ocr_dirname = dirname(fileURLToPath(import.meta.url));
// Python binary: env override > Windows native (project venv nếu có, fallback `python` trong
// PATH) > docker (venv /opt/translate-venv). Scripts nằm cạnh backend (docker /app/scripts).
const OCR_VENV_PY = resolve(__ocr_dirname, "..", "..", ".venv", "Scripts", "python.exe");
const PYTHON_BIN =
    process.env.TRANSLATE_PYTHON_BIN ||
    (process.platform === "win32"
        ? existsSync(OCR_VENV_PY)
            ? OCR_VENV_PY
            : "python"
        : "/opt/translate-venv/bin/python3");
const SCRIPTS_DIR = resolve(__ocr_dirname, "..", "scripts");

/** Optional OCR.space cloud API key (set in .env.dev — server-side only). */
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY?.trim() ?? "";
const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";

/** CJK unified ideographs (+ extension A + compatibility). */
const HAN_RUN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
/** Non-global variant for .test() — global regexes are stateful (lastIndex) and skip chars in loops. */
const HAN_CHAR_TEST = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

// Lazy-loaded Han → Sino-Vietnamese map (backend/data/sino-vietnamese.json).
let sinoMapCache = null;
function getSinoMap() {
    if (!sinoMapCache) sinoMapCache = buildMergedSinoVietnameseMap().map;
    return sinoMapCache;
}

/** True khi text là ĐÚNG 1 hán tự (dùng để lấy Hán-Việt per-char từ bank). */
function isSingleHanChar(text) {
    const s = String(text ?? "");
    return s.length === 1 && HAN_CHAR_TEST.test(s);
}

/**
 * Per-character Sino-Vietnamese reading (uppercase, space-separated). A char
 * without a known Hán-Việt reading renders as "-" so every Han character has a
 * slot (e.g. 喺唔 → "HẢI NGÔ", 㗎 → "-").
 *
 * ⚠️ 2026-09-27: ƯU TIÊN Hán-Việt lấy từ CHÍNH BANK (`bankSino` = từ 1 chữ trong kho ngôn ngữ
 * đang quét, `otherBankSino` = kho còn lại) rồi mới tới map tĩnh `data/sino-vietnamese.json`.
 * Trước đây chỉ dùng map tĩnh ⇒ scan lệch với app (VD "呢啲" bank="NI ĐÍCH" nhưng scan="NI -",
 * "數字" bank="SỐ TỰ" vs scan="SỔ TỰ", "登機" bank="ĐĂNG CƠ" vs scan="ĐĂNG KI").
 */
function deriveSinoVietnamese(text, sinoMap, bankSino, otherBankSino) {
    const parts = [];
    for (const ch of String(text ?? "")) {
        if (!HAN_CHAR_TEST.test(ch)) continue;
        parts.push(bankSino?.get(ch) || otherBankSino?.get(ch) || sinoMap?.get(ch)?.value || "-");
    }
    return parts.join(" ");
}

/**
 * OCR via RapidOCR (Python / ONNX, PP-OCRv6 `ch` model bundled in the wheel) —
 * the LOCAL fallback. Each result region is a whole text block (already
 * clustered), so `words` is left empty and `lines` carry the full text.
 * Returns null on any failure so the caller falls back to it.
 */
function ocrViaRapid(buffer) {
    // ⚠️ KHÔNG đặt tên tham số executor là `resolve` — nó che mất `resolve` từ node:path,
    // làm `resolve(SCRIPTS_DIR, "ocr_rapid.py")` trả undefined → spawn sai script. (2026-09-02)
    return new Promise((resolvePromise) => {
        const proc = spawn(PYTHON_BIN, [resolve(SCRIPTS_DIR, "ocr_rapid.py")], {
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (val) => {
            if (settled) return;
            settled = true;
            resolvePromise(val);
        };
        const timer = setTimeout(() => {
            proc.kill();
            finish(null);
        }, 45000);
        proc.stdout.on("data", (d) => (stdout += d));
        proc.stderr.on("data", (d) => (stderr += d));
        proc.on("error", (err) => {
            console.error("RapidOCR spawn error:", err.message);
            finish(null);
        });
        proc.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                console.error("RapidOCR exit:", code, stderr.slice(0, 400));
                finish(null);
                return;
            }
            try {
                const data = JSON.parse(stdout);
                if (data?.error) {
                    console.error("RapidOCR:", data.error);
                    finish(null);
                    return;
                }
                const lines = (data.lines ?? []).map((l) => ({ text: l.text, bbox: l.box }));
                finish({ text: data.text ?? "", lines, words: [] });
            } catch (err) {
                console.error("RapidOCR parse error:", err.message, stdout.slice(0, 300));
                finish(null);
            }
        });
        proc.stdin.write(buffer.toString("base64"));
        proc.stdin.end();
    });
}

/**
 * OCR via OCR.space cloud API (uses the user's OCR_SPACE_API_KEY). Engine 2
 * (single-line) reads Chinese more reliably than engine 3 — engine 3 (Kraken)
 * misreads some characters (e.g. 喂喂 → 嗯嗯). Language is pinned to `chs`
 * (simplified) which also handles traditional text in practice; `auto` can
 * mis-detect CJK (e.g. 千机伞 → Hangul). Each ParsedText line becomes one text
 * region (like RapidOCR). Returns null on any failure so the caller can fall
 * back to local OCR.
 */
async function ocrViaOcrSpace(buffer, engine = 2) {
    if (!OCR_SPACE_API_KEY) {
        console.error("OCR.space: missing OCR_SPACE_API_KEY");
        return null;
    }
    try {
        const form = new URLSearchParams();
        form.append("apikey", OCR_SPACE_API_KEY);
        form.append("base64Image", `data:image/png;base64,${buffer.toString("base64")}`);
        form.append("language", "chs");
        form.append("OCREngine", String(engine));
        form.append("isOverlayRequired", "false");
        const res = await fetch(OCR_SPACE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form,
            signal: AbortSignal.timeout(30000),
        });
        const json = await res.json();
        if (json.IsErroredOnProcessing) {
            console.error("OCR.space:", json.ErrorMessage?.[0] ?? "error");
            return null;
        }
        const text = String(json.ParsedResults?.[0]?.ParsedText ?? "").trim();
        if (!text) return null;
        const lines = text
            .split(/\r?\n/)
            .map((t) => ({ text: t.trim(), box: null }))
            .filter((l) => l.text);
        return { text, lines, words: [] };
    } catch (err) {
        console.error("OCR.space error:", err.message);
        return null;
    }
}

/**
 * OCR an image buffer → raw text. OCR.space cloud is PRIMARY (unless the user
 * forces "local"), RapidOCR (local, ONNX) is the fallback. Only these two
 * engines are used — tesseract.js was removed.
 */
async function recognizeImage(buffer, engine) {
    if (engine !== "local") {
        const cloud = await ocrViaOcrSpace(buffer);
        if (cloud) return cloud;
    }

    const rapid = await ocrViaRapid(buffer);
    if (rapid && rapid.lines.length) return rapid;

    return { text: "", lines: [], words: [] };
}

/** Join adjacent Han characters of one text line into phrase clusters. */
function clusterLineWords(words) {
    const han = words
        .filter((w) => {
            const t = String(w?.text ?? "").trim();
            return t && HAN_CHAR_TEST.test(t) && !/[A-Za-z0-9]/.test(t);
        })
        .sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (!han.length) return [];

    const heights = han
        .map((w) => (w.bbox?.y1 ?? 0) - (w.bbox?.y0 ?? 0))
        .filter((h) => h > 0)
        .sort((a, b) => a - b);
    const medH = heights.length ? heights[Math.floor(heights.length / 2)] : 30;
    // Intra-phrase gaps can reach ~0.6-0.8× char height (upscaled screenshots);
    // table-column gaps are usually ≫ 1× char height, so 0.8× keeps phrases whole
    // while still separating columns.
    const gapThreshold = Math.max(12, Math.round(medH * 0.8));

    const clusters = [];
    let cur = "";
    let prevX1 = null;
    for (const w of han) {
        const gap = prevX1 === null ? 0 : w.bbox.x0 - prevX1;
        if (prevX1 !== null && gap > gapThreshold && cur) {
            clusters.push(cur);
            cur = "";
        }
        cur += String(w.text ?? "").trim();
        prevX1 = Math.max(prevX1 ?? 0, w.bbox.x1);
    }
    if (cur) clusters.push(cur);
    return clusters.filter((c) => c.length >= 1);
}

/**
 * Turn OCR regions into Han cluster strings.
 * Both OCR.space and RapidOCR return whole text blocks (each line = one
 * cluster), so a line's full text is used. A line that carries per-word bboxes
 * (`words`) is still clustered by gap as a safe fallback.
 * Returns an array of cluster strings (each ≥1 han char).
 */
function clusterHanWords(data) {
    const lines = Array.isArray(data?.lines) && data.lines.length ? data.lines : null;
    if (lines) {
        return lines.flatMap((ln) => {
            const words = Array.isArray(ln?.words) && ln.words.length ? ln.words : null;
            if (words) return clusterLineWords(words);
            // Whole line is already one text block (OCR.space / RapidOCR).
            const t = String(ln?.text ?? "").trim();
            return t ? (t.match(HAN_RUN_RE) ?? []) : [];
        });
    }
    return clusterLineWords(Array.isArray(data?.words) ? data.words : []);
}

/** Exported for testing. */
export { clusterHanWords };

/** Prefer a vocab row that carries more usable data (jyutping, meanings). */
function betterRow(a, b) {
    if (!a) return b;
    if (!b) return a;
    const score = (r) => (r.jyutping ? 1 : 0) + (r.vietMeanings ? 1 : 0) + (r.engMeanings ? 1 : 0);
    return score(b) > score(a) ? b : a;
}

/** Load existing vocabularies (cả 2 ngôn ngữ): han → row index (segmentation) + merge-key (dedupe). */
async function buildVocabIndex() {
    const [mandarin, cantonese] = await Promise.all([
        prisma.mandarinVocabulary.findMany({
            select: {
                id: true,
                hanziSimplified: true,
                hanziTraditional: true,
                romanizations: {
                    select: {
                        pinyin: true,
                        sinoVietnamese: true,
                        meanings: { select: { zh: true, vi: true, en: true } },
                    },
                },
            },
        }),
        prisma.cantoneseVocabulary.findMany({
            select: {
                id: true,
                hanziTraditionalHk: true,
                pureCantonese: true,
                romanizations: {
                    select: {
                        jyutping: true,
                        sinoVietnamese: true,
                        meanings: { select: { vi: true, en: true } },
                    },
                },
            },
        }),
    ]);

    const rows = [];
    for (const v of mandarin) {
        const first = v.romanizations?.[0];
        const m = first?.meanings?.[0];
        rows.push({
            id: v.id,
            lang: "mandarin",
            hanziTraditional: v.hanziTraditional ?? "",
            hanziSimplified: v.hanziSimplified ?? "",
            hanziTraditionalHk: "",
            pinyin: (v.romanizations ?? [])
                .map((r) => r.pinyin ?? "")
                .filter(Boolean)
                .join(" / "),
            jyutping: "",
            sinoVietnamese: first?.sinoVietnamese ?? "",
            vietMeanings: m ? m.vi || m.zh || "" : "",
            engMeanings: m?.en ?? "",
        });
    }
    for (const v of cantonese) {
        const first = v.romanizations?.[0];
        const m = first?.meanings?.[0];
        rows.push({
            id: v.id,
            lang: "cantonese",
            hanziTraditional: v.hanziTraditionalHk ?? "",
            hanziSimplified: "",
            hanziTraditionalHk: v.hanziTraditionalHk ?? "",
            pinyin: "",
            jyutping: (v.romanizations ?? [])
                .map((r) => r.jyutping ?? "")
                .filter(Boolean)
                .join(" / "),
            sinoVietnamese: first?.sinoVietnamese ?? "",
            vietMeanings: m ? m.vi || "" : "",
            engMeanings: m?.en ?? "",
        });
    }

    // ⚠️ 2026-09-27: Từ điển Hán-Việt PER-CHAR lấy từ CHÍNH BANK — các từ 1 chữ có Hán-Việt
    // trong DB (VD 啲 → "ĐÍCH", 地 → "ĐỊA"). Dùng để suy Hán-Việt cho từ MỚI khớp với app
    // (map tĩnh data/sino-vietnamese.json là nguồn phụ, đứng sau bank).
    const sinoByCharByLang = { mandarin: new Map(), cantonese: new Map() };
    for (const r of rows) {
        const sv = String(r.sinoVietnamese ?? "").trim();
        if (!sv) continue;
        for (const han of [r.hanziTraditional, r.hanziSimplified, r.hanziTraditionalHk]) {
            if (!isSingleHanChar(han)) continue;
            if (!sinoByCharByLang[r.lang].has(han)) sinoByCharByLang[r.lang].set(han, sv);
        }
    }

    // ⚠️ 2026-09-02: byHan + keys tách theo ngôn ngữ. Trước đây 1 map union → betterRow ưu tiên
    // row Cantonese (có jyutping, score cao hơn) → Mandarin mode derivePinyin/existing bị coi là
    // "Cantonese-only" → pinyin rỗng. Tách per-language để đúng kho đang quét.
    const byHanByLang = { mandarin: new Map(), cantonese: new Map() };
    const keysByLang = { mandarin: new Set(), cantonese: new Set() };
    for (const r of rows) {
        keysByLang[r.lang].add(vocabularyMergeKey(r));
        const byHan = byHanByLang[r.lang];
        for (const han of [r.hanziTraditional, r.hanziSimplified, r.hanziTraditionalHk]) {
            const h = normVocabularyField(han);
            if (!h) continue;
            byHan.set(h, betterRow(byHan.get(h), r));
        }
    }
    return { byHanByLang, keysByLang, sinoByCharByLang };
}

/**
 * Build one suggestion object (phrase or single word) with a stable dedupe key.
 * `exists` = already in the DB (by han + readings merge key).
 * `converters` = `{ toSimp, toTrad }` (OpenCC). We always normalise the OCR text
 * into a Traditional (primary) + Simplified pair, no matter which form OCR read,
 * and derive pinyin (pinyin-pro) + jyutping (words.hk → CC-Canto → to-jyutping).
 * `sinoMap` is the Han→Sino-Vietnamese map (per-char Hán-Việt).
 * `forcePureCantonese` treats the whole word as pure Cantonese (pinyin dropped).
 */
function makeSuggestion(
    hanText,
    existing,
    converters,
    keys,
    byHan,
    sinoMap,
    forcePureCantonese,
    lang,
    sinoByCharByLang,
) {
    let hanTraditional;
    let hanSimplified;
    if (existing) {
        hanTraditional = existing.hanziTraditional;
        hanSimplified = existing.hanziSimplified || null;
    } else {
        // Convert BOTH directions so we always propose the correct pair.
        hanTraditional = converters.toTrad(hanText);
        const simp = converters.toSimp(hanText);
        hanSimplified = simp && simp !== hanTraditional ? simp : null;
    }

    // Pinyin is only meaningful for characters that actually HAVE a Mandarin
    // reading. Characters known to the bank as Cantonese-only (jyutping present,
    // pinyin empty — e.g. 喺, 唔, 㗎) must NOT get a pinyin-pro guess like "xí wú";
    // build pinyin char-by-char from the bank, skipping those.
    const pinyin = (
        existing?.pinyin ||
        derivePinyin(hanTraditional, byHan) ||
        toPinyin(hanSimplified || hanTraditional) ||
        ""
    ).trim();
    const jyutping = (
        existing?.jyutping ||
        lookupJyutping(hanTraditional) ||
        lookupJyutping(hanSimplified || "") ||
        ""
    ).trim();

    // Pure Cantonese (2026-08-13): KHÔNG auto-detect nữa — flag này CHỈ set
    // manual bằng toggle trong edit page. OCR suggestion không tự gán
    // pureCantonese (tránh gán nhầm từ có pinyin như 長). Chỉ giữ khi client
    // gửi explicit `forcePureCantonese` (hiện frontend không gửi → luôn false).
    const pureCantonese = Boolean(forcePureCantonese);
    // ⚠️ 2026-09-27: Hán-Việt — bank (từ 1 chữ, cùng kho đang quét trước → kho kia → map tĩnh).
    const otherLang = lang === "mandarin" ? "cantonese" : "mandarin";
    const sinoVietnamese =
        existing?.sinoVietnamese ||
        deriveSinoVietnamese(hanTraditional, sinoMap, sinoByCharByLang?.[lang], sinoByCharByLang?.[otherLang]) ||
        "";

    // Meanings: bank (existing, user-curated) wins; otherwise CVDICT (vi) + CEDICT (en).
    // Bên còn thiếu được dịch ở bước sau bằng pipeline RIÊNG của scan
    // (enrichMeaningsFromHanzi: Google → LibreTranslate fallback, 2026-09-27).
    const dictFill = applyDictMeanings({
        hanTraditional,
        hanSimplified,
        vietMeanings: existing?.vietMeanings ?? "",
        engMeanings: existing?.engMeanings ?? "",
    });
    const vietMeanings = dictFill.vietMeanings;
    const engMeanings = dictFill.engMeanings;

    // ⚠️ 2026-09-02: suggestion TÁCH theo ngôn ngữ quét (lang) — cantonese/mandarin riêng,
    // theo chuẩn per-language của page (§2.2). Key + exists dùng keys đúng kho ngôn ngữ.
    const isMandarin = lang === "mandarin";
    const key = isMandarin
        ? vocabularyMergeKey({ hanTraditional, hanSimplified, pinyin, jyutping: "" })
        : vocabularyMergeKey({ hanTraditional, hanSimplified, jyutping });
    const base = {
        key,
        lang,
        sinoVietnamese,
        vietMeanings,
        engMeanings,
        exists: existing != null || keys.has(key),
    };
    if (isMandarin) {
        return {
            ...base,
            hanSimplified: hanSimplified || "",
            hanTraditional,
            pinyin: pureCantonese ? "" : pinyin.toLowerCase(),
        };
    }
    return {
        ...base,
        hanziTraditionalHk: hanTraditional,
        hanTraditional,
        pureCantonese,
        jyutping: jyutping.toLowerCase(),
    };
}

/**
 * Per-character pinyin using the vocabulary bank as ground truth:
 *  - char in bank WITH pinyin → use it,
 *  - char in bank as Cantonese-only (jyutping, no pinyin) → skip (no pinyin),
 *  - char unknown → fall back to pinyin-pro.
 * Returns a space-joined pinyin string ("" if no char has a real pinyin).
 */
function derivePinyin(text, byHan) {
    if (!byHan) return toPinyin(text);
    const parts = [];
    for (const ch of String(text ?? "")) {
        if (!HAN_CHAR_TEST.test(ch)) continue;
        const row = byHan.get(normVocabularyField(ch));
        if (row?.pinyin) parts.push(row.pinyin);
        else if (row && row.jyutping)
            continue; // Cantonese-only, no Mandarin reading
        else {
            // pinyin-pro returns the ORIGINAL char when it has no Mandarin reading
            // (e.g. 㗎 → "㗎") hoặc " - " (không đủ âm). Đó KHÔNG phải pinyin — bỏ
            // qua để từ có thể được gắn cờ pure Cantonese thay vì hiện pinyin giả.
            const py = toPinyin(ch);
            if (py && py !== ch && py !== " - ") parts.push(py);
        }
    }
    return parts.filter(Boolean).join(" ");
}

/**
 * True when this char actually has a Mandarin reading (pinyin-pro has it in its
 * dict and did NOT echo the char back), or the bank provides a pinyin. Bank
 * Cantonese-only chars (jyutping, no pinyin) → false.
 */
function charHasPinyin(ch, byHan) {
    const row = byHan.get(normVocabularyField(ch));
    if (row?.pinyin) return true;
    if (row && row.jyutping) return false; // Cantonese-only, no Mandarin reading
    const py = toPinyin(ch);
    return Boolean(py && py !== ch && py !== " - ");
}

/**
 * OCR → danh sách CỤM (cluster) để user thêm vào kho từ vựng.
 * ⚠️ 2026-09-27: CHỈ trả `cluster` — mỗi vùng/cụm OCR nhận diện được (KHÔNG còn `members`,
 * cũng KHÔNG lọc theo số lượng hán tự).
 */
export async function ocrRoutes(fastify) {
    /**
     * POST /api/ocr-vocabulary
     * Body: { image: "<base64 or data URL>" }
     * OCR the image → trả về các CỤM (cluster) OCR nhận diện được + gợi ý
     * (han + pinyin/jyutping + Hán-Việt + nghĩa vi/en). Read-only — no DB writes.
     */
    fastify.post("/ocr-vocabulary", { bodyLimit: 15 * 1024 * 1024 }, async (request, reply) => {
        const { image, engine, pureCantonese, lang } = request.body ?? {};
        // ⚠️ 2026-09-02: ngôn ngữ quét OCR (cantonese/mandarin) — quyết định shape suggestion trả về.
        const scanLang = lang === "mandarin" ? "mandarin" : "cantonese";
        if (!image || !String(image).trim()) {
            return reply.status(400).send({ error: "Missing image" });
        }
        const base64 = String(image)
            .trim()
            .replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "")
            .replace(/\s+/g, "");
        let buffer;
        try {
            buffer = Buffer.from(base64, "base64");
        } catch {
            return reply.status(400).send({ error: "Invalid image data" });
        }
        if (!buffer || buffer.length === 0) {
            return reply.status(400).send({ error: "Invalid image data" });
        }

        try {
            const { text, lines, words } = await recognizeImage(buffer, engine);
            const { byHanByLang, keysByLang, sinoByCharByLang } = await buildVocabIndex();
            const byHan = byHanByLang[scanLang];
            const sinoMap = getSinoMap();
            const forcePure = Boolean(pureCantonese);

            const { Converter } = await import("opencc-js");
            // Both directions: hk→cn (trad→simp) and cn→hk (simp→trad), so every
            // suggestion carries the correct Traditional (primary) + Simplified pair.
            const converters = {
                toSimp: Converter({ from: "hk", to: "cn" }),
                toTrad: Converter({ from: "cn", to: "hk" }),
            };

            // Prefer line-aware bbox clusters; fall back to contiguous text runs.
            const runs = clusterHanWords({ lines, words });
            const safeRuns = runs.length ? runs : (text.match(HAN_RUN_RE) ?? []);

            // ⚠️ 2026-09-27: CHỈ lấy CỤM — mỗi run OCR nhận diện được = 1 cluster, KHÔNG sinh
            // `members` (các từ lẻ bên trong cụm). Phân nhóm theo CỤM mà OCR đã gom (line-aware
            // bbox / khoảng cách) — KHÔNG lọc theo số lượng hán tự (cụm 1 chữ vẫn giữ nếu OCR
            // đọc nó thành 1 vùng riêng). Response giữ shape `[{ cluster }]`.
            const groups = [];
            const seen = new Set();
            for (const run of safeRuns) {
                const cluster = makeSuggestion(
                    run,
                    byHan.get(normVocabularyField(run)),
                    converters,
                    keysByLang[scanLang],
                    byHan,
                    sinoMap,
                    forcePure,
                    scanLang,
                    sinoByCharByLang,
                );
                if (seen.has(cluster.key)) continue;
                seen.add(cluster.key);
                groups.push({ cluster });
            }

            // Auto-translate meanings cho cụm mới bằng pipeline RIÊNG của scan
            // (Hán tự → vi/en: deep_translator/Google → LibreTranslate fallback). 2026-09-27
            await enrichMeaningsFromHanzi(groups.map((g) => g.cluster));

            return { text: text.trim().slice(0, 2000), groups };
        } catch (err) {
            console.error("ocr-vocabulary error:", err.message);
            return reply.status(500).send({ error: err.message });
        }
    });

    /**
     * POST /api/ocr-derive
     * Body: { text: "<han text>" }
     * Re-derive a vocabulary suggestion (Traditional + Simplified via OpenCC,
     * pinyin via pinyin-pro, jyutping via words.hk/CC-Canto) for ARBITRARY text.
     * Used to correct OCR misreads (e.g. 千 → 十) in the scan UI before saving.
     * Read-only — no DB writes.
     */
    fastify.post("/ocr-derive", async (request, reply) => {
        const raw = String(request.body?.text ?? "").trim();
        if (!raw) {
            return reply.status(400).send({ error: "Missing text" });
        }
        const scanLang = request.body?.lang === "mandarin" ? "mandarin" : "cantonese";
        try {
            const { Converter } = await import("opencc-js");
            const converters = {
                toSimp: Converter({ from: "hk", to: "cn" }),
                toTrad: Converter({ from: "cn", to: "hk" }),
            };
            const { byHanByLang, keysByLang, sinoByCharByLang } = await buildVocabIndex();
            const byHan = byHanByLang[scanLang];
            const sug = makeSuggestion(
                raw,
                byHan.get(normVocabularyField(raw)),
                converters,
                keysByLang[scanLang],
                byHan,
                getSinoMap(),
                Boolean(request.body?.pureCantonese),
                scanLang,
                sinoByCharByLang,
            );
            // Fill missing meanings via the SCAN translate pipeline (hanzi → vi/en,
            // Google → LibreTranslate fallback) — giống /ocr-vocabulary. (2026-09-27)
            await enrichMeaningsFromHanzi([sug]);
            return sug;
        } catch (err) {
            console.error("ocr-derive error:", err.message);
            return reply.status(500).send({ error: err.message });
        }
    });
}
