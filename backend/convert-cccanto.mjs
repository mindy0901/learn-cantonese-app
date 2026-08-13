/**
 * convert-cccanto.mjs
 * Convert cccanto-webdist.txt (CC-Canto text format) → backend/data/cccanto.json
 *
 * CC-Canto line format:
 *   傳統 简化 [pin1 yin1] {jyutping} /def1/def2/...
 *
 * NOTE: CC-Canto can have MULTIPLE readings for the same word (e.g. 丁 → ding1/zaang1/zang1),
 * so every line becomes its own entry (no dedup).
 *
 * Output (array):
 *   { "s": "简化", "t": "傳統", "p": "pin1 yin1", "jp": "jyutping", "en": ["def1", "def2"] }
 *
 * Usage: node convert-cccanto.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "data");

const raw = readFileSync(resolve(DATA_DIR, "cccanto-webdist.txt"), "utf-8");
const out = [];

for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}\s*(.*)$/);
    if (!m) continue;
    const [, t, s, p, jp, rest] = m;
    const en = (rest || "")
        .replace(/^\/+/, "")
        .split("/")
        .map((d) => d.trim())
        .filter(Boolean);
    if (!jp.trim()) continue;
    out.push({ s, t, p, jp: jp.trim(), en });
}

writeFileSync(resolve(DATA_DIR, "cccanto.json"), JSON.stringify(out, null, 2), "utf-8");

console.log("CCCanto entries:", out.length);
console.log("sample 丁:", JSON.stringify(out.filter((e) => e.t === "丁")));
console.log("sample 當:", JSON.stringify(out.filter((e) => e.t === "當")));
