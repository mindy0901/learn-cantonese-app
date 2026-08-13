import { spawn } from "node:child_process";
import { prisma } from "../lib/prisma.js";
import { toPinyin } from "../lib/pinyin.js";
import { lookupJyutping } from "../lib/jyutpingLookup.js";
import { normVocabularyField, vocabularyMergeKey } from "../lib/wordNormalize.js";
import { buildMergedSinoVietnameseMap } from "../lib/sinoVietnamesesMap.js";
import { applyDictMeanings, enrichMissingMeanings } from "../lib/meaningPipeline.js";

const PYTHON_BIN = "/opt/translate-venv/bin/python3";

/** Optional OCR.space cloud API key (set in .env.dev — server-side only). */
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY?.trim() ?? "";
const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";

/** Max characters to consider for a single word when segmenting OCR text. */
const MAX_WORD_LEN = 8;

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

/** Per-character Sino-Vietnamese reading (uppercase, space-separated). A char
 *  without a known Hán-Việt reading renders as "-" so every Han character has a
 *  slot (e.g. 喺唔 → "HẢI NGÔ", 㗎 → "-"). */
function deriveSinoVietnamese(text, sinoMap) {
    if (!sinoMap) return "";
    const parts = [];
    for (const ch of String(text ?? "")) {
        if (!HAN_CHAR_TEST.test(ch)) continue;
        const entry = sinoMap.get(ch);
        parts.push(entry?.value || "-");
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
    return new Promise((resolve) => {
        const proc = spawn(PYTHON_BIN, ["/app/scripts/ocr_rapid.py"], {
            stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (val) => {
            if (settled) return;
            settled = true;
            resolve(val);
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

/** Load existing vocabularies: han → row index (for segmentation) + merge-key set (for dedupe). */
async function buildVocabIndex() {
    const rows = await prisma.vocabulary.findMany({
        select: {
            hanTraditional: true,
            hanSimplified: true,
            pinyin: true,
            jyutping: true,
            vietMeanings: true,
            engMeanings: true,
        },
    });
    const byHan = new Map();
    const keys = new Set();
    for (const r of rows) {
        keys.add(vocabularyMergeKey(r));
        for (const han of [r.hanTraditional, r.hanSimplified]) {
            const h = normVocabularyField(han);
            if (!h) continue;
            byHan.set(h, betterRow(byHan.get(h), r));
        }
    }
    return { byHan, keys };
}

/**
 * Segment one contiguous Han run into words using forward maximal matching
 * against the existing vocabulary index. Unknown runs fall back to single chars.
 */
function segmentRun(run, byHan) {
    const words = [];
    let i = 0;
    while (i < run.length) {
        let matched = null;
        let len = 1;
        for (let l = Math.min(MAX_WORD_LEN, run.length - i); l >= 1; l--) {
            const row = byHan.get(normVocabularyField(run.slice(i, i + l)));
            if (row) {
                matched = row;
                len = l;
                break;
            }
        }
        words.push({ text: run.slice(i, i + len), row: matched });
        i += len;
    }
    return words;
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
function makeSuggestion(hanText, existing, converters, keys, byHan, sinoMap, forcePureCantonese) {
    let hanTraditional;
    let hanSimplified;
    if (existing) {
        hanTraditional = existing.hanTraditional;
        hanSimplified = existing.hanSimplified || null;
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
        toPinyin(hanSimplified || "") ||
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
    const sinoVietnamese = existing?.sinoVietnamese || deriveSinoVietnamese(hanTraditional, sinoMap) || "";

    // Meanings: bank (existing, user-curated) wins; otherwise CVDICT (vi) + CEDICT
    // (en) via the shared pipeline. An incomplete pair is filled by translate
    // fallback (enrichMissingMeanings).
    const dictFill = applyDictMeanings({
        hanTraditional,
        hanSimplified,
        vietMeanings: existing?.vietMeanings ?? "",
        engMeanings: existing?.engMeanings ?? "",
    });
    const vietMeanings = dictFill.vietMeanings;
    const engMeanings = dictFill.engMeanings;

    const key = vocabularyMergeKey({ hanTraditional, hanSimplified, pinyin, jyutping });
    return {
        key,
        hanTraditional,
        hanSimplified,
        pinyin: pureCantonese ? "" : pinyin.toLowerCase(),
        jyutping: jyutping.toLowerCase(),
        sinoVietnamese,
        pureCantonese,
        vietMeanings,
        engMeanings,
        exists: existing != null || keys.has(key),
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
            // (e.g. 㗎 → "㗎"). That is NOT a pinyin — skip it so the word can be
            // flagged pure Cantonese instead of showing a fake pinyin.
            const py = toPinyin(ch);
            if (py && py !== ch) parts.push(py);
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
    return Boolean(py && py !== ch);
}

/**
 * Build one cluster group from a Han run:
 *  - `cluster`: the WHOLE phrase (what the user mainly adds).
 *  - `members`: the individual words (single chars + known multi-char DB words)
 *    inside the phrase, exposed when the card is expanded. Each carries a `key`
 *    so the frontend can dedupe identical words across clusters.
 * For a single-char run there is only the cluster, no members.
 */
async function buildGroup(run, byHan, keys, converters, sinoMap, forcePureCantonese) {
    const norm = (t) => normVocabularyField(t);
    const cluster = makeSuggestion(run, byHan.get(norm(run)), converters, keys, byHan, sinoMap, forcePureCantonese);

    if (run.length === 1) {
        return { cluster, members: [] };
    }

    const members = [];
    const seen = new Set();
    for (const seg of segmentRun(run, byHan)) {
        const m = makeSuggestion(seg.text, seg.row, converters, keys, byHan, sinoMap, forcePureCantonese);
        if (m.key === cluster.key) continue; // don't duplicate the phrase itself
        if (seen.has(m.key)) continue;
        seen.add(m.key);
        members.push(m);
    }
    return { cluster, members };
}

/** Auto-translate meanings for suggestions whose dict lookup returned an
 *  incomplete vi-en pair — shared pipeline (meaningPipeline.enrichMissingMeanings). */

export async function ocrRoutes(fastify) {
    /**
     * POST /api/ocr-vocabulary
     * Body: { image: "<base64 or data URL>" }
     * OCR the image, extract Han words, and return suggested vocabulary entries
     * (han + pinyin + jyutping + meanings). Read-only — no DB writes.
     */
    fastify.post("/ocr-vocabulary", { bodyLimit: 15 * 1024 * 1024 }, async (request, reply) => {
        const { image, engine, pureCantonese } = request.body ?? {};
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
            const { byHan, keys } = await buildVocabIndex();
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

            // Build cluster groups (phrase + its individual words), deduped by cluster key.
            const groups = [];
            const seen = new Set();
            for (const run of safeRuns) {
                const g = await buildGroup(run, byHan, keys, converters, sinoMap, forcePure);
                if (seen.has(g.cluster.key)) continue;
                seen.add(g.cluster.key);
                groups.push(g);
            }

            // De-noise: a standalone single-char cluster whose character is already
            // a member of a multi-char cluster is redundant (e.g. OCR split 刀 out of
            // 飞刀 / misread 拳刃→拳+刀). The char is still reachable by expanding
            // the phrase card, so drop the standalone card.
            const memberKeys = new Set();
            for (const g of groups) for (const m of g.members) memberKeys.add(m.key);
            const filteredGroups = groups.filter((g) => {
                if ((g.cluster.hanTraditional || "").length > 1) return true;
                return !memberKeys.has(g.cluster.key);
            });

            // Auto-translate meanings for new items (phrases + member words).
            await enrichMissingMeanings(filteredGroups.flatMap((g) => [g.cluster, ...g.members]));

            return { text: text.trim().slice(0, 2000), groups: filteredGroups };
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
        try {
            const { Converter } = await import("opencc-js");
            const converters = {
                toSimp: Converter({ from: "hk", to: "cn" }),
                toTrad: Converter({ from: "cn", to: "hk" }),
            };
            const { byHan, keys } = await buildVocabIndex();
            const sug = makeSuggestion(
                raw,
                byHan.get(normVocabularyField(raw)),
                converters,
                keys,
                byHan,
                getSinoMap(),
                Boolean(request.body?.pureCantonese),
            );
            // Fill missing meanings via the app translate pipeline (same fallback as scan).
            await enrichMissingMeanings([sug]);
            return sug;
        } catch (err) {
            console.error("ocr-derive error:", err.message);
            return reply.status(500).send({ error: err.message });
        }
    });
}
