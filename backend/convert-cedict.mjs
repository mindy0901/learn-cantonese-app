/**
 * convert-cedict.mjs
 * Convert CEDICT.u8 (CC-CEDICT text format) → backend/data/CEDICT.json
 *
 * CC-CEDICT line format:
 *   傳統 简化 [pin1 yin1] /def1/def2/...
 *
 * Output (array of entries, mirrors CVDICT.json shape):
 *   { "s": "简化", "t": "傳統", "p": "pin1 yin1", "en": ["def1", "def2"] }
 *
 * Usage: node convert-cedict.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "data");

const raw = readFileSync(resolve(DATA_DIR, "CEDICT.u8"), "utf-8");
const out = [];

for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s*(.*)$/);
    if (!m) continue;
    const [, t, s, p, rest] = m;
    const en = (rest || "")
        .replace(/^\/+/, "")
        .split("/")
        .map((d) => d.trim())
        .filter(Boolean);
    if (!en.length) continue;
    out.push({ s, t, p, en });
}

writeFileSync(resolve(DATA_DIR, "CEDICT.json"), JSON.stringify(out, null, 2), "utf-8");

console.log("CEDICT entries:", out.length);
console.log("sample 1:", JSON.stringify(out[0]));
console.log("sample 開會:", JSON.stringify(out.find((e) => e.s === "开会" || e.t === "開會")));
