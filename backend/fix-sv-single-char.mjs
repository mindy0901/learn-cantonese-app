/**
 * fix-sv-single-char.mjs — Fix Sino-Vietnamese for single-char rows that have
 * MULTI-token SV (copied from a merged row during an earlier split).
 *
 * Two cases:
 *  1. ALL SV tokens identical  (395 rows, e.g. 啊 "A A A A A") → dedupe to 1 token "A".
 *  2. SV tokens differ         (347 rows, e.g. 中 "TRUNG, TRÚNG") → pick the reading
 *     matching this row's pinyin, using backend/data/_hanviet-pinyin.csv (ph0ngp repo:
 *     char + pinyin → correct Hán-Việt reading).
 *
 * Reads local DB (.env.dev). Supports:
 *   --dry   preview only (default, no writes)
 *   --apply actually write to DB
 *
 * WRITES to DB with --apply — only run after explicit user confirmation.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });

const DATA_DIR = resolve(__dirname, "data");
const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ── Tone-mark → tone-number (repo style: ü → u:) ──
const TONE_MAP = {
    "\u0101": "a1",
    "\u00e1": "a2",
    "\u01ce": "a3",
    "\u00e0": "a4",
    "\u0113": "e1",
    "\u00e9": "e2",
    "\u011b": "e3",
    "\u00e8": "e4",
    "\u012b": "i1",
    "\u00ed": "i2",
    "\u01d0": "i3",
    "\u00ec": "i4",
    "\u014d": "o1",
    "\u00f3": "o2",
    "\u01d2": "o3",
    "\u00f2": "o4",
    "\u016b": "u1",
    "\u00fa": "u2",
    "\u01d4": "u3",
    "\u00f9": "u4",
    "\u01d6": "u:1",
    "\u01d8": "u:2",
    "\u01da": "u:3",
    "\u01dc": "u:4",
    "\u00fc": "u:",
};
function pyToNum(syl) {
    const s = String(syl ?? "")
        .trim()
        .toLowerCase();
    if (!s) return "";
    if (/\d$/.test(s)) return s.replace(/v/g, "u:").replace(/ü/g, "u:");
    let out = "",
        tone = null;
    for (const ch of s) {
        const val = TONE_MAP[ch];
        if (val) {
            const m = val.match(/^([a-z])(\d)$/);
            if (m) {
                out += m[1];
                tone = m[2];
            } else out += val;
        } else out += ch;
    }
    if (tone && !/\d$/.test(out)) out += tone;
    return out;
}

// ── Load repo map: char → pinyin(tone-num) → [readings] ──
function buildRepoMap() {
    const raw = readFileSync(resolve(DATA_DIR, "_hanviet-pinyin.csv"), "utf8");
    const repo = new Map();
    for (const line of raw.split(/\r?\n/).filter((l) => l.trim())) {
        if (line.startsWith("char,")) continue;
        const m = line.match(/^([^,]+),\[(.*?)\],(.+)$/);
        if (!m) continue;
        const ch = m[1].trim();
        let readings;
        try {
            readings = JSON.parse(`[${m[2]}]`);
        } catch {
            readings = m[2].split("'").filter((x) => x && x !== ",");
        }
        const py = m[3].trim();
        const list = (readings || []).map((r) => String(r).trim()).filter(Boolean);
        if (!repo.has(ch)) repo.set(ch, new Map());
        repo.get(ch).set(py, list);
    }
    return repo;
}

function splitSv(s) {
    return (s || "")
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter((t) => t && t !== "|");
}
function upperSv(v) {
    return String(v).trim().toUpperCase();
}

/**
 * Build a pinyin→SV map from the ORIGINAL cloud dump merged rows.
 * Cloud dump still has merged rows (e.g. 傳 pinyin "chuán chuàn" SV "TRUYỀN, TRUYỆN"),
 * so we can pick the SV token by index aligned to each pinyin token.
 * Key: hanTraditional|pyNum → SV token (uppercased).
 */
