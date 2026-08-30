#!/usr/bin/env node
/**
 * Bulk full-sync CANTONESE — port từ full-sync-mandarin.mjs, cho các từ Cantonese mới (TypeDuck import).
 * Với mỗi từ còn thiếu dữ liệu:
 *   1) Scrape Hanzii (fetchHanziiMeanings) → Hán-Việt cả từ + nghĩa (vi) + ví dụ (zh/pinyin).
 *   2) Merge nghĩa scrape với nghĩa cũ (giữ en có sẵn, điền vi từ Hanzii).
 *   3) Ví dụ: chữ Hán (yue = traditional || simplified) + jyutping (lookupJyutping — words.hk → CC-Canto → to-jyutping).
 *   4) Sync vi↔en còn thiếu (POST /api/translate — Google → LibreTranslate fallback).
 *   5) Ghi DB qua updateVocabulary("cantonese", ...) (delete+recreate readings, giữ id).
 *
 * ⚠️ Hán-Việt CHỈ từ Hanzii — KHÔNG fallback map (user yêu cầu 2026-08-30).
 *    Nếu Hanzii không có entry (không tones/groups) → KHÔNG thêm nghĩa/ví dụ, chỉ dịch vi↔en nghĩa cũ.
 *
 * Usage (trong container backend):
 *   node /app/full-sync-cantonese.mjs                       # đếm (dry, không ghi)
 *   node /app/full-sync-cantonese.mjs --limit 5             # dry-run 5 từ
 *   node /app/full-sync-cantonese.mjs --apply --limit 5
 *   node /app/full-sync-cantonese.mjs --apply --start 100 --limit 50   # batch từ 100
 *   node /app/full-sync-cantonese.mjs --apply               # tất cả từ còn thiếu dữ liệu
 *   node /app/full-sync-cantonese.mjs --since 2026-08-29 --apply
 *   node /app/full-sync-cantonese.mjs --sino-only --apply   # CHỈ Hán-Việt (không đụng nghĩa/ví dụ)
 *   node /app/full-sync-cantonese.mjs --vi-only --apply     # CHỈ dịch nghĩa vi↔en (không scrape Hanzii)
 *
 * ⚠️ Ghi DB + scrape Hanzii — phải có sự đồng ý user. Chạy mặc định (dry) trước.
 * ⚠️ Bước dịch vi↔en tốn CPU LibreTranslate — chạy `--limit` từng đợt nhỏ nếu sợ lag.
 */
import { prisma } from "./lib/prisma.js";
import { fetchHanziiMeanings } from "./lib/hanziiScrape.js";
import { normalizeSinoVietnameseValue } from "./lib/sinoVietnameseReadings.js";
import { lookupJyutping } from "./lib/jyutpingLookup.js";
import { updateVocabulary } from "./lib/prismaServiceSplit.js";

