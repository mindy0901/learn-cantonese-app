/**
 * Stroke-count sync helpers for HanCharacter.strokeCount.
 *
 * Stroke source priority:
 *   1. cnchar (+cnchar-trad plugin) — understands standard simplified/traditional.
 *   2. Unihan kTotalStrokes (backend/data/Unihan/Unihan_IRGSources.txt) —
 *      fallback for Cantonese-only chars & rare variants cnchar doesn't know.
 */
import fs from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { prisma } from "./prisma.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UNIHAN = resolve(__dirname, "..", "data", "Unihan", "Unihan_IRGSources.txt");

let _cnchar = null;
let _cncharTrad = null;
async function loadCnchar() {
    if (_cnchar) return _cnchar;
    const [cnchar, trad] = await Promise.all([import("cnchar"), import("cnchar-trad")]);
    const cc = cnchar.default;
    cc.use(trad.default);
    _cnchar = cc;
    return cc;
}

let _unihan = null;
function loadUnihan() {
    if (_unihan) return _unihan;
    const map = new Map();
    if (!fs.existsSync(UNIHAN)) {
        _unihan = map;
        return map;
    }
    const text = fs.readFileSync(UNIHAN, "utf8");
    for (const line of text.split("\n")) {
        if (!line || line.startsWith("#")) continue;
        const parts = line.split("\t");
        if (parts.length < 3 || parts[1] !== "kTotalStrokes") continue;
        const cp = parseInt(parts[0].slice(2), 16);
        const strokes = parseInt(parts[2], 10);
        if (Number.isFinite(cp) && Number.isFinite(strokes)) map.set(cp, strokes);
    }
    _unihan = map;
    return map;
}

/**
 * Stroke count for a single char via cnchar, falling back to Unihan.
 * @returns {number|null}
 */
export async function computeCharStroke(ch) {
    if (!ch) return null;
    try {
        const cc = await loadCnchar();
        const n = cc.stroke(String(ch));
        if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
    } catch {
        /* fall through to Unihan */
    }
    const unihan = loadUnihan();
    const cp = String(ch).codePointAt(0);
    return unihan.get(cp) ?? null;
}

/**
 * Preview what a stroke sync would do (does NOT write to DB).
 * @param {"fast"|"full"} [mode] fast = only rows with stroke_count NULL; full = all
 */
export async function previewHanCharStrokes(mode = "fast") {
    const where = mode === "full" ? {} : { strokeCount: null };
    const rows = await prisma.hanCharacter.findMany({
        where,
        select: { id: true, hanTraditional: true, strokeCount: true },
    });
    let newCount = 0;
    let updateCount = 0;
    let sameCount = 0;
    const toFix = [];
    for (const r of rows) {
        const n = await computeCharStroke(r.hanTraditional);
        if (n === null) continue;
        if (r.strokeCount === null) {
            newCount++;
            toFix.push({ char: r.hanTraditional, strokes: n, kind: "new" });
        } else if (r.strokeCount !== n) {
            updateCount++;
            toFix.push({ char: r.hanTraditional, strokes: n, old: r.strokeCount, kind: "update" });
        } else {
            sameCount++;
        }
    }
    return {
        total: rows.length,
        newCount,
        updateCount,
        sameCount,
        newChars: toFix.filter((x) => x.kind === "new").slice(0, 200),
        updateChars: toFix.filter((x) => x.kind === "update").slice(0, 200),
    };
}

/**
 * Compute + store stroke_count for han_characters.
 * @param {object} [opts]
 * @param {"fast"|"full"} [opts.mode]
 * @param {(p:{processed:number,total:number,current:string})=>void} [opts.onProgress]
 */
export async function backfillHanCharStrokes({ mode = "fast", onProgress = null } = {}) {
    const where = mode === "full" ? {} : { strokeCount: null };
    const rows = await prisma.hanCharacter.findMany({
        where,
        select: { id: true, hanTraditional: true, strokeCount: true },
        orderBy: { hanTraditional: "asc" },
    });
    const total = rows.length;
    let updated = 0;
    const toWrite = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const n = await computeCharStroke(r.hanTraditional);
        if (n !== null && n !== r.strokeCount) {
            toWrite.push({ id: r.id, strokeCount: n });
        }
        onProgress?.({ processed: i + 1, total, current: r.hanTraditional });
    }

    // Batch writes.
    const BATCH = 300;
    for (let i = 0; i < toWrite.length; i += BATCH) {
        const chunk = toWrite.slice(i, i + BATCH);
        await prisma.$transaction(
            chunk.map((u) => prisma.hanCharacter.update({ where: { id: u.id }, data: { strokeCount: u.strokeCount } })),
        );
        updated += chunk.length;
        onProgress?.({ processed: total, total, current: "" });
    }

    return { total, updated };
}
