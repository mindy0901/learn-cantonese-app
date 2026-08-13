/**
 * Tải audio pinyin (Yabla) + jyutping (Open Cantonese) về `frontend/public/audio/`.
 * Chạy: `node frontend/scripts/download-audio.mjs` (hoặc `node /app/scripts/download-audio.mjs` trong container).
 * Hỗ trợ `--only=jyutping` / `--only=pinyin` để tải riêng từng loại.
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = join(__dirname, "..", "public", "audio");
const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1] ?? "all";

// ── Dữ liệu từ data modules ──
const pinyinTable = await import("../src/data/pinyinTable.js");
const jyutpingTable = await import("../src/data/jyutpingTable.js");

const PINYIN_CDN = "https://yabla.b-cdn.net/media.yabla.com/chinese_static/audio/alicia";
const JYUTPING_CDN = "https://opencantonese.org/files/cantonese-life-1/jpc";
const pad2 = (n) => String(n).padStart(2, "0");

/** Thu thập tất cả âm tiết pinyin (duy nhất) */
function collectPinyinSyllables() {
    const set = new Set();
    for (const row of pinyinTable.PINYIN_ROWS) {
        for (const s of row.cells) if (s) set.add(s);
    }
    return [...set];
}

/** Danh sách [filename, url] cho pinyin: <âm tiết ü→v><thanh>.mp3, thanh 1–4 */
function collectPinyinFiles() {
    const files = [];
    for (const s of collectPinyinSyllables()) {
        const key = s.replace("ü", "v");
        for (let tone = 1; tone <= 4; tone++) {
            files.push({ file: `${key}${tone}.mp3`, url: `${PINYIN_CDN}/${key}${tone}.mp3` });
        }
    }
    return files;
}

/** Danh sách [filename, url] cho jyutping */
function collectJyutpingFiles() {
    const files = [];
    for (const { initial, audio } of jyutpingTable.JYUTPING_INITIALS) {
        files.push({
            file: `initial-${pad2(audio)}-${initial}.mp3`,
            url: `${JYUTPING_CDN}/initial-${pad2(audio)}-${initial}.mp3`,
        });
    }
    for (const [final, idx] of Object.entries(jyutpingTable.JYUTPING_FINAL_AUDIO ?? {})) {
        files.push({
            file: `final-${pad2(idx)}-${final}.mp3`,
            url: `${JYUTPING_CDN}/final-${pad2(idx)}-${final}.mp3`,
        });
    }
    for (let tone = 1; tone <= 6; tone++) {
        files.push({ file: `tone-${pad2(tone)}.mp3`, url: `${JYUTPING_CDN}/tone-${pad2(tone)}.mp3` });
    }
    return files;
}

async function exists(p) {
    try {
        await access(p);
        return true;
    } catch {
        return false;
    }
}

async function downloadFile(url, dest) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
}

async function run(name, files, outDir) {
    const dir = join(OUT_ROOT, outDir);
    await mkdir(dir, { recursive: true });
    let ok = 0,
        skip = 0,
        fail = 0;
    const failed = [];
    const CONCURRENCY = 8;
    const queue = [...files];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
            const { file, url } = queue.shift();
            const dest = join(dir, file);
            if (await exists(dest)) {
                skip++;
                continue;
            }
            try {
                await downloadFile(url, dest);
                ok++;
            } catch (e) {
                fail++;
                failed.push(`${file} (${e.message})`);
            }
        }
    });
    await Promise.all(workers);
    console.log(`[${name}] ok=${ok} skip=${skip} fail=${fail} → ${dir}`);
    if (failed.length)
        console.log(`[${name}] failed: ${failed.slice(0, 10).join(", ")}${failed.length > 10 ? "…" : ""}`);
}

if (only === "all" || only === "pinyin") await run("pinyin", collectPinyinFiles(), "pinyin");
if (only === "all" || only === "jyutping") await run("jyutping", collectJyutpingFiles(), "jyutping");
