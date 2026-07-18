import { readFileSync } from "fs";

const p = "/app/node_modules/.pnpm/opencc-js@1.0.5/node_modules/opencc-js/dist/esm-lib/dict/STCharacters.js";
const raw = readFileSync(p, "utf-8");
const dictStr = raw.replace(/^export default "/, "").replace(/"$/, "");
const entries = dictStr.split("|");

let official = 0,
    same = 0,
    ext = 0;
for (const entry of entries) {
    const parts = entry.trim().split(/\s+/);
    const simp = parts[0] || "";
    const trad = parts[1] || "";
    if (simp.length !== 1) continue;
    const cp = simp.codePointAt(0);
    if (cp < 0x4e00 || cp > 0x9fff) {
        ext++;
        continue;
    }
    if (simp === trad) {
        same++;
        continue;
    }
    official++;
}
console.log("Khác (giản thể thực sự):", official);
console.log("Giống:", same);
console.log("Extension:", ext);
console.log("Tổng CJK:", official + same);
