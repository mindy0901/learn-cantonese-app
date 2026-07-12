import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { normalizeHanVietValue } from "./hanVietReadings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHIENAM_PATH = join(__dirname, "../data/phienam.txt");
const HAN_RE = /\p{Script=Han}/u;

/** @type {Map<string, string> | null} */
let charMap = null;
/** @type {{ char: string, reading: string }[] | null} */
let allEntries = null;

/**
 * @typedef {Object} PhienamEntry
 * @property {string} char
 * @property {string} reading
 */

function parsePhienamLine(line) {
    const trimmed = String(line ?? "").trim();
    if (!trimmed || trimmed.startsWith("#")) return null;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) return null;

    const ch = trimmed.slice(0, eq).trim();
    const rawReading = trimmed.slice(eq + 1).trim();
    if (!ch || !rawReading || !HAN_RE.test(ch)) return null;

    const reading = normalizeHanVietValue(rawReading);
    if (!reading) return null;

    return { char: ch, reading };
}

function loadPhienamFromDisk() {
    let text;
    try {
        text = readFileSync(PHIENAM_PATH, "utf8");
    } catch (err) {
        throw new Error(`Không đọc được phienam.txt — ${err instanceof Error ? err.message : err}`);
    }

    const entries = [];
    const map = new Map();

    for (const line of text.split(/\r?\n/)) {
        const entry = parsePhienamLine(line);
        if (!entry) continue;
        entries.push(entry);
        if (!map.has(entry.char)) map.set(entry.char, entry.reading);
    }

    return { entries, map };
}

function ensureLoaded() {
    if (!charMap || !allEntries) {
        const loaded = loadPhienamFromDisk();
        charMap = loaded.map;
        allEntries = loaded.entries;
    }
    return { charMap, allEntries };
}

/** Single-character Hán–Việt lookup from phienam.txt. */
export function lookupHanVietPhienamChar(char) {
    const ch = String(char ?? "").trim();
    if (!ch || [...ch].length !== 1 || !HAN_RE.test(ch)) return null;
    const { charMap: map } = ensureLoaded();
    const reading = map.get(ch);
    return reading ? { char: ch, reading } : null;
}

/** All phienam entries (one row per line in source file). */
export function listHanVietPhienam() {
    const { allEntries: entries } = ensureLoaded();
    return entries;
}

/** Map of Han character → normalized Hán–Việt reading. */
export function getHanVietPhienamMap() {
    const { charMap: map } = ensureLoaded();
    return map;
}

export function getHanVietPhienamStats() {
    const { allEntries: entries, charMap: map } = ensureLoaded();
    return { entryCount: entries.length, charCount: map.size };
}

/** Warm phienam index on server start (non-blocking). */
export function warmHanVietPhienamIndex() {
    try {
        ensureLoaded();
    } catch (err) {
        console.warn("[hanviet-phienam] Index warmup failed —", err.message ?? err);
    }
}
