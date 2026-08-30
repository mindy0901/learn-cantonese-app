#!/usr/bin/env node
/**
 * Bulk full-sync MANDARIN — tái tạo luồng nút "Full Sync - Mandarin" trên UI, chạy hàng loạt
 * cho các từ Mandarin chưa có dữ liệu (thiếu meanings / pinyin).
 *
 * Với mỗi từ:
 *   1) Scrap Hanzii (fetchHanziiMeanings) → build pinyin readings + meanings (vi/gloss từ Hanzii).
 *   2) Fill pinyin cho ví dụ còn thiếu (toPinyin).
 *   3) Sync nghĩa vi↔en + gloss zh còn thiếu (POST /api/translate — Google → LibreTranslate fallback).
 *   4) Ghi DB qua updateVocabulary("mandarin", id, payload) (chuẩn hóa + sync han_characters).
 *
 * Usage (trong container backend):
 *   node /app/full-sync-mandarin.mjs                 # đếm từ cần update (dry)
 *   node /app/full-sync-mandarin.mjs --limit 5       # dry-run 5 từ (không ghi DB)
 *   node /app/full-sync-mandarin.mjs --apply --limit 5
 *   node /app/full-sync-mandarin.mjs --apply --start 100 --limit 50   # batch từ 100
 *   node /app/full-sync-mandarin.mjs --apply         # TẤT CẢ từ thiếu dữ liệu (rất lâu)
 *   node /app/full-sync-mandarin.mjs --all --apply   # kể cả từ đã có meanings
 *   node /app/full-sync-mandarin.mjs --hsk --apply --limit 1000  # ưu tiên HSK 1→6 trước
 *
 * ⚠️ Ghi DB — phải có sự đồng ý user. Chạy --dry trước để xem số lượng.
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { fetchHanziiMeanings } from "./lib/hanziiScrape.js";
import { toPinyin } from "./lib/pinyin.js";
import { updateVocabulary, vocabularyInclude } from "./lib/prismaServiceSplit.js";

// ── CLI args ──
const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");
// Hỗ trợ cả `--limit=5` lẫn `--limit 5` (và --start).
const arg = (name) => {
    const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
    if (eq) return Number(eq.split("=")[1]);
    const idx = process.argv.indexOf(`--${name}`);
    if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
        return Number(process.argv[idx + 1]);
    }
    return 0;
};
const LIMIT = arg("limit");
const START = arg("start");
// Ưu tiên HSK 1→6 (rồi HSK 7-9, rồi không có cấp độ). (2026-08-28)
// --hsk-only: CHỈ xử lý HSK 1-6 (filter hskLevel) — dùng khi muốn full phần 1-6 còn lại. (2026-08-29)
const HSK_ONLY = process.argv.includes("--hsk-only");
const HSK_PRIORITY = process.argv.includes("--hsk") || HSK_ONLY;
const HSK_LEVELS_1_6 = ["HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6"];
const HSK_RANK = {
    "HSK 1": 1,
    "HSK 2": 2,
    "HSK 3": 3,
    "HSK 4": 4,
    "HSK 5": 5,
    "HSK 6": 6,
    "HSK 7-9": 7,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Prisma ──
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ── Helpers ported từ frontend (WordDetailContent.jsx / dataTransforms.js / WordEditFields.jsx) ──
const stripCjkPunct = (s) =>
    String(s ?? "")
        .replace(/[\u3000-\u303F\uFF00-\uFFEF，。！？、；：（）《》「」『』【】—…,.;:!?()"'“”]+/g, "")
        .trim();
const normScrapPinyin = (s) =>
    String(s ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
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

// Hanzii groups → meanings FLAT (legacy shape: vietMeanings/engMeanings/gloss/examples).
// onlySimplified=true (mandarin): KHÔNG lấy traditional trong 【】.
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
                            hanTraditional: "",
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

// ── Merge meaning scrap (không ghi đè trắng) — port từ WordDetailContent.jsx ──
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

// Legacy meanings (vietMeanings/engMeanings/gloss/examples) → API-object meanings (zh/vi/en/examples).
const langMeaningsFromLegacy = (meanings) =>
    (meanings ?? [])
        .filter((m) => (m.gloss ?? "").trim() || (m.vietMeanings ?? "").trim() || (m.engMeanings ?? "").trim())
        .map((m, i) => {
            const out = {
                id: m.id,
                position: i,
                zh: capFirst((m.gloss ?? "").trim()),
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
                        romanization: (ex.pinyinExample ?? "").trim(),
                        vi: capFirst((ex.vietExamples ?? "").trim()),
                        en: (ex.engExamples ?? "").trim(),
                        zh: p.hanSimplified,
                    };
                });
            return out;
        });

// Chuẩn hóa nghĩa sau translate (giống frontend): gộp separator + lowercase.
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

// ── Full sync 1 từ (trả payload + stats, KHÔNG ghi) ──
async function fullSyncOne(vocab) {
    const han = stripCjkPunct(
        String(vocab.hanziSimplified ?? "").trim() || String(vocab.hanziTraditional ?? "").trim(),
    );
    if (!han) return { status: "skip", reason: "no han" };

    // Existing readings (DB row → legacy flat shape).
    const existingRoms = (vocab.romanizations ?? []).map((r) => ({
        id: r.id,
        type: "pinyin",
        pinyin: r.pinyin ?? "",
        jyutping: "",
        sinoVietnamese: r.sinoVietnamese ?? "",
        meanings: (r.meanings ?? []).map((m) => ({
            id: m.id,
            category: m.category ?? "",
            gloss: m.zh ?? "",
            vietMeanings: m.vi ?? "",
            engMeanings: m.en ?? "",
            examples: (m.examples ?? []).map((ex) => ({
                id: ex.id,
                hanSimplified: ex.zh ?? "",
                hanTraditional: "",
                pinyinExample: ex.romanization ?? "",
                vietExamples: ex.vi ?? "",
                engExamples: ex.en ?? "",
            })),
        })),
    }));

    let res;
    try {
        res = await fetchHanziiMeanings(han, { hl: "vi" });
    } catch (err) {
        return { status: "error", reason: `hanzii: ${err.message}` };
    }
    const tones = (res?.tones ?? [])
        .map((tm) => ({
            pinyin: String(tm.pinyin ?? "").trim(),
            sinoVietnamese: String(tm.sinoVietnamese ?? "").trim(),
            hskLevel: String(tm.hskLevel ?? "").trim(),
            related: (res.relatedWords ?? {})[String(tm.pinyin ?? "").trim()] ?? undefined,
            meanings: buildScrapMeanings(tm.groups ?? []),
        }))
        .filter((tm) => tm.pinyin && tm.meanings.length);
    if (!tones.length) return { status: "skip", reason: "no hanzii tones/meanings" };

    const fallbackSino =
        String(res?.sinoVietnamese ?? "").trim() ||
        (res?.tones ?? []).find((t) => String(t.sinoVietnamese ?? "").trim())?.sinoVietnamese ||
        existingRoms.find((r) => (r.sinoVietnamese ?? "").trim())?.sinoVietnamese ||
        "";

    // Build pinyin readings (giữ id reading cũ khi cùng pinyin; merge meanings overlap).
    const nextRoms = tones.map((tm) => {
        const existing = existingRoms.find((rd) => normScrapPinyin(rd.pinyin) === normScrapPinyin(tm.pinyin));
        return {
            id: existing?.id,
            type: "pinyin",
            pinyin: tm.pinyin,
            jyutping: "",
            sinoVietnamese: tm.sinoVietnamese || existing?.sinoVietnamese || fallbackSino,
            related: tm.related,
            meanings: mergeScrapMeanings(existing?.meanings ?? [], tm.meanings),
        };
    });

    // Fill pinyin ví dụ còn thiếu (toPinyin backend).
    for (const rom of nextRoms) {
        for (const m of rom.meanings ?? []) {
            for (const ex of m.examples ?? []) {
                const exHan = stripCjkPunct((ex.hanSimplified ?? "").trim() || (ex.hanTraditional ?? "").trim());
                if (exHan && !(ex.pinyinExample ?? "").trim()) {
                    try {
                        ex.pinyinExample = cleanRomanization(String(toPinyin(exHan)));
                    } catch {
                        ex.pinyinExample = "";
                    }
                }
            }
        }
    }
    for (const rom of nextRoms) rom.meanings = dedupeMeanings(rom.meanings);

    // Sync vi↔en + gloss zh còn thiếu.
    let synced = 0;
    for (const rom of nextRoms) {
        for (const m of rom.meanings ?? []) {
            const mv = (m.vietMeanings ?? "").trim();
            const me = (m.engMeanings ?? "").trim();
            const mg = (m.gloss ?? "").trim();
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
            if (!mg && (me || mv)) {
                const gSource = me ? "en" : "vi";
                const tr = await translate(me || mv, gSource, "zh-CN");
                if (tr) {
                    m.gloss = normalizeGlossSeparators(tr);
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

    // Build payload API-object mandarin.
    const readings = nextRoms
        .filter((r) => String(r.pinyin ?? "").trim())
        .map((r) => ({
            id: r.id,
            pinyin: cleanRomanization(String(r.pinyin ?? "").toLowerCase()),
            sinoVietnamese: (r.sinoVietnamese ?? "").trim(),
            meanings: langMeaningsFromLegacy(r.meanings ?? []),
        }));

    const hskLevel = tones.find((tm) => tm.hskLevel)?.hskLevel ?? vocab.hskLevel ?? "";
    const payload = {
        id: vocab.id,
        hanziSimplified: String(vocab.hanziSimplified ?? ""),
        hanziTraditional: String(vocab.hanziTraditional ?? ""),
        hskLevel,
        popularity: vocab.popularity ?? null,
        relatedWords: res.relatedWords ?? null,
        readings,
    };

    return {
        status: "ok",
        synced,
        readingsCount: readings.length,
        payload,
        han,
        pinyin: readings.map((r) => r.pinyin).join(" | "),
    };
}

// ── Main ──
// Load batch theo thứ tự: id asc (mặc định) hoặc HSK priority (--hsk).
async function loadBatch(where, skip, take) {
    if (!HSK_PRIORITY) {
        return prisma.mandarinVocabulary.findMany({
            where,
            include: vocabularyInclude,
            orderBy: { id: "asc" },
            skip,
            take,
        });
    }
    // --hsk: lấy id + hskLevel (nhẹ), sort HSK 1-6 trước, slice, rồi fetch full rows đúng thứ tự.
    const all = await prisma.mandarinVocabulary.findMany({ where, select: { id: true, hskLevel: true } });
    const rank = (lv) => HSK_RANK[String(lv ?? "").trim()] ?? 99;
    all.sort(
        (a, b) =>
            rank(a.hskLevel) - rank(b.hskLevel) ||
            String(a.hskLevel ?? "").localeCompare(String(b.hskLevel ?? "")) ||
            a.id.localeCompare(b.id),
    );
    const batch = all.slice(skip, skip + take);
    if (!batch.length) return [];
    const rows = await prisma.mandarinVocabulary.findMany({
        where: { id: { in: batch.map((x) => x.id) } },
        include: vocabularyInclude,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return batch.map((x) => byId.get(x.id)).filter(Boolean);
}

async function main() {
    const missingFilter = {
        OR: [{ romanizations: { none: {} } }, { romanizations: { some: { meanings: { none: {} } } } }],
    };
    const where = ALL
        ? { hanziSimplified: { not: "" } }
        : HSK_ONLY
          ? { ...missingFilter, hskLevel: { in: HSK_LEVELS_1_6 } }
          : missingFilter;

    const total = await prisma.mandarinVocabulary.count({ where });
    const filterLabel = ALL
        ? "TẤT CẢ từ có han"
        : HSK_ONLY
          ? "từ chưa update (thiếu pinyin/meanings) — CHỈ HSK 1-6"
          : "từ chưa update (thiếu pinyin/meanings)";
    console.log(`[filter] ${filterLabel}${HSK_PRIORITY && !HSK_ONLY ? " — ưu tiên HSK 1-6" : ""}: ${total}`);
    if (!APPLY && !LIMIT) {
        console.log("(dry) chạy --apply để ghi DB; thêm --limit N để dry-run N từ.");
        await pool.end();
        return;
    }

    const take = LIMIT || total;
    const skip = START;
    const list = await loadBatch(where, skip, take);

    console.log(`[process] ${list.length} từ (${APPLY ? "APPLY — sẽ ghi DB" : "dry — không ghi"})`);
    const stats = { ok: 0, skip: 0, error: 0, synced: 0, words: 0 };
    let i = 0;
    for (const vocab of list) {
        i += 1;
        const r = await fullSyncOne(vocab);
        const hskTag = HSK_PRIORITY && String(vocab.hskLevel ?? "").trim() ? ` [${vocab.hskLevel}]` : "";
        if (r.status === "ok") {
            stats.ok += 1;
            stats.synced += r.synced;
            stats.words += 1;
            if (APPLY) {
                try {
                    await updateVocabulary("mandarin", vocab.id, r.payload);
                } catch (err) {
                    console.log(`[${i}/${list.length}] ${r.han} → WRITE ERROR: ${err.message}`);
                    stats.error += 1;
                    continue;
                }
            }
            console.log(
                `[${i}/${list.length}] ${r.han}${hskTag} (${r.pinyin}) → ${r.readingsCount} readings, synced ${r.synced} ${APPLY ? "✓" : "(dry)"}`,
            );
        } else if (r.status === "error") {
            stats.error += 1;
            console.log(`[${i}/${list.length}] ${r.han ?? vocab.id}${hskTag} → ERROR: ${r.reason}`);
        } else {
            stats.skip += 1;
            console.log(`[${i}/${list.length}] ${r.han ?? vocab.id}${hskTag} → skip: ${r.reason}`);
        }
        // Tránh Hanzii rate-limit (Cloudflare 429/502).
        await sleep(250);
    }

    console.log(`\n=== DONE ${APPLY ? "(APPLY)" : "(dry)"} ===`);
    console.log(`words OK: ${stats.words}, skip: ${stats.skip}, error: ${stats.error}, items synced: ${stats.synced}`);
    await pool.end();
}

main().catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
});
