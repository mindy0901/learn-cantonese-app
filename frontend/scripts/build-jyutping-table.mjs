/**
 * Dựng bảng âm tiết Jyutping (thanh mẫu × vận mẫu) từ DATABASE của app.
 * Nguồn: frontend/scripts/db_jyutping.txt — xuất từ bảng vocabularies (cột jyutping),
 * mỗi dòng 1 chuỗi jyutping (có thể nhiều âm tiết cách space, kèm số thanh 1-6).
 *
 * Quy tắc:
 * - Chỉ giữ các âm tiết trong 54 VẦN CHUẨN (theo tiengtrung.vn — không có et/oei/um/oet hiếm)
 *   + 2 âm mũi đứng độc lập (m, ng).
 * - Bỏ số thanh, tách nhiều âm tiết trong cùng chuỗi.
 *
 * Sinh `frontend/src/data/jyutpingSyllableTable.js`.
 * Chạy: `node scripts/build-jyutping-table.mjs` (cwd = frontend)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Thanh mẫu (Ø đứng đầu) ──
const INITIALS = [
    "Ø",
    "b",
    "p",
    "m",
    "f",
    "d",
    "t",
    "n",
    "l",
    "g",
    "k",
    "ng",
    "h",
    "gw",
    "kw",
    "w",
    "z",
    "c",
    "s",
    "j",
];

// ── 54 vần chuẩn (theo tiengtrung.vn) + 2 âm mũi đứng độc lập (m, ng) ──
const FINAL_ORDER = [
    "aa",
    "aai",
    "aau",
    "aam",
    "aan",
    "aang",
    "aap",
    "aat",
    "aak",
    "ai",
    "au",
    "am",
    "an",
    "ang",
    "ap",
    "at",
    "ak",
    "e",
    "ei",
    "eu",
    "em",
    "eng",
    "ep",
    "ek",
    "eoi",
    "eon",
    "eot",
    "oe",
    "oeng",
    "oek",
    "i",
    "iu",
    "im",
    "in",
    "ing",
    "ip",
    "it",
    "ik",
    "o",
    "oi",
    "ou",
    "on",
    "ong",
    "ot",
    "ok",
    "u",
    "ui",
    "un",
    "ung",
    "ut",
    "uk",
    "yu",
    "yun",
    "yut",
    "m",
    "ng",
];
const FINAL_SET = new Set(FINAL_ORDER);

// ── Đọc DB jyutping → tập âm tiết base unique ──
const raw = readFileSync(join(__dirname, "db_jyutping.txt"), "utf8");
const dbSyllables = new Set();
let totalWords = 0;
let skipped = new Set();
for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    totalWords++;
    for (const part of trimmed.split(/[\s,;]+/)) {
        const syl = part.replace(/[1-6]$/, "").toLowerCase();
        if (!/^[a-z]+$/.test(syl)) continue;
        dbSyllables.add(syl);
    }
}

// ── Tách âm tiết → { initial, final } ──
const LONG_INITIALS = ["gw", "kw", "ng"];
const SHORT_INITIALS = ["b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "w", "z", "c", "s", "j"];

function parseSyllable(syl) {
    for (const ini of LONG_INITIALS) {
        if (syl.startsWith(ini) && FINAL_SET.has(syl.slice(ini.length))) {
            return { initial: ini, final: syl.slice(ini.length) };
        }
    }
    for (const ini of SHORT_INITIALS) {
        if (syl.startsWith(ini) && FINAL_SET.has(syl.slice(ini.length))) {
            return { initial: ini, final: syl.slice(ini.length) };
        }
    }
    if (FINAL_SET.has(syl)) return { initial: "Ø", final: syl };
    return null;
}

// ── Dựng grid ──
const grid = INITIALS.map(() => FINAL_ORDER.map(() => ""));
let placed = 0;
for (const syl of dbSyllables) {
    const parsed = parseSyllable(syl);
    if (!parsed) {
        skipped.add(syl);
        continue;
    }
    const ri = INITIALS.indexOf(parsed.initial);
    const ci = FINAL_ORDER.indexOf(parsed.final);
    if (ri === -1 || ci === -1) {
        skipped.add(syl);
        continue;
    }
    grid[ri][ci] = syl;
    placed++;
}

console.log(`Tổng từ vựng có jyutping: ${totalWords}`);
console.log(`Tổng âm tiết unique trong DB: ${dbSyllables.size}`);
console.log(`Âm tiết đưa vào bảng: ${placed}`);
console.log(`Âm tiết bị bỏ (ngoài 54 vần chuẩn): ${skipped.size} → ${[...skipped].sort().join(", ")}`);

// Số lượng: 19 phụ âm đầu (trừ Ø), 54 vần chuẩn (trừ m/ng), 6 thanh điệu
const INITIAL_COUNT = INITIALS.length - 1; // bỏ Ø
const FINAL_COUNT = 54; // 54 vần chuẩn theo tiengtrung.vn (không tính m/ng)
const TONE_COUNT = 6;

// ── Sinh module JS ──
const arrStr = (a) => `[${a.map((x) => `"${x}"`).join(", ")}]`;
const gridStr = grid
    .map((row, ri) => `    { initial: ${JSON.stringify(INITIALS[ri])}, cells: ${arrStr(row)} },`)
    .join("\n");

const output = `/**
 * Bảng âm tiết Jyutping — thanh mẫu × vận mẫu.
 * Nguồn: DATABASE của app (bảng vocabularies, cột jyutping — ${placed} âm tiết thực tế xuất hiện trong từ).
 * Chỉ giữ các âm tiết trong 54 vần chuẩn (theo tiengtrung.vn) + m/ng; bỏ vần hiếm et/oei/um/oet.
 * Tự sinh bởi scripts/build-jyutping-table.mjs — KHÔNG sửa tay.
 */

/** Danh sách thanh mẫu (Ø đứng đầu) */
export const JYUTPING_SYL_INITIALS = ${arrStr(INITIALS)};

/** Danh sách vận mẫu (54 vần chuẩn theo tiengtrung.vn + m/ng) */
export const JYUTPING_SYL_FINALS = ${arrStr(FINAL_ORDER)};

/** Grid thanh mẫu × vận mẫu — ô = âm tiết thực tế trong DB hoặc "" */
export const JYUTPING_SYL_ROWS = [
${gridStr}
];

/** Tổng âm tiết trong bảng */
export const JYUTPING_SYL_TOTAL = ${placed};

/** Số phụ âm đầu (19, không tính Ø) */
export const JYUTPING_SYL_INITIAL_COUNT = ${INITIAL_COUNT};

/** Số vần chuẩn (54, không tính m/ng) */
export const JYUTPING_SYL_FINAL_COUNT = ${FINAL_COUNT};

/** Số thanh điệu (6) */
export const JYUTPING_SYL_TONE_COUNT = ${TONE_COUNT};
`;

writeFileSync(join(__dirname, "..", "src", "data", "jyutpingSyllableTable.js"), output, "utf8");
console.log("Đã ghi frontend/src/data/jyutpingSyllableTable.js");
