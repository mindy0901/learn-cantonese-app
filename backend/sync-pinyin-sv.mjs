/**
 * sync-pinyin-sv.mjs — Choose Sino-Vietnamese reading PER CHARACTER based on pinyin.
 *
 * Source: ph0ngp/hanviet-pinyin-wordlist (backend/data/_hanviet-pinyin.csv)
 *   Format: char,['hanviet',...],pinyin  (pinyin = tone-number, or "*" = single reading)
 *
 * Strategy (option A — apply to all):
 *   - For each vocabulary with pinyin, split han into chars and pinyin into syllables.
 *   - Look up the repo: char + pinyin → correct hanviet reading (multi-reading chars
 *     like 中 zhong1→TRUNG / zhong4→TRÚNG now resolve correctly).
 *   - Fallback order if repo has no reading for the char/pinyin:
 *       1. current sino-vietnamese.json map (single reading per char)
 *       2. existing DB sino_vietnamese (leave unchanged)
 *   - Readings are uppercased to the app's Hán-Việt convention.
 *   - Only updates vocabularies that would CHANGE. Never touches rows without pinyin.
 *
 * Safety: never deletes data. Supports --dry (preview only, no writes).
 * WRITES to DB — run only after explicit confirmation.
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "data");
const DRY = process.argv.includes("--dry");
// Only touch vocabularies that contain at least one MULTI-reading char
// (char with different SV readings per pinyin in the repo). This avoids
// overwriting single-reading chars where the repo may be less accurate.
const MULTI_ONLY = process.argv.includes("--multi-only");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ── Tone-mark → tone-number mapping (repo style: ü → u:) ──
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

/** Convert a pinyin syllable (tone marks OR already numeric) → tone-number form. */
function pyToNum(syl) {
    const s = String(syl ?? "")
        .trim()
        .toLowerCase();
    if (!s) return "";
    if (/\d$/.test(s)) return s.replace(/v/g, "u:").replace(/ü/g, "u:"); // already numeric
    let out = "";
    let tone = null;
    for (const ch of s) {
        const val = TONE_MAP[ch];
        if (val) {
            const m = val.match(/^([a-z])(\d)$/);
            if (m) {
                out += m[1];
                tone = m[2];
            } else {
                out += val; // u: (with or without tone — tone handled below)
            }
        } else {
            out += ch;
        }
    }
    if (tone && !/\d$/.test(out)) out += tone;
    return out;
}

// ── Build repo map: char → { pinyin → [readings] } ──
function buildRepoMap() {
    const raw = readFileSync(resolve(DATA_DIR, "_hanviet-pinyin.csv"), "utf8");
    const repo = new Map();
    let rows = 0;
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
        rows++;
    }
    return { repo, rows };
}

// ── Load current char→SV map ──
function buildOurMap() {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, "sino-vietnamese.json"), "utf8"));
    const map = new Map();
    for (const [ch, entry] of Object.entries(raw)) {
        const isMulti = entry && typeof entry === "object" && Array.isArray(entry.readings);
        const value = isMulti ? String(entry.readings[0]).trim() : String(entry).trim();
        if (ch && value) map.set(ch, value);
    }
    return map;
}

const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;

/** True if a char has DIFFERENT SV readings across its pinyin readings in the repo. */
function isMultiReadingChar(repo, ch) {
    const entry = repo.get(ch);
    if (!entry) return false;
    if (entry.size <= 1) return false;
    const sets = new Set();
    for (const [, rs] of entry) {
        if (rs && rs.length) sets.add([...rs].sort().join(","));
    }
    return sets.size > 1;
}

async function main() {
    const { repo, rows } = buildRepoMap();
    const our = buildOurMap();
    console.log(`📚 Repo rows: ${rows} | chars: ${repo.size} | current map chars: ${our.size}`);
    console.log(`🔄 Syncing SV by pinyin (dry=${DRY}, multi-only=${MULTI_ONLY})\n`);

    const vocabs = await prisma.vocabulary.findMany({
        select: { id: true, hanTraditional: true, pinyin: true, sinoVietnamese: true },
    });
    console.log(`  total vocabularies: ${vocabs.length}\n`);

    let changed = 0;
    let same = 0;
    let noPinyin = 0;
    let mismatch = 0;
    let skippedSingle = 0;
    const examples = [];

    for (const v of vocabs) {
        const trad = (v.hanTraditional || "").trim();
        const pinyin = (v.pinyin || "").trim();
        if (!trad) continue;
        const chars = [...trad].filter((c) => HAN_RE.test(c));
        if (chars.length === 0) continue;
        if (!pinyin) {
            noPinyin++;
            continue;
        }
        const syllables = pinyin.split(/\s+/).map(pyToNum).filter(Boolean);
        if (syllables.length !== chars.length) {
            mismatch++;
            continue;
        }

        // multi-only: skip words with no multi-reading char
        if (MULTI_ONLY && !chars.some((c) => isMultiReadingChar(repo, c))) {
            skippedSingle++;
            continue;
        }

        // Build new SV per char
        const parts = [];
        let usedRepo = 0;
        let usedOur = 0;
        let missing = 0;
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            const py = syllables[i];
            const entry = repo.get(ch);
            let reading = null;
            if (entry) {
                if (entry.has("*")) {
                    reading = entry.get("*")[0];
                    usedRepo++;
                } else if (entry.has(py)) {
                    reading = entry.get(py)[0];
                    usedRepo++;
                } else {
                    // fallback: first reading of this char in repo
                    for (const [, rs] of entry) {
                        if (rs && rs[0]) {
                            reading = rs[0];
                            usedRepo++;
                            break;
                        }
                    }
                }
            }
            if (!reading) {
                reading = our.get(ch) || null;
                if (reading) usedOur++;
                else missing++;
            }
            // Uppercase to app convention (Hán-Việt)
            parts.push(reading ? reading.toLocaleUpperCase("vi").trim() : "");
        }

        const newSv = parts.filter(Boolean).join(" ");
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (norm(newSv) !== norm(v.sinoVietnamese)) {
            changed++;
            if (!DRY) {
                await prisma.vocabulary.update({
                    where: { id: v.id },
                    data: { sinoVietnamese: newSv || null, updatedAt: new Date() },
                });
            }
            if (examples.length < 12) {
                examples.push({
                    trad,
                    pinyin,
                    old: (v.sinoVietnamese || "").trim(),
                    new: newSv,
                    repo: usedRepo,
                    our: usedOur,
                    missing,
                });
            }
        } else {
            same++;
        }
    }

    console.log(
        `  ✅ changed: ${changed} | same: ${same} | no-pinyin: ${noPinyin} | syllable-mismatch: ${mismatch} | skipped-single: ${skippedSingle}`,
    );
    if (examples.length) {
        console.log("\n  samples:");
        for (const ex of examples) {
            console.log(
                `    ${ex.trad} [${ex.pinyin}]  ${ex.old || "(none)"} → ${ex.new || "(none)"}  (repo:${ex.repo} our:${ex.our} miss:${ex.missing})`,
            );
        }
    }
    console.log(DRY ? "\n  (dry run — nothing written)" : "\n  ✅ Done!");
}

main().catch((e) => {
    console.error("❌", e);
    process.exit(1);
});
