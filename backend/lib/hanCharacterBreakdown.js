import { randomUUID } from "crypto";
import { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "./prisma.js";

/** Check if a single char is a CJK Unified Ideograph (U+4E00–U+9FFF) or Extension A (U+3400–U+4DBF). */
function isHanChar(ch) {
    const code = ch.codePointAt(0);
    return (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff);
}

/** Split a string into individual CJK characters (preserving order & duplicates). */
function splitHanChars(text) {
    const value = String(text ?? "").trim();
    if (!value) return [];
    return [...value].filter((ch) => isHanChar(ch));
}

/** Split a pinyin string into per-syllable parts (space/comma separated), lowercased. */
function splitPinyinParts(pinyin) {
    return String(pinyin ?? "")
        .split(/[\s,/、]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

/** Split a jyutping string into per-syllable parts (space separated), lowercased. */
function splitJyutpingParts(jyutping) {
    return String(jyutping ?? "")
        .split(/\s+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Split a sino-Vietnamese string into readings.
 * A "reading" = whitespace-separated group; alternatives within a reading are
 * joined by "|" (e.g. "TỊNH | TÍNH" = ONE reading, read as TỊNH or TÍNH).
 */
function splitSinoVietnameseParts(sinoVietnamese) {
    const tokens = String(sinoVietnamese ?? "")
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const ALT = new Set(["|", "/", "—", "·", "•"]);
    const readings = [];
    let cur = null;
    for (const t of tokens) {
        if (ALT.has(t)) {
            if (cur) cur += " " + t; // separator attaches to previous reading
            continue;
        }
        if (cur && cur.endsWith("|")) {
            cur += " " + t; // next alternative continues current reading
        } else {
            if (cur) readings.push(cur);
            cur = t;
        }
    }
    if (cur) readings.push(cur);
    return readings;
}

/**
 * Compute the `hanCharacters` breakdown for a vocabulary.
 * Returns an array aligned by position, e.g. for 挨家挨戶:
 * [{ sinoVietnamese: "...", hanSimplified: "", hanTraditional: "挨", pinyin: "āi", jyutping: "aai1" }, ...]
 *
 * Key order (BẮT BUỘC): `sinoVietnamese` → `hanSimplified` → `hanTraditional` → `pinyin` → `jyutping`.
 * - `hanTraditional` is the traditional form (default).
 * - `hanSimplified` ALWAYS present — set to the per-position simplified form when it
 *   differs from the traditional form (variant pair like 戶/户), else empty string "".
 * - `sinoVietnamese` is the per-position Hán-Việt reading when it can be aligned (else null).
 * - Reads are aligned by index to the traditional characters.
 * - Readings are aggregated across ALL pronunciations (the `romanization` array), joined
 *   with " / " when a character has different readings per pronunciation.
 *
 * @param {{ hanTraditional?: string, hanSimplified?: string, pinyin?: string, jyutping?: string, sinoVietnamese?: string, romanization?: Array, romanizationJson?: Array }} vocab
 * @returns {Array<{ sinoVietnamese: string|null, hanSimplified: string, hanTraditional: string, pinyin: string|null, jyutping: string|null }>}
 */
export function computeHanCharacters(vocab) {
    const trad = (vocab.hanTraditional ?? "").trim();
    const simp = (vocab.hanSimplified ?? "").trim();

    const tradChars = splitHanChars(trad);
    const simpChars = splitHanChars(simp);
    const chars = tradChars.length > 0 ? tradChars : simpChars;
    if (chars.length === 0) return [];

    // Gather readings from ALL pronunciations.
    // Model mới (2026-08-14): romanization_json = { mandarin, cantonese } blocks;
    // fallback legacy typed array / flat.
    let sources = [];
    const rj = vocab?.romanizationJson;
    if (rj && typeof rj === "object" && !Array.isArray(rj) && (rj.mandarin || rj.cantonese)) {
        for (const r of rj.mandarin?.readings ?? []) {
            sources.push({ pinyin: r?.romanization ?? "", jyutping: "", sinoVietnamese: r?.sino_vietnamese ?? "" });
        }
        for (const r of rj.cantonese?.readings ?? []) {
            sources.push({ pinyin: "", jyutping: r?.romanization ?? "", sinoVietnamese: r?.sino_vietnamese ?? "" });
        }
    } else {
        const romanizations =
            Array.isArray(vocab?.romanization) && vocab.romanization.length > 0
                ? vocab.romanization
                : Array.isArray(rj) && rj.length > 0
                  ? rj
                  : null;
        sources = romanizations
            ? romanizations.map((r) => ({
                  pinyin: r?.pinyin ?? "",
                  jyutping: r?.jyutping ?? "",
                  sinoVietnamese: r?.sinoVietnamese ?? "",
              }))
            : [{ pinyin: vocab.pinyin, jyutping: vocab.jyutping, sinoVietnamese: vocab.sinoVietnamese }];
    }

    // Per-position aggregated reading sets (dedupe case-insensitive for py/jp)
    const pyByPos = chars.map(() => new Set());
    const jpByPos = chars.map(() => new Set());
    const svByPos = chars.map(() => new Set());

    for (const src of sources) {
        const pyParts = splitPinyinParts(src.pinyin);
        const jpParts = splitJyutpingParts(src.jyutping);
        const svParts = splitSinoVietnameseParts(src.sinoVietnamese);
        const svAligned =
            svParts.length > 0 && (chars.length === 1 || (chars.length > 1 && svParts.length % chars.length === 0));
        for (let i = 0; i < chars.length; i++) {
            if (pyParts[i]) pyByPos[i].add(pyParts[i]);
            if (jpParts[i]) jpByPos[i].add(jpParts[i]);
            if (svAligned) {
                if (chars.length === 1) {
                    svByPos[i].add(svParts.join(" "));
                } else {
                    const candidates = [];
                    for (let k = i; k < svParts.length; k += chars.length) candidates.push(svParts[k]);
                    if (candidates.length > 0) svByPos[i].add(candidates.join(" "));
                }
            }
        }
    }

    const joinReading = (set) => (set.size > 0 ? [...set].sort().join(" / ") : null);

    return chars.map((character, i) => {
        const simpChar = simpChars.length === chars.length ? simpChars[i] : undefined;
        return {
            sinoVietnamese: joinReading(svByPos[i]),
            // Luôn giữ hanSimplified (single-form: simp == trad, không set rỗng — 2026-08-13)
            hanSimplified: simpChar ?? "",
            hanTraditional: character,
            pinyin: joinReading(pyByPos[i]),
            jyutping: joinReading(jpByPos[i]),
        };
    });
}

/** Split an aggregated breakdown reading (joined with " / ") into individual readings. */
function splitBreakdownReadings(value) {
    return String(value ?? "")
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Normalize one breakdown item to the canonical key order
 * (sinoVietnamese → hanSimplified → hanTraditional → pinyin → jyutping).
 * Preserves unknown extra keys; missing ones default to null/"". Used in
 * rowToVocabulary so the API always emits keys in the canonical order even
 * though Postgres JSONB re-sorts stored keys.
 */
export function normalizeHanCharItem(item) {
    const simp = String(item?.hanSimplified ?? "").trim();
    return {
        sinoVietnamese: item?.sinoVietnamese ?? null,
        // Giữ hanSimplified luôn (single-form: simp == trad — 2026-08-13)
        hanSimplified: simp || "",
        hanTraditional: String(item?.hanTraditional ?? item?.character ?? "").trim(),
        pinyin: item?.pinyin ?? null,
        jyutping: item?.jyutping ?? null,
    };
}

/** Score a HanCharacter by data richness (readings, traditional). */
function hanCharScore(h) {
    let s = 0;
    const jp = Array.isArray(h.jyutping) ? h.jyutping : h.jyutping ? [h.jyutping] : [];
    const py = Array.isArray(h.pinyin) ? h.pinyin : h.pinyin ? [h.pinyin] : [];
    const hv = Array.isArray(h.sinoVietnamese) ? h.sinoVietnamese : h.sinoVietnamese ? [h.sinoVietnamese] : [];
    s += jp.length + py.length + hv.length;
    if (h.hanTraditional) s += 2;
    return s;
}

/**
 * Resolve a character to a single HanCharacter entry, deduplicating on the fly.
 * Finds ALL matching entries (by simplified OR traditional), merges readings from
 * duplicates into the best-scoring keeper, re-links vocabulary_characters, then
 * deletes the duplicates.
 *
 * @param {string} ch
 * @returns {Promise<{ han: object|null, merged: number }>}
 */
async function resolveHanCharacter(ch) {
    if (!ch) return { han: null, merged: 0 };
    const matches = await prisma.hanCharacter.findMany({
        where: { OR: [{ hanTraditional: ch }, { hanSimplified: ch }] },
        orderBy: { createdAt: "asc" },
    });
    if (matches.length === 0) return { han: null, merged: 0 };

    const keeper = [...matches].sort((a, b) => hanCharScore(b) - hanCharScore(a))[0];
    const dupes = matches.filter((m) => m.id !== keeper.id);
    if (dupes.length === 0) return { han: keeper, merged: 0 };

    // Merge readings from all dupes into keeper (only add new, never remove)
    // Pinyin/jyutping are case-insensitive → lowercase; sinoVietnamese stays as-is (uppercase convention)
    const mergeArr = (target, ...sources) => {
        const set = new Set(Array.isArray(target) ? target.map((s) => String(s ?? "").trim()).filter(Boolean) : []);
        for (const src of sources) {
            const arr = Array.isArray(src) ? src : src ? [src] : [];
            for (const v of arr) {
                const s = String(v ?? "").trim();
                if (s) set.add(s);
            }
        }
        return [...set].sort();
    };
    // Case-insensitive: dedupe by lowercase, keep lowercase form ("Gāo" === "gāo")
    const mergeArrCaseInsensitive = (target, ...sources) => {
        const set = new Set();
        const add = (v) => {
            const s = String(v ?? "")
                .trim()
                .toLowerCase();
            if (s) set.add(s);
        };
        if (Array.isArray(target)) target.forEach(add);
        else add(target);
        for (const src of sources) {
            const arr = Array.isArray(src) ? src : src ? [src] : [];
            arr.forEach(add);
        }
        return [...set].sort();
    };

    const mergedPinyin = mergeArrCaseInsensitive(keeper.pinyin, ...dupes.map((d) => d.pinyin));
    const mergedJyutping = mergeArrCaseInsensitive(keeper.jyutping, ...dupes.map((d) => d.jyutping));
    const mergedSv = mergeArr(keeper.sinoVietnamese, ...dupes.map((d) => d.sinoVietnamese));
    const simp =
        (keeper.hanSimplified ?? "").trim() || dupes.find((d) => (d.hanSimplified ?? "").trim())?.hanSimplified || null;
    const trad = (keeper.hanTraditional ?? "").trim() || ch;

    // Re-link any vocabulary_characters pointing to dupes → keeper (before deleting)
    for (const d of dupes) {
        await prisma.vocabularyCharacter.updateMany({
            where: { hanCharacterId: d.id },
            data: { hanCharacterId: keeper.id },
        });
    }

    await prisma.hanCharacter.update({
        where: { id: keeper.id },
        data: {
            hanTraditional: trad,
            hanSimplified: simp,
            pinyin: mergedPinyin,
            jyutping: mergedJyutping,
            sinoVietnamese: mergedSv,
            updatedAt: new Date(),
        },
    });

    // Delete duplicates
    await prisma.hanCharacter.deleteMany({ where: { id: { in: dupes.map((d) => d.id) } } });

    return { han: await prisma.hanCharacter.findUnique({ where: { id: keeper.id } }), merged: dupes.length };
}

/**
 * Merge new readings into existing arrays (only add new, never remove/overwrite existing).
 * Pinyin/jyutping are case-insensitive ("Gāo" === "gāo") → normalized to lowercase.
 */
function mergeReadings(existingArr, newVal) {
    const norm = (s) =>
        String(s ?? "")
            .trim()
            .toLowerCase();
    const base = Array.isArray(existingArr) ? existingArr.map(norm).filter(Boolean) : [];
    const set = new Set(base);
    const v = norm(newVal);
    if (v) set.add(v);
    return [...set].sort();
}

/**
 * Merge sino-Vietnamese readings — a value like "TỊNH | TÍNH" is ONE reading
 * (alternatives), so keep the whole group as a single element and drop any
 * standalone alternatives (e.g. old split "TỊNH", "TÍNH") from the set.
 */
function mergeSinoReadings(existingArr, newVal) {
    const base = Array.isArray(existingArr) ? existingArr.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
    const set = new Set(base);
    for (const reading of splitSinoVietnameseParts(newVal)) {
        if (reading.includes("|")) {
            // "A | B" supersedes standalone "A" / "B" left by earlier splits
            for (const alt of reading
                .split("|")
                .map((s) => s.trim())
                .filter(Boolean)) {
                set.delete(alt);
            }
        }
        set.add(reading);
    }
    return [...set].sort();
}

/**
 * Sync a vocabulary's hanCharacters into the HanCharacter store:
 *  1. For each unique character, find-or-create a HanCharacter (merge readings, no overwrite).
 *  2. Link via `vocabulary_characters` with position (unique chars only — join has unique constraint).
 *
 * @param {string} vocabularyId
 * @param {Array<{ hanTraditional?: string, character?: string, pinyin?: string|null, jyutping?: string|null, hanSimplified?: string, sinoVietnamese?: string|null }>} hanChars
 * @returns {Promise<{ created: number, updated: number, linked: number }>}
 */
export async function syncVocabularyHanCharacters(vocabularyId, hanChars) {
    if (!vocabularyId || !Array.isArray(hanChars) || hanChars.length === 0) {
        return { created: 0, updated: 0, linked: 0 };
    }

    let created = 0;
    let updated = 0;
    let linked = 0;
    let merged = 0;
    const seenChars = new Set();

    // Delete old links for this vocabulary (only unique-char links exist)
    await prisma.vocabularyCharacter.deleteMany({ where: { vocabularyId } });

    for (let i = 0; i < hanChars.length; i++) {
        const item = hanChars[i];
        const ch = String(item?.hanTraditional ?? item?.character ?? "").trim();
        if (!ch || seenChars.has(ch)) continue; // skip empty & duplicates (join has unique constraint)
        seenChars.add(ch);

        // Variant pair (simplified form) for this position, e.g. 戶 → 户
        const simpVariant = String(item?.hanSimplified ?? "").trim() || undefined;

        const resolved = await resolveHanCharacter(ch);
        let han = resolved.han;
        merged += resolved.merged;
        // Breakdown pinyin/jyutping may aggregate several readings ("jiē / jié")
        const itemPinyin = splitBreakdownReadings(item.pinyin);
        const itemJyutping = splitBreakdownReadings(item.jyutping);
        if (han) {
            let newPinyin = Array.isArray(han.pinyin) ? han.pinyin : [];
            for (const p of itemPinyin) newPinyin = mergeReadings(newPinyin, p);
            let newJyutping = Array.isArray(han.jyutping) ? han.jyutping : [];
            for (const j of itemJyutping) newJyutping = mergeReadings(newJyutping, j);
            const newSino = mergeSinoReadings(han.sinoVietnamese, item.sinoVietnamese);
            const pyChanged = newPinyin.join("|") !== (Array.isArray(han.pinyin) ? han.pinyin.join("|") : "");
            const jpChanged = newJyutping.join("|") !== (Array.isArray(han.jyutping) ? han.jyutping.join("|") : "");
            const svChanged =
                newSino.join("|") !== (Array.isArray(han.sinoVietnamese) ? han.sinoVietnamese.join("|") : "");
            // Fill missing simplified variant when known (never overwrite existing)
            const simpMissing = !(han.hanSimplified ?? "") && simpVariant && simpVariant !== han.hanTraditional;
            if (pyChanged || jpChanged || svChanged || simpMissing) {
                await prisma.hanCharacter.update({
                    where: { id: han.id },
                    data: {
                        pinyin: newPinyin,
                        jyutping: newJyutping,
                        sinoVietnamese: newSino,
                        hanTraditional: ch,
                        ...(simpMissing ? { hanSimplified: simpVariant } : {}),
                        updatedAt: new Date(),
                    },
                });
                updated++;
            }
        } else {
            // Create new — record variant pair when known, else single-form (hanSimplified = NULL)
            han = await prisma.hanCharacter.create({
                data: {
                    id: randomUUID(),
                    hanTraditional: ch,
                    hanSimplified: simpVariant || null,
                    pinyin: itemPinyin.map((s) => s.toLowerCase()),
                    jyutping: itemJyutping.map((s) => s.toLowerCase()),
                    sinoVietnamese: mergeSinoReadings([], item.sinoVietnamese),
                    searchKey: null,
                },
            });
            created++;
        }

        // Link vocabulary → han character (position = first occurrence)
        await prisma.vocabularyCharacter.create({
            data: {
                id: randomUUID(),
                vocabularyId,
                hanCharacterId: han.id,
                position: i,
            },
        });
        linked++;
    }

    return { created, updated, linked, merged };
}

/**
 * Backfill `hanCharacters` JSON + HanCharacter store for vocabularies.
 * Supports two modes:
 *  - "fast": only process vocabularies that don't have `hanCharacters` yet
 *    (skip already-synced ones). No deletion, only merge/add.
 *  - "full": delete ALL han_characters + vocabulary_characters links, then
 *    rebuild everything from scratch across all vocabularies.
 *
 * @param {object} [where] Additional Prisma where for vocabularies
 * @param {(info: { processed: number, total: number, current?: string }) => void} [onProgress]
 * @param {"fast"|"full"} [mode]
 * @returns {Promise<{ total: number, chars: number, created: number, updated: number, linked: number, merged: number, reset: boolean }>}
 */
export async function backfillVocabularyHanCharacters(where = {}, onProgress = null, mode = "fast") {
    let reset = false;
    let vocabWhere = { ...where };
    if (mode === "full") {
        // Full rebuild: wipe store + links, then re-sync everything
        await prisma.vocabularyCharacter.deleteMany({});
        await prisma.hanCharacter.deleteMany({});
        reset = true;
        vocabWhere = {};
    } else {
        // Fast: only vocabularies missing hanCharacters (never synced)
        vocabWhere = { ...where, hanCharacters: { equals: Prisma.DbNull } };
    }

    const vocabs = await prisma.vocabulary.findMany({
        where: vocabWhere,
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            pinyin: true,
            jyutping: true,
            sinoVietnamese: true,
            romanizationJson: true,
        },
        orderBy: { createdAt: "asc" },
    });

    let chars = 0;
    let created = 0;
    let updated = 0;
    let linked = 0;
    let merged = 0;
    const total = vocabs.length;

    for (let idx = 0; idx < vocabs.length; idx++) {
        const vocab = vocabs[idx];
        const breakdown = computeHanCharacters(vocab);
        if (breakdown.length === 0) continue;

        await prisma.vocabulary.update({
            where: { id: vocab.id },
            data: { hanCharacters: breakdown, updatedAt: new Date() },
        });
        chars += breakdown.length;

        const result = await syncVocabularyHanCharacters(vocab.id, breakdown);
        created += result.created;
        updated += result.updated;
        linked += result.linked;
        merged += result.merged;

        if (onProgress) {
            onProgress({ processed: idx + 1, total, current: vocab.hanTraditional });
        }
    }

    return { total, chars, created, updated, linked, merged, reset };
}

/**
 * Preview what a sync would do WITHOUT writing to the database.
 * Scans vocabularies, aggregates per-character readings, and compares against
 * the existing han_characters store.
 *
 * @param {"fast"|"full"} [mode] "fast" = only vocabularies missing hanCharacters; "full" = all
 * @returns {Promise<{
 *   total: number,
 *   newCount: number,
 *   updateCount: number,
 *   sameCount: number,
 *   newChars: Array<{ character, hanSimplified?, pinyin, jyutping, sinoVietnamese, count }>,
 *   updateChars: Array<{ character, existingId?, missing: string[] }>
 * }>}
 */
export async function previewVocabularyHanCharacters(mode = "fast") {
    const where = mode === "full" ? {} : { hanCharacters: { equals: Prisma.DbNull } };
    const vocabs = await prisma.vocabulary.findMany({
        where,
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            pinyin: true,
            jyutping: true,
            sinoVietnamese: true,
            romanizationJson: true,
        },
        orderBy: { createdAt: "asc" },
    });

    // Aggregate per-character readings across all vocabularies
    const charMap = new Map(); // char → { hanSimplified?, pinyin:Set, jyutping:Set, sinoVietnamese:Set, count }
    for (const vocab of vocabs) {
        const breakdown = computeHanCharacters(vocab);
        for (const item of breakdown) {
            const ch = String(item?.hanTraditional ?? item?.character ?? "").trim();
            if (!ch) continue;
            if (!charMap.has(ch)) {
                charMap.set(ch, {
                    hanTraditional: ch,
                    hanSimplified: item.hanSimplified,
                    pinyin: new Set(),
                    jyutping: new Set(),
                    sinoVietnamese: new Set(),
                    count: 0,
                });
            }
            const entry = charMap.get(ch);
            entry.count++;
            for (const p of splitBreakdownReadings(item.pinyin)) {
                entry.pinyin.add(p.toLowerCase());
            }
            for (const j of splitBreakdownReadings(item.jyutping)) {
                entry.jyutping.add(j.toLowerCase());
            }
            if (item.sinoVietnamese) {
                // "TỊNH | TÍNH" = ONE reading (alternatives), keep whole group
                for (const t of splitSinoVietnameseParts(item.sinoVietnamese)) {
                    entry.sinoVietnamese.add(t);
                }
            }
            if (item.hanSimplified) entry.hanSimplified = item.hanSimplified;
        }
    }

    // ── Full mode: store is wiped first, so EVERY aggregated char is "new" ──
    if (mode === "full") {
        const all = [...charMap.values()].map((entry) => ({
            hanTraditional: entry.hanTraditional,
            hanSimplified: entry.hanSimplified,
            pinyin: [...entry.pinyin].sort(),
            jyutping: [...entry.jyutping].sort(),
            sinoVietnamese: [...entry.sinoVietnamese].sort(),
            count: entry.count,
        }));
        all.sort((a, b) => b.count - a.count);
        const PREVIEW_CAP = 200;
        return {
            total: all.length,
            newCount: all.length,
            updateCount: 0,
            sameCount: 0,
            newChars: all.slice(0, PREVIEW_CAP),
            updateChars: [],
        };
    }

    // ── Fast mode: compare aggregated readings against the existing store ──
    // Load existing store into a lookup by either form
    const existing = await prisma.hanCharacter.findMany({
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            pinyin: true,
            jyutping: true,
            sinoVietnamese: true,
        },
    });
    const byChar = new Map(); // char → entry
    for (const hc of existing) {
        const trad = (hc.hanTraditional ?? "").trim();
        const simp = (hc.hanSimplified ?? "").trim();
        if (trad) byChar.set(trad, hc);
        if (simp) byChar.set(simp, hc);
    }

    const newChars = [];
    const updateChars = [];
    let sameCount = 0;

    const missing = (existingArr, wantedSet, caseInsensitive = false) => {
        const norm = (s) =>
            caseInsensitive
                ? String(s ?? "")
                      .trim()
                      .toLowerCase()
                : String(s ?? "").trim();
        const have = new Set(
            Array.isArray(existingArr)
                ? existingArr
                      .map((s) => String(s ?? "").trim())
                      .filter(Boolean)
                      .map(norm)
                : [],
        );
        return [...wantedSet].filter((s) => s && !have.has(norm(s))).sort();
    };

    for (const entry of charMap.values()) {
        const ch = entry.hanTraditional;
        const ex = byChar.get(ch);
        if (!ex) {
            newChars.push({
                hanTraditional: ch,
                hanSimplified: entry.hanSimplified,
                pinyin: [...entry.pinyin].sort(),
                jyutping: [...entry.jyutping].sort(),
                sinoVietnamese: [...entry.sinoVietnamese].sort(),
                count: entry.count,
            });
            continue;
        }
        const missPy = missing(ex.pinyin, entry.pinyin, true);
        const missJp = missing(ex.jyutping, entry.jyutping, true);
        const missSv = missing(ex.sinoVietnamese, entry.sinoVietnamese, false);
        if (missPy.length > 0 || missJp.length > 0 || missSv.length > 0) {
            updateChars.push({
                hanTraditional: ch,
                existingId: ex.id,
                missing: [
                    ...missPy.map((p) => `py:${p}`),
                    ...missJp.map((j) => `jp:${j}`),
                    ...missSv.map((s) => `sv:${s}`),
                ],
                count: entry.count,
            });
        } else {
            sameCount++;
        }
    }

    // Sort new chars by frequency desc, cap preview lists
    newChars.sort((a, b) => b.count - a.count);
    updateChars.sort((a, b) => b.count - a.count);
    const PREVIEW_CAP = 200;

    return {
        total: charMap.size,
        newCount: newChars.length,
        updateCount: updateChars.length,
        sameCount,
        newChars: newChars.slice(0, PREVIEW_CAP),
        updateChars: updateChars.slice(0, PREVIEW_CAP),
    };
}

/**
 * Rebuild readings for the entire HanCharacter store from the CORRECT breakdown
 * of all vocabularies. Overwrites pinyin/jyutping per character with the union
 * of all per-position readings found across vocabularies — removes readings that
 * were wrongly merged by earlier buggy backfills.
 *
 * @returns {Promise<{ total: number, updated: number, cleared: number }>}
 */
export async function rebuildHanCharacterReadings() {
    // 1. Collect correct per-character readings from all vocabularies
    const readingsMap = new Map(); // char → { pinyin: Set, jyutping: Set }
    const vocabs = await prisma.vocabulary.findMany({
        select: { id: true, hanTraditional: true, hanSimplified: true, pinyin: true, jyutping: true },
    });

    for (const vocab of vocabs) {
        const breakdown = computeHanCharacters(vocab);
        for (const item of breakdown) {
            const ch = String(item?.hanTraditional ?? item?.character ?? "").trim();
            if (!ch) continue;
            if (!readingsMap.has(ch)) readingsMap.set(ch, { pinyin: new Set(), jyutping: new Set() });
            const entry = readingsMap.get(ch);
            for (const py of splitBreakdownReadings(item?.pinyin)) entry.pinyin.add(py);
            for (const jp of splitBreakdownReadings(item?.jyutping)) entry.jyutping.add(jp);
        }
    }

    // 2. Update each HanCharacter with the correct readings
    const chars = await prisma.hanCharacter.findMany({
        select: { id: true, hanTraditional: true, hanSimplified: true, pinyin: true, jyutping: true },
    });

    let updated = 0;
    let cleared = 0;
    for (const hc of chars) {
        const trad = (hc.hanTraditional ?? "").trim();
        const simp = (hc.hanSimplified ?? "").trim();
        const ch = trad || simp;
        if (!ch) continue;
        // Match by either form — fall back to simplified when traditional differs
        const found = readingsMap.get(trad) ?? readingsMap.get(simp);
        const nextPinyin = found ? [...found.pinyin].sort() : [];
        const nextJyutping = found ? [...found.jyutping].sort() : [];
        const curPinyin = Array.isArray(hc.pinyin) ? hc.pinyin : [];
        const curJyutping = Array.isArray(hc.jyutping) ? hc.jyutping : [];
        const pyChanged = nextPinyin.join("|") !== curPinyin.join("|");
        const jpChanged = nextJyutping.join("|") !== curJyutping.join("|");
        if (!pyChanged && !jpChanged) continue;

        await prisma.hanCharacter.update({
            where: { id: hc.id },
            data: { pinyin: nextPinyin, jyutping: nextJyutping, updatedAt: new Date() },
        });
        updated++;
        if (nextPinyin.length === 0 && nextJyutping.length === 0) cleared++;
    }

    return { total: chars.length, updated, cleared };
}
