/**
 * normalize-han-slash.mjs — Normalize vocabularies whose han_traditional (and
 * sometimes jyutping) contains "/" variant separators (CC-Canto-style variant
 * glyphs, e.g. 偽/僞裝, 髮/發展, 公眾/衆).
 *
 * Strategy:
 *   - han_traditional = OpenCC cn->hk(han_simplified)  (the clean primary form)
 *   - jyutping: if it contains "/", try CC-Canto lookup for the resolved form,
 *     else pick the "/"-segment whose syllable count == resolved char count;
 *     else keep original.
 *
 * Usage: node normalize-han-slash.mjs [--apply]
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

async function main() {
    const OpenCC = await import("opencc-js");
    const toSimp = OpenCC.Converter({ from: "hk", to: "cn" });
    const toTrad = OpenCC.Converter({ from: "cn", to: "hk" });

    const ccc = JSON.parse(readFileSync(resolve(DATA, "cccanto.json"), "utf8"));
    const cccByForm = new Map();
    for (const e of ccc) {
        for (const k of new Set([e.s, e.t].filter(Boolean))) {
            if (!cccByForm.has(k)) cccByForm.set(k, []);
            cccByForm.get(k).push(e);
        }
    }

    const { rows } = await pool.query(
        `SELECT id, han_traditional, han_simplified, jyutping FROM vocabularies
         WHERE han_traditional LIKE '%/%' OR han_simplified LIKE '%/%'`,
    );

    const results = [];
    for (const r of rows) {
        const simp = r.han_simplified;
        const resolvedTrad = simp ? toTrad(simp) : (r.han_traditional || "").split("/")[0].trim();
        // jyutping resolution
        let jp = (r.jyutping || "").trim();
        if (jp.includes("/") && resolvedTrad) {
            let found = "";
            const cands = [resolvedTrad, toSimp(resolvedTrad)].filter(Boolean);
            for (const c of cands) {
                const entries = cccByForm.get(c) ?? [];
                const clean = entries.map((e) => String(e.jp ?? "").trim()).filter((x) => x && !x.includes("/"));
                if (clean.length) {
                    found = clean[0];
                    break;
                }
            }
            if (found) {
                jp = found;
            } else {
                // fallback: pick "/"-segment with syllable count == char count
                const need = [...resolvedTrad].length;
                const segs = jp
                    .split("/")
                    .map((s) => s.trim())
                    .filter(Boolean);
                const match = segs.filter((s) => s.split(/\s+/).length === need);
                if (match.length === 1) {
                    jp = match[0];
                } else {
                    // mid-word variant: merge segments, dropping overlapping
                    // syllable (variant char's reading) between adjacent segments
                    const words = [];
                    for (const s of segs) {
                        const syls = s.split(/\s+/);
                        if (words.length && words[words.length - 1] === syls[0]) syls.shift();
                        words.push(...syls);
                    }
                    const merged = words.join(" ");
                    if (words.length === need) jp = merged;
                }
            }
        }
        const hanChanged = resolvedTrad !== (r.han_traditional || "").trim();
        const jpChanged = jp !== (r.jyutping || "").trim();
        results.push({ ...r, resolvedTrad, jp, hanChanged, jpChanged });
    }

    const jpChangedN = results.filter((x) => x.jpChanged).length;
    const hanChangedN = results.filter((x) => x.hanChanged).length;
    const unresolved = results.filter((x) => x.jp.includes("/")).length;
    console.log(`=== normalize slash-words — ${APPLY ? "APPLY" : "DRY"} ===`);
    console.log(`total slash-words          : ${results.length}`);
    console.log(`han_traditional changed    : ${hanChangedN}`);
    console.log(`jyutping changed           : ${jpChangedN}`);
    console.log(`jyutping still has "/"     : ${unresolved}`);
    console.log("--- samples (old -> new) ---");
    for (const x of results.slice(0, 14)) {
        console.log(`  ${x.han_traditional} -> ${x.resolvedTrad}   | jp: ${(x.jyutping || "").trim()} -> ${x.jp}`);
    }
    if (unresolved > 0) {
        console.log("--- unresolved (need review) ---");
        for (const x of results.filter((y) => y.jp.includes("/"))) {
            console.log(`  ${x.resolvedTrad} | jp="${x.jp}"`);
        }
    }

    if (!APPLY) {
        console.log("\n(dry run — run with --apply to write)");
        await pool.end();
        return;
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const x of results) {
            if (!x.hanChanged && !x.jpChanged) continue;
            await client.query(
                "UPDATE vocabularies SET han_traditional=$1, jyutping=$2, updated_at=now() WHERE id=$3",
                [x.resolvedTrad, x.jp, x.id],
            );
        }
        await client.query("COMMIT");
        console.log(`\n✔ WROTE ${results.filter((x) => x.hanChanged || x.jpChanged).length} rows`);
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("ROLLED BACK:", e.message);
        process.exitCode = 1;
    } finally {
        client.release();
    }
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
