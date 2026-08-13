/**
 * So sánh 108 âm tiết (từ tiengtrung.vn) với âm tiết thực tế trong DB app.
 * Đọc: frontend/scripts/db_jyutping.txt (mỗi dòng = 1 chuỗi jyutping, có thể nhiều âm tiết cách space)
 * In ra: âm tiết DB có mà trang không có, và âm tiết trang có mà DB không có.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 108 âm tiết từ trang tiengtrung.vn (bỏ thanh)
const EXAMPLE = new Set([
    "baa",
    "waa",
    "daai",
    "maai",
    "paau",
    "baau",
    "naam",
    "saam",
    "ngaan",
    "faan",
    "haang",
    "ngaang",
    "kek",
    "zaap",
    "laat",
    "waat",
    "baak",
    "ngaak",
    "tai",
    "sai",
    "hau",
    "sau",
    "jam",
    "sam",
    "san",
    "man",
    "dang",
    "pang",
    "jau",
    "sap",
    "jap",
    "jat",
    "cat",
    "hak",
    "bak",
    "ce",
    "se",
    "fei",
    "bei",
    "deu",
    "zeu",
    "lem",
    "beng",
    "teng",
    "gep",
    "sek",
    "tau",
    "keoi",
    "seoi",
    "ceon",
    "seon",
    "ceot",
    "seot",
    "hoe",
    "soeng",
    "loeng",
    "joek",
    "zoek",
    "zi",
    "ji",
    "siu",
    "ziu",
    "dim",
    "tim",
    "min",
    "tin",
    "ming",
    "zing",
    "jip",
    "dip",
    "jit",
    "sik",
    "lik",
    "co",
    "do",
    "hoi",
    "ngoi",
    "zou",
    "hou",
    "gon",
    "hon",
    "gong",
    "fong",
    "hot",
    "got",
    "hok",
    "lok",
    "wu",
    "fu",
    "bui",
    "mui",
    "mun",
    "wun",
    "jung",
    "tung",
    "sang",
    "wut",
    "luk",
    "juk",
    "syu",
    "zyu",
    "dyun",
    "jyun",
    "jyut",
    "m",
    "ng",
    "ngo",
    "goi",
]);

// Đọc DB jyutping
const raw = readFileSync(join(__dirname, "db_jyutping.txt"), "utf8");
const dbSyllables = new Set();
let totalWords = 0;
for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    totalWords++;
    // tách nhiều âm tiết (cách space), bỏ số thanh 1-6
    for (const part of trimmed.split(/[\s,;]+/)) {
        const syl = part.replace(/[1-6]$/, "").toLowerCase();
        if (/^[a-z]+$/.test(syl)) dbSyllables.add(syl);
    }
}

console.log(`Tổng từ vựng có jyutping: ${totalWords}`);
console.log(`Tổng âm tiết unique trong DB: ${dbSyllables.size}`);
console.log(`Âm tiết tiengtrung.vn: ${EXAMPLE.size}`);
console.log("");

// Âm tiết DB có, trang KHÔNG có (top có thể thiếu trong trang)
const inDbNotExample = [...dbSyllables].filter((s) => !EXAMPLE.has(s)).sort();
console.log(`=== Âm tiết CÓ trong DB nhưng KHÔNG có trong trang (${inDbNotExample.length}) ===`);
console.log(inDbNotExample.join(", "));
console.log("");

// Âm tiết trang có, DB KHÔNG có
const inExampleNotDb = [...EXAMPLE].filter((s) => !dbSyllables.has(s)).sort();
console.log(`=== Âm tiết CÓ trong trang nhưng KHÔNG có trong DB (${inExampleNotDb.length}) ===`);
console.log(inExampleNotDb.join(", "));
console.log("");

// Âm tiết có ở cả hai
const both = [...EXAMPLE].filter((s) => dbSyllables.has(s)).sort();
console.log(`=== Âm tiết có ở CẢ HAI (${both.length}) ===`);
console.log(both.join(", "));
