import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { pinyin } from "pinyin-pro";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(__dirname, "vocabularies.json");

console.log("Reading vocabularies.json...");
const data = JSON.parse(readFileSync(jsonPath, "utf-8"));

let fixed = 0;

for (const entry of data) {
    const simp = (entry.forms?.simplified || entry.character || "").trim();
    if (!simp) continue;

    // Generate correct pinyin from simplified hanzi
    const correct = pinyin(simp, { toneType: "symbol", type: "array" })
        .map((s) => String(s ?? "").trim())
        .filter(Boolean);

    if (correct.length === 0) continue;

    const correctJoined = correct.join(" ");

    for (const pr of entry.pronunciations || []) {
        const old = (pr.pinyin || "").trim();
        if (!old) continue;

        // Check if pinyin needs fixing
        const tokens = old.split(/\s+/).filter(Boolean);

        // Case 1: token count mismatch
        if (tokens.length !== correct.length) {
            pr.pinyin = correctJoined;
            fixed++;
            if (fixed <= 10) console.log(entry.character + ": " + old + " -> " + correctJoined);
            continue;
        }

        // Case 2: merged tokens (tone marks count doesn't match expected)
        let changed = false;
        const newTokens = tokens.map((t, i) => {
            const expected = correct[i] || "";
            if (t === expected) return t;
            const tones = (t.match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈŌÓǑÒ]/g) || []).length;
            if (tones > 1 && expected) {
                changed = true;
                return expected;
            }
            return t;
        });

        if (changed) {
            const newPinyin = newTokens.join(" ");
            pr.pinyin = newPinyin;
            fixed++;
            if (fixed <= 10) console.log(entry.character + ": " + old + " -> " + newPinyin);
        }
    }
}

if (fixed > 0) {
    writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
    console.log("\nFixed:", fixed, "entries in vocabularies.json");
} else {
    console.log("\nNo fixes needed.");
}
