/**
 * fix-sv-overmerge.mjs — Fix vocabularies whose sino_vietnamese has more tokens
 * than han characters (over-merged readings, e.g. 日更 = "NHẬT CANH CÀNH CÁNH NGẠNH").
 *
 * Rebuilds SV per-character, context-aware:
 *  - pinyin present: use FIRST pinyin reading (before , ; /), align to chars,
 *    resolve each char via ph0ngp repo (char+pinyin) else map first token.
 *  - pure Cantonese (no pinyin): each char -> map first token (primary reading).
 * Only touches rows where token count > char count. --dry preview, --apply writes.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DATA = resolve(__dirname, "data");

function isHan(c) {
    const cp = c.codePointAt(0);
    return (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff);
}
function splitHanChars(t) {
    return [...String(t ?? "")].filter(isHan);
}
function splitPyFirst(s) {
    return String(s ?? "")
        .split(/[,;/]/)[0]
        .split(/[\s]+/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
}
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
        const v = TONE_MAP[ch];
        if (v) {
            const m = v.match(/^([a-z])(\d)$/);
            if (m) {
                out += m[1];
                tone = m[2];
            } else out += v;
        } else out += ch;
    }
    if (tone && !/\d$/.test(out)) out += tone;
    return out;
}
function buildRepo() {
    const map = new Map();
    for (const line of readFileSync(resolve(DATA, "_hanviet-pinyin.csv"), "utf8").split(/\r?\n/)) {
        if (!line.trim() || line.startsWith("char,")) continue;
        const m = line.match(/^([^,]+),\[(.*?)\],(.+)$/);
        if (!m) continue;
        let rs;
        try {
            rs = JSON.parse(`[${m[2]}]`);
        } catch {
            rs = [];
        }
        const list = (rs || []).map((r) => String(r).trim()).filter(Boolean);
        if (!map.has(m[1])) map.set(m[1], new Map());
        map.get(m[1]).set(m[3].trim(), list);
    }
    return map;
}
const HAS_DIACRITIC = (s) => /[\u0300-\u036f]/.test(String(s).normalize("NFD"));
// first real SV token: drop English glosses, then take first token of a space-joined string
function firstReading(value) {
    let s = String(value ?? "")
        .trim()
        .toUpperCase();
    if (HAS_DIACRITIC(s) === false && /^[A-Z\s]+$/.test(s) && s.split(/\s+/).length > 1) {
        // all caps no diacritics multi-token — keep first (avoid English gloss lists)
    }
    return s.split(/[\s,;|]+/)[0] || s;
}
function buildOurMap() {
    const raw = JSON.parse(readFileSync(resolve(DATA, "sino-vietnamese.json"), "utf8"));
    const map = new Map();
    for (const [ch, entry] of Object.entries(raw)) {
        let val;
        if (typeof entry === "string") val = firstReading(entry);
        else if (entry && Array.isArray(entry.readings)) {
            const accented = entry.readings.find((r) => HAS_DIACRITIC(String(r)));
            val = firstReading(accented || entry.readings[0] || "");
        } else val = firstReading(entry);
        if (ch && val) map.set(ch, val);
    }
    return map;
}

async function main() {
    const repo = buildRepo();
    const our = buildOurMap();
    const { rows } = await pool.query(
        "SELECT id, han_traditional, pinyin, jyutping, sino_vietnamese FROM vocabularies WHERE sino_vietnamese IS NOT NULL AND sino_vietnamese<>''",
    );
    const fixes = [];
    for (const r of rows) {
        const chars = splitHanChars(r.han_traditional);
        if (!chars.length) continue;
        const svTokens = String(r.sino_vietnamese)
            .split(/\s+/)
            .filter((t) => t !== "|" && t);
        if (svTokens.length <= chars.length) continue; // not over-merged
        const sv = String(r.sino_vietnamese).trim();
        let next;
        if (sv.includes(",")) {
            // multiple readings joined by comma — keep the FIRST reading (context-correct as-is)
            next = sv.split(",")[0].trim();
        } else {
            // true over-merge (e.g. 日更) — rebuild per char using map first token (safe)
            const parts = [];
            let ok = true;
            for (const ch of chars) {
                const v = our.get(ch);
                if (!v) {
                    ok = false;
                    break;
                }
                parts.push(String(v).toUpperCase());
            }
            if (!ok || parts.length !== chars.length) continue;
            next = parts.join(" ");
        }
        if (!next || next === sv) continue;
        fixes.push({ id: r.id, w: r.han_traditional, py: r.pinyin, old: r.sino_vietnamese, next });
    }
    console.log(
        `MODE: ${APPLY ? "APPLY" : "DRY"}  over-merged candidates: ${rows.length ? "scanned" : ""} | fixes: ${fixes.length}`,
    );
    for (const f of fixes.slice(0, 15)) console.log(`  ${f.w} (${f.py}) : "${f.old}" -> "${f.next}"`);

    if (APPLY) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            let n = 0;
            for (const f of fixes) {
                await client.query("UPDATE vocabularies SET sino_vietnamese=$1, updated_at=now() WHERE id=$2", [
                    f.next,
                    f.id,
                ]);
                n++;
            }
            await client.query("COMMIT");
            console.log(`\n✔ WROTE ${n} rows`);
        } catch (e) {
            await client.query("ROLLBACK");
            console.error("ROLLED BACK:", e.message);
            process.exitCode = 1;
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
