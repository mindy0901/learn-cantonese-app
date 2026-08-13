/**
 * fill-sino.mjs — Fill sino_vietnamese for vocabularies missing it.
 *
 * Sources:
 *  - backend/data/_hanviet-pinyin.csv (ph0ngp): char + pinyin -> reading (preferred)
 *  - backend/data/sino-vietnamese.json: char -> reading(s) fallback
 *
 * Single char: pick reading by this char's pinyin (repo), fallback map.
 * Compound: split han chars + split pinyin syllables by position; join per-char SV.
 * Only fills when EVERY char resolves (else left unchanged).
 * SV uppercased per app convention.
 * --dry preview (default), --apply writes.
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

function isHanChar(ch) {
    const c = ch.codePointAt(0);
    return (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff);
}
function splitHanChars(text) {
    return [...String(text ?? "")].filter(isHanChar);
}
function splitPy(s) {
    return String(s ?? "")
        .split(/[\s,/、]+/)
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
// Real Hán-Việt readings carry Vietnamese diacritics (NFD combining marks).
// Excludes English glosses leaked into the map (e.g. "CONNECT").
const HAS_DIACRITIC = (s) => /[\u0300-\u036f]/.test(String(s).normalize("NFD"));
function pickReading(entry) {
    if (typeof entry === "string") return String(entry).trim();
    if (entry && Array.isArray(entry.readings)) {
        const accented = entry.readings.find((r) => HAS_DIACRITIC(r));
        return String(accented || entry.readings[0] || "").trim();
    }
    return String(entry ?? "").trim();
}
function buildOurMap() {
    const raw = JSON.parse(readFileSync(resolve(DATA, "sino-vietnamese.json"), "utf8"));
    const map = new Map();
    for (const [ch, entry] of Object.entries(raw)) {
        const val = pickReading(entry);
        if (ch && val) map.set(ch, val);
    }
    return map;
}

async function main() {
    const repo = buildRepo();
    const our = buildOurMap();
    console.log(`repo entries: ${repo.size}, sino-vietnamese.json: ${our.size}`);

    const { rows } = await pool.query(
        `SELECT id, han_traditional, han_simplified, pinyin FROM vocabularies
         WHERE sino_vietnamese IS NULL OR sino_vietnamese=''`,
    );

    const fills = [];
    for (const r of rows) {
        const chars = splitHanChars(r.han_traditional);
        if (!chars.length) continue;
        const pyParts = splitPy(r.pinyin);
        const aligned = pyParts.length === chars.length;
        const parts = [];
        let ok = true;
        chars.forEach((ch, i) => {
            let sv = null;
            const py = aligned ? pyParts[i] : null;
            if (py) {
                const rs = repo.get(ch)?.get(pyToNum(py));
                if (rs && rs.length) sv = rs[0];
            }
            if (!sv) sv = our.get(ch);
            if (!sv) {
                ok = false;
                return;
            }
            parts.push(String(sv).toUpperCase());
        });
        if (!ok || !parts.length) continue;
        fills.push({ id: r.id, w: r.han_traditional, py: r.pinyin, sv: parts.join(" ") });
    }

    console.log(`MODE: ${APPLY ? "APPLY" : "DRY"}  missing rows: ${rows.length}, fillable: ${fills.length}`);
    for (const s of fills.slice(0, 15)) console.log(`  ${s.w} (${s.py}) -> ${s.sv}`);

    if (APPLY) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            let n = 0;
            for (const s of fills) {
                await client.query("UPDATE vocabularies SET sino_vietnamese=$1, updated_at=now() WHERE id=$2", [
                    s.sv,
                    s.id,
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
