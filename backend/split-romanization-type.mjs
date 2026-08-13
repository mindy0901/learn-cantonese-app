/**
 * Tách `romanization_json` thành 2 loại reading có `type` (2026-08-13).
 *
 * Mỗi entry sau khi chạy chỉ mang ĐÚNG MỘT reading:
 *   { id, type: "pinyin",   sinoVietnamese, pinyin,   meanings, examples }
 *   { id, type: "jyutping", sinoVietnamese, jyutping, meanings, examples }
 *
 * Phân bổ meanings:
 *   - CC-Canto / words.hk (dict tiếng Quảng) → reading jyutping (Cantonese).
 *   - Manual (category khác / trống) → CẢ pinyin lẫn jyutping (nghĩa chung của từ).
 *
 * Usage (chạy trong container):
 *   docker compose -f docker-compose.dev.yml exec -T backend node /app/split-romanization-type.mjs --dry
 *   docker compose -f docker-compose.dev.yml exec -T backend node /app/split-romanization-type.mjs --apply
 *
 * Idempotent: chạy lại trên dữ liệu đã tách → kết quả giống hệt.
 */
import { prisma } from "./lib/prisma.js";
import { romanizationId } from "./lib/prismaService.js";

const DICT_CATS = new Set(["CC-Canto", "words.hk"]);
const isDry = !process.argv.includes("--apply");

/**
 * Dedupe meanings theo NỘI DUNG (category|viet|eng). Lý do: khi gộp
 * romanization (2026-08-11), cùng 1 meaning có thể bị copy thành nhiều bản
 * với `id` KHÁC NHAU → dedup theo id không bắt được. So khớp content sẽ gom
 * các bản trùng (vd 一: 66 → 22).
 */
function dedupeMeanings(items) {
    const seen = new Set();
    const out = [];
    for (const m of items ?? []) {
        const key = [
            String(m?.category ?? "")
                .trim()
                .toLowerCase(),
            String(m?.vietMeanings ?? "")
                .trim()
                .toLowerCase(),
            String(m?.engMeanings ?? "")
                .trim()
                .toLowerCase(),
        ].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
    }
    return out;
}

/** Transform 1 vocab's romanization_json → typed pinyin/jyutping readings. */
function transform(v) {
    const roms = Array.isArray(v.romanizationJson) ? v.romanizationJson : [];
    if (roms.length === 0) return null;

    const allMeanings = [];
    const pySino = new Map(); // pinyin -> sinoVietnamese
    const jpSino = new Map(); // jyutping -> sinoVietnamese
    const pyOrder = [];
    const jpOrder = [];
    const pySeen = new Set();
    const jpSeen = new Set();

    for (const r of roms) {
        const py = String(r?.pinyin ?? "").trim();
        const jp = String(r?.jyutping ?? "").trim();
        const sino = r?.sinoVietnamese ?? "";
        if (py) {
            if (!pySeen.has(py)) {
                pySeen.add(py);
                pyOrder.push(py);
            }
            if (!pySino.has(py)) pySino.set(py, sino);
        }
        if (jp) {
            if (!jpSeen.has(jp)) {
                jpSeen.add(jp);
                jpOrder.push(jp);
            }
            if (!jpSino.has(jp)) jpSino.set(jp, sino);
        }
        for (const m of Array.isArray(r?.meanings) ? r.meanings : []) allMeanings.push(m);
    }

    const manual = [];
    const dict = [];
    for (const m of dedupeMeanings(allMeanings)) {
        if (DICT_CATS.has(String(m?.category ?? "").trim())) dict.push(m);
        else manual.push(m);
    }

    const out = [];
    for (const py of pyOrder) {
        out.push({
            id: romanizationId(py, ""),
            type: "pinyin",
            sinoVietnamese: pySino.get(py) ?? "",
            pinyin: py,
            jyutping: "",
            meanings: manual,
            examples: [],
        });
    }
    for (const jp of jpOrder) {
        out.push({
            id: romanizationId("", jp),
            type: "jyutping",
            sinoVietnamese: jpSino.get(jp) ?? "",
            pinyin: "",
            jyutping: jp,
            meanings: [...dict, ...manual],
            examples: [],
        });
    }
    if (out.length === 0) return null;
    return { id: v.id, romanizationJson: out };
}

async function main() {
    console.log(`Mode: ${isDry ? "DRY (không ghi DB)" : "APPLY (ghi DB)"}`);
    const rows = await prisma.vocabulary.findMany({
        select: { id: true, romanizationJson: true },
    });
    console.log(`Tổng vocabularies: ${rows.length}`);

    let changed = 0;
    let unchanged = 0;
    const samples = [];
    for (const v of rows) {
        const next = transform(v);
        if (!next) {
            unchanged += 1;
            continue;
        }
        const before = JSON.stringify(v.romanizationJson);
        const after = JSON.stringify(next.romanizationJson);
        if (before === after) {
            unchanged += 1;
        } else {
            changed += 1;
            if (samples.length < 5)
                samples.push({ id: v.id, before: v.romanizationJson, after: next.romanizationJson });
            if (!isDry) {
                await prisma.vocabulary.update({
                    where: { id: v.id },
                    data: { romanizationJson: next.romanizationJson },
                });
            }
        }
    }
    console.log(`Thay đổi: ${changed} | Giữ nguyên: ${unchanged}`);
    console.log(`\n=== Sample (${samples.length}) ===`);
    for (const s of samples) {
        console.log(`\nID: ${s.id}`);
        console.log("BEFORE:", JSON.stringify(s.before).slice(0, 400));
        console.log("AFTER :", JSON.stringify(s.after).slice(0, 400));
    }
    console.log(`\n${isDry ? "DRY RUN — chưa ghi gì. Chạy lại với --apply để ghi DB." : "Hoàn tất — đã ghi DB."}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