function buildCloudSvMap() {
    const path = resolve(__dirname, "_cloud_dump_local.sql");
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("COPY public.vocabularies")) {
            start = i + 1;
            break;
        }
    }
    if (start < 0) return new Map();
    const map = new Map();
    for (let i = start; i < lines.length; i++) {
        if (lines[i].trim() === "\\.") break;
        const c = lines[i].split("\t");
        // 0 id,1 sv,2 simp,3 py,4 trad
        const trad = c[4];
        if (!trad || trad.length !== 1) continue;
        const pyTokens = (c[3] || "")
            .split(/[,\s]+/)
            .map((t) => t.trim())
            .filter(Boolean);
        const svTokens = splitSv(c[1]);
        if (pyTokens.length !== svTokens.length) continue; // only exact-index matches
        pyTokens.forEach((py, idx) => {
            map.set(`${trad}|${pyToNum(py)}`, upperSv(svTokens[idx]));
        });
    }
    return map;
}

async function main() {
    const repo = buildRepoMap();
    const cloud = buildCloudSvMap();
    const { rows } = await pool.query(
        `SELECT id, han_traditional, han_simplified, pinyin, sino_vietnamese
         FROM vocabularies
         WHERE LENGTH(han_traditional)=1 AND (sino_vietnamese ~ ',' OR sino_vietnamese ~ ' ')`,
    );

    const dedupe = []; // all tokens same → 1 token
    const mapped = []; // tokens differ → resolve via repo
    const fromCloud = []; // resolve via cloud dump merged index
    const unresolved = []; // still no answer

    for (const r of rows) {
        const tokens = splitSv(r.sino_vietnamese);
        const ch = r.han_simplified || r.han_traditional;
        if (new Set(tokens).size === 1) {
            dedupe.push({ id: r.id, trad: r.han_traditional, py: r.pinyin, old: r.sino_vietnamese, next: tokens[0] });
            continue;
        }
        const pyNum = pyToNum(r.pinyin);
        const readings = repo.get(ch)?.get(pyNum);
        if (readings && readings.length) {
            mapped.push({
                id: r.id,
                trad: r.han_traditional,
                py: r.pinyin,
                pyNum,
                old: r.sino_vietnamese,
                next: upperSv(readings[0]),
            });
            continue;
        }
        const cloudSv = cloud.get(`${r.han_traditional}|${pyNum}`);
        if (cloudSv) {
            fromCloud.push({
                id: r.id,
                trad: r.han_traditional,
                py: r.pinyin,
                pyNum,
                old: r.sino_vietnamese,
                next: cloudSv,
            });
        } else {
            unresolved.push({ id: r.id, trad: r.han_traditional, py: r.pinyin, pyNum, old: r.sino_vietnamese });
        }
    }

    console.log(`MODE: ${APPLY ? "APPLY (WRITES)" : "DRY (preview)"}`);
    console.log(`Total single-char multi-SV rows: ${rows.length}`);
    console.log(`  1) dedupe (all tokens same):     ${dedupe.length}`);
    console.log(`  2) mapped via repo:              ${mapped.length}`);
    console.log(`  3) mapped via cloud-dump index:  ${fromCloud.length}`);
    console.log(`  4) UNRESOLVED (need decision):   ${unresolved.length}`);
    console.log("\n--- dedupe samples ---");
    for (const s of dedupe.slice(0, 5)) console.log(`  ${s.trad}  ${s.py}  "${s.old}" -> "${s.next}"`);
    console.log("\n--- mapped via repo samples ---");
    for (const s of mapped.slice(0, 5)) console.log(`  ${s.trad}  ${s.py} (${s.pyNum})  "${s.old}" -> "${s.next}"`);
    console.log("\n--- mapped via cloud-dump samples ---");
    for (const s of fromCloud.slice(0, 8)) console.log(`  ${s.trad}  ${s.py} (${s.pyNum})  "${s.old}" -> "${s.next}"`);
    if (unresolved.length) {
        console.log("\n--- UNRESOLVED (NOT changed, preview only) ---");
        for (const s of unresolved.slice(0, 20)) console.log(`  ${s.trad}  ${s.py} (${s.pyNum})  "${s.old}"`);
    }

    if (APPLY) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            let n = 0;
            for (const list of [dedupe, mapped, fromCloud]) {
                for (const s of list) {
                    await client.query("UPDATE vocabularies SET sino_vietnamese=$1, updated_at=now() WHERE id=$2", [
                        s.next,
                        s.id,
                    ]);
                    n++;
                }
            }
            await client.query("COMMIT");
            console.log(`\n✔ WROTE ${n} rows. UNRESOLVED ${unresolved.length} left unchanged.`);
        } catch (e) {
            await client.query("ROLLBACK");
            console.error("ROLLED BACK:", e.message);
        } finally {
            client.release();
        }
    } else {
        console.log("\n(dry run — run with --apply to write)");
    }
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