// ── CLI args ──
const APPLY = process.argv.includes("--apply");
const SINO_ONLY = process.argv.includes("--sino-only");
const VI_ONLY = process.argv.includes("--vi-only");
const arg = (name) => {
    const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.split("=")[1];
    const idx = process.argv.indexOf(`--${name}`);
    if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
        return process.argv[idx + 1];
    }
    return "";
};
const LIMIT = Number(arg("limit") || 0);
const START = Number(arg("start") || 0);
const SINCE = arg("since"); // "YYYY-MM-DD"
const DRY = !APPLY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Helpers (port từ full-sync-mandarin) ──
const stripCjkPunct = (s) =>
    String(s ?? "")
        .replace(/[\u3000-\u303F\uFF00-\uFFEF，。！？、；：（）《》「」『』【】—…,.;:!?()"'“”]+/g, "")
        .trim();
const cleanRomanization = (value) =>
    String(value ?? "")
        .replace(/[，。！？、；：（）《》「」『』【】—…,.;:!?()"“”]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
const capFirst = (value) => {
    const s = (value ?? "").trim();
    if (!s) return s;
    return s.charAt(0).toLocaleUpperCase("vi") + s.slice(1);
};
const splitHanBracketed = (value) => {
    const s = String(value ?? "").trim();
    const m = s.match(/^([^【]*)(?:【([^】]*)】)?[\s\S]*$/);
    return { hanSimplified: (m?.[1] ?? "").trim(), hanTraditional: (m?.[2] ?? "").trim() };
};

// Hanzii groups → meanings FLAT (vietMeanings/engMeanings/gloss/examples).
const buildScrapMeanings = (groups) => {
    const meanings = [];
    let pos = 0;
    for (const grp of groups) {
        for (const m of grp.meanings ?? []) {
            meanings.push({
                vietMeanings: String(m.vi ?? "")
                    .replace(/^\s*\d+\.\s*/, "")
                    .trim(),
                engMeanings: "",
                gloss: (m.zh ?? "").trim(),
                position: pos++,
                examples: (m.examples ?? [])
                    .map((ex) => {
                        const parts = splitHanBracketed(ex.zh);
                        return {
                            hanSimplified: parts.hanSimplified,
                            hanTraditional: parts.hanTraditional || parts.hanSimplified,
                            pinyinExample: (ex.pinyin ?? "").trim(),
                            vietExamples: (ex.vi ?? "").trim(),
                            engExamples: "",
                        };
                    })
                    .filter((ex) => ex.hanSimplified || ex.pinyinExample || ex.vietExamples),
            });
        }
    }
    return meanings;
};

// Merge meaning scrap (không ghi đè trắng) — port từ full-sync-mandarin.
const splitSenseParts = (v) =>
    String(v ?? "")
        .split(/[,;，；/]+/)
        .map((s) => s.trim())
        .filter(Boolean);
const joinSenses = (partsA, partsB) => {
    const out = [...partsA];
    const seen = new Set(partsA.map((p) => p.toLowerCase()));
    for (const p of partsB) {
        const k = p.toLowerCase();
        if (!seen.has(k)) {
            out.push(p);
            seen.add(k);
        }
    }
    return out.join(", ");
};
const sensesOverlap = (exSenses, scSenses) => {
    if (!exSenses.length || !scSenses.length) return false;
    const exSet = new Set(exSenses.map((s) => s.toLowerCase()));
    const scSet = new Set(scSenses.map((s) => s.toLowerCase()));
    let common = 0;
    for (const s of scSet) if (exSet.has(s)) common += 1;
    if (!common) return false;
    const contained = [...scSet].every((s) => exSet.has(s)) || [...exSet].every((s) => scSet.has(s));
    return contained || common >= Math.min(exSet.size, scSet.size);
};
const exHanParts = (ex) => {
    const simp = String(ex?.hanSimplified ?? "").trim();
    const trad = String(ex?.hanTraditional ?? "").trim();
    if (simp || trad) return { hanSimplified: simp, hanTraditional: trad };
    const lines = String(ex?.hanExample ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    return { hanSimplified: lines[0] ?? "", hanTraditional: lines[1] ?? "" };
};
const normHanKey = (s) =>
    String(s ?? "")
        .replace(/[\u3000-\u303F\uFF00-\uFFEF，。！？、；：（）《》「」『』【】—…,.;:!?()"'“”]+/g, "")
        .trim();
const normRom = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .trim();
const mergeMeaningInto = (target, sc) => {
    const next = {
        ...target,
        vietMeanings: joinSenses(splitSenseParts(target.vietMeanings), splitSenseParts(sc.vietMeanings)),
        engMeanings: joinSenses(splitSenseParts(target.engMeanings), splitSenseParts(sc.engMeanings)),
        gloss: (target.gloss ?? "").trim() || sc.gloss?.trim() || "",
    };
    const exDedupKey = (ex) => {
        const rom = normRom(ex?.jyutpingExample) || normRom(ex?.pinyinExample);
        if (rom) return `rom:${rom}`;
        const p = exHanParts(ex);
        const han = normHanKey(p.hanSimplified) || normHanKey(p.hanTraditional);
        return han ? `han:${han}` : "";
    };
    const seenEx = new Set((target.examples ?? []).map((ex) => exDedupKey(ex)));
    const added = (sc.examples ?? []).filter((ex) => {
        const k = exDedupKey(ex);
        if (!k) return true;
        if (seenEx.has(k)) return false;
        seenEx.add(k);
        return true;
    });
    next.examples = [...(target.examples ?? []), ...added];
    return next;
};
const mergeScrapMeanings = (existing, scraped) => {
    const used = new Set();
    const out = (existing ?? []).map((ex) => {
        const exSenses = splitSenseParts(ex.vietMeanings);
        let merged = { ...ex, examples: [...(ex.examples ?? [])] };
        (scraped ?? []).forEach((sc, i) => {
            if (used.has(i)) return;
            if (sensesOverlap(exSenses, splitSenseParts(sc.vietMeanings))) {
                used.add(i);
                merged = mergeMeaningInto(merged, sc);
            }
        });
        return merged;
    });
    (scraped ?? []).forEach((sc, i) => {
        if (!used.has(i)) out.push(sc);
    });
    return out;
};
const dedupeMeanings = (meanings) => {
    const out = [];
    for (const m of meanings ?? []) {
        if (!String(m.vietMeanings ?? "").trim() && !String(m.engMeanings ?? "").trim()) {
            out.push(m);
            continue;
        }
        const mSenses = splitSenseParts(m.vietMeanings);
        const target = out.find((o) => sensesOverlap(splitSenseParts(o.vietMeanings), mSenses));
        if (target) out[out.indexOf(target)] = mergeMeaningInto(target, m);
        else out.push(m);
    }
    return out;
};

// Legacy flat meanings → API-object cantonese (vi/en + examples yue/romanization).
const cantoneseMeaningsFromLegacy = (meanings) =>
    (meanings ?? [])
        .filter((m) => (m.vietMeanings ?? "").trim() || (m.engMeanings ?? "").trim())
        .map((m, i) => {
            const out = {
                id: m.id,
                position: i,
                vi: capFirst((m.vietMeanings ?? "").trim()),
                en: capFirst((m.engMeanings ?? "").trim()),
            };
            out.examples = (m.examples ?? [])
                .filter((ex) => {
                    const p = exHanParts(ex);
                    return p.hanSimplified || p.hanTraditional || (ex.vietExamples ?? "").trim();
                })
                .map((ex, j) => {
                    const p = exHanParts(ex);
                    return {
                        id: ex.id,
                        position: j,
                        yue: p.hanTraditional || p.hanSimplified,
                        romanization: (ex.jyutpingExample ?? "").trim(),
                        vi: capFirst((ex.vietExamples ?? "").trim()),
                        en: (ex.engExamples ?? "").trim(),
                    };
                });
            return out;
        });

// Chuẩn hóa nghĩa sau translate (giống full-sync-mandarin): gộp separator + lowercase.
function normalizeMeaningSeparators(value) {
    return String(value ?? "")
        .replace(/[;；、]/g, ",")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s{2,}/g, " ")
        .replace(/[.。]+$/u, "")
        .trim();
}
const normalizeMeaningSync = (value) => normalizeMeaningSeparators(value).toLowerCase();
const normalizeGlossSeparators = (value) =>
    String(value ?? "")
        .replace(/[;；、]/g, ",")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s{2,}/g, " ")
        .trim();

// ── Translate (POST /api/translate — Google → LibreTranslate fallback) ──
const TRANSLATE_URL = process.env.TRANSLATE_URL || "http://localhost:3001/api/translate";
async function translate(text, source, target) {
    try {
        const res = await fetch(TRANSLATE_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text, source, target }),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return "";
        const data = await res.json();
        return String(data?.translated ?? "").trim();
    } catch {
        return "";
    }
}

// Hán-Việt ví dụ: pinyin → jyutping (words.hk → CC-Canto → to-jyutping).
function toJyutpingExample(han) {
    try {
        return cleanRomanization(lookupJyutping(han));
    } catch {
        return "";
    }
}

// ── Full sync 1 từ (trả payload + stats, KHÔNG ghi) ──
async function fullSyncOne(vocab) {
    const han = stripCjkPunct(String(vocab.hanziTraditionalHk ?? "").trim());
    if (!han) return { status: "skip", reason: "no han" };

    // Existing readings → legacy flat shape.
    const existingRoms = (vocab.romanizations ?? []).map((r) => ({
        id: r.id,
        jyutping: r.jyutping ?? "",
        sinoVietnamese: r.sinoVietnamese ?? "",
        meanings: (r.meanings ?? []).map((m) => ({
            id: m.id,
            category: m.category ?? "",
            gloss: "",
            vietMeanings: m.vi ?? "",
            engMeanings: m.en ?? "",
            examples: (m.examples ?? []).map((ex) => ({
                id: ex.id,
                hanSimplified: "",
                hanTraditional: ex.yue ?? "",
                jyutpingExample: ex.romanization ?? "",
                vietExamples: ex.vi ?? "",
                engExamples: ex.en ?? "",
            })),
        })),
    }));

    let res = null;
    if (!VI_ONLY) {
        try {
            res = await fetchHanziiMeanings(han, { hl: "vi" });
        } catch (err) {
            return { status: "error", reason: `hanzii: ${err.message}` };
        }
    }
    const hasEntry = !!res && (res.tones?.length || res.groups?.length);
    const sino = hasEntry ? normalizeSinoVietnameseValue(String(res?.sinoVietnamese ?? "").trim()) : "";

    // Scrap meanings + examples từ Hanzii (chỉ khi có entry thật).
    let scrapMeanings = [];
    if (hasEntry) {
        const groups = res.tones?.length ? res.tones.flatMap((t) => t.groups ?? []) : (res.groups ?? []);
        scrapMeanings = buildScrapMeanings(groups);
    }

    // Build next readings (giữ nguyên mọi reading cũ; gắn meanings scrape vào reading có meanings, else đầu).
    const targetIdx = existingRoms.findIndex((r) => (r.meanings ?? []).length);
    const targetIdxSafe = targetIdx >= 0 ? targetIdx : 0;
    let nextRoms = existingRoms.map((r, ri) => {
        const meanings =
            ri === targetIdxSafe && !VI_ONLY
                ? mergeScrapMeanings(r.meanings ?? [], scrapMeanings)
                : [...(r.meanings ?? [])];
        return { ...r, sinoVietnamese: sino || r.sinoVietnamese, meanings: dedupeMeanings(meanings) };
    });

    // Fill jyutping cho ví dụ còn thiếu (chỉ khi làm scrape meanings/ví dụ).
    if (!VI_ONLY) {
        for (const rom of nextRoms) {
            for (const m of rom.meanings ?? []) {
                for (const ex of m.examples ?? []) {
                    const exHan = stripCjkPunct((ex.hanTraditional ?? "").trim() || (ex.hanSimplified ?? "").trim());
                    if (exHan && !(ex.jyutpingExample ?? "").trim()) {
                        ex.jyutpingExample = toJyutpingExample(exHan);
                    }
                }
            }
        }
    }

    // Sync vi↔en còn thiếu cho nghĩa + ví dụ.
    let synced = 0;
    for (const rom of nextRoms) {
        for (const m of rom.meanings ?? []) {
            const mv = (m.vietMeanings ?? "").trim();
            const me = (m.engMeanings ?? "").trim();
            if (mv && !me) {
                const tr = await translate(mv, "vi", "en");
                if (tr) {
                    m.engMeanings = normalizeMeaningSync(tr);
                    synced += 1;
                }
            } else if (me && !mv) {
                const tr = await translate(me, "en", "vi");
                if (tr) {
                    m.vietMeanings = normalizeMeaningSync(tr);
                    synced += 1;
                }
            }
            for (const ex of m.examples ?? []) {
                const ev = (ex.vietExamples ?? "").trim();
                const ee = (ex.engExamples ?? "").trim();
                if (ev && !ee) {
                    const tr = await translate(ev, "vi", "en");
                    if (tr) {
                        ex.engExamples = normalizeGlossSeparators(tr);
                        synced += 1;
                    }
                } else if (ee && !ev) {
                    const tr = await translate(ee, "en", "vi");
                    if (tr) {
                        ex.vietExamples = normalizeGlossSeparators(tr);
                        synced += 1;
                    }
                }
            }
        }
    }

    // Build payload API-object cantonese.
    const readings = nextRoms
        .filter((r) => String(r.jyutping ?? "").trim())
        .map((r) => ({
            id: r.id,
            jyutping: cleanRomanization(String(r.jyutping ?? "").toLowerCase()),
            sinoVietnamese: (r.sinoVietnamese ?? "").trim(),
            meanings: cantoneseMeaningsFromLegacy(r.meanings ?? []),
        }));

    const payload = {
        id: vocab.id,
        hanziTraditionalHk: String(vocab.hanziTraditionalHk ?? ""),
        pureCantonese: !!vocab.pureCantonese,
        popularity: vocab.popularity ?? null,
        readings,
    };

    return {
        status: "ok",
        synced,
        readingsCount: readings.length,
        payload,
        han,
        jyutping: readings.map((r) => r.jyutping).join(" | "),
        skippedScrap: !hasEntry,
    };
}

// ── Main ──
async function main() {
    // Filter: từ còn thiếu dữ liệu (không meanings / thiếu vi / chưa có ví dụ).
    const missing = {
        romanizations: {
            some: {
                OR: [
                    { meanings: { none: {} } },
                    { meanings: { some: { vi: { equals: "" } } } },
                    { meanings: { some: { examples: { none: {} } } } },
                ],
            },
        },
    };
    const where = SINCE ? { AND: [missing, { createdAt: { gte: new Date(`${SINCE}T00:00:00.000Z`) } }] } : missing;

    const total = await prisma.cantoneseVocabulary.count({ where });
    console.log(`[filter] từ Cantonese còn thiếu dữ liệu: ${total}${SINCE ? ` (since ${SINCE})` : ""}`);
    if (!APPLY && !LIMIT) {
        console.log("(dry) chạy --apply để ghi DB; thêm --limit N để dry-run N từ.");
        return;
    }

    const take = LIMIT || total;
    const list = await prisma.cantoneseVocabulary.findMany({
        where,
        include: { romanizations: { include: { meanings: { include: { examples: {} } } } } },
        orderBy: { createdAt: "asc" },
        skip: START,
        take,
    });

    console.log(`[process] ${list.length} từ (${APPLY ? "APPLY — sẽ ghi DB" : "dry — không ghi"})`);
    const stats = { ok: 0, skip: 0, error: 0, synced: 0, words: 0, noScrap: 0 };
    let i = 0;
    for (const vocab of list) {
        i += 1;
        const r = await fullSyncOne(vocab);
        if (r.status === "ok") {
            stats.ok += 1;
            stats.synced += r.synced;
            stats.words += 1;
            if (r.skippedScrap) stats.noScrap += 1;
            if (APPLY) {
                try {
                    await updateVocabulary("cantonese", vocab.id, r.payload);
                } catch (err) {
                    console.log(`[${i}/${list.length}] ${r.han} → WRITE ERROR: ${err.message}`);
                    stats.error += 1;
                    continue;
                }
            }
            console.log(
                `[${i}/${list.length}] ${r.han} (${r.jyutping}) → ${r.readingsCount} readings, synced ${r.synced}${r.skippedScrap ? " (Hanzii no entry)" : ""} ${APPLY ? "✓" : "(dry)"}`,
            );
        } else if (r.status === "error") {
            stats.error += 1;
            console.log(`[${i}/${list.length}] ${r.han ?? vocab.id} → ERROR: ${r.reason}`);
        } else {
            stats.skip += 1;
            console.log(`[${i}/${list.length}] ${r.han ?? vocab.id} → skip: ${r.reason}`);
        }
        // Tránh Hanzii rate-limit (Cloudflare 429/502).
        await sleep(250);
    }

    console.log(`\n=== DONE ${APPLY ? "(APPLY)" : "(dry)"} ===`);
    console.log(
        `words OK: ${stats.words}, skip: ${stats.skip}, error: ${stats.error}, synced: ${stats.synced}, Hanzii-no-entry: ${stats.noScrap}`,
    );
}

main()
    .catch((err) => {
        console.error("FATAL:", err instanceof Error ? err.stack || err.message : err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
