/**
 * import-lessons-hsk3.mjs — Import fixed-vocab lessons from HSK 3.0
 *
 * Vocabulary: krmanik/HSK-3.0 Anki data (fixed word lists per level)
 * Grammar: krmanik/HSK-3.0 grammar JSON
 *
 * Key: Lessons use FIXED vocabulary, not dynamic DB hsk_level.
 * Each lesson = a subset of the Anki word list for that level.
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "crypto";
import https from "https";

const ADMIN_USER_ID = "627b7e1d-d928-47ae-9bc1-ea90daf48ebe";
const ANKI_BASE = "https://raw.githubusercontent.com/krmanik/HSK-3.0/master/New%20HSK%20(2025)/Anki%20xiehanzi";
const GRAMMAR_BASE = "https://raw.githubusercontent.com/krmanik/HSK-3.0/master/New%20HSK%20(2025)/HSK%20Grammar/json";

// ── Fixed topic plans per level ──
const TOPICS = {
    1: [
        "Chào hỏi & Giới thiệu",
        "Số đếm & Thời gian",
        "Gia đình & Quan hệ",
        "Đồ ăn & Thức uống",
        "Mua sắm & Giá cả",
        "Địa điểm & Phương hướng",
        "Học tập & Ngôn ngữ",
        "Hoạt động hằng ngày",
        "Giao thông",
        "Thời tiết & Thiên nhiên",
        "Mô tả & Cảm xúc",
        "Công việc",
    ],
    2: [
        "Gia đình & Quan hệ",
        "Thời gian & Ngày tháng",
        "Đồ ăn & Thức uống",
        "Mua sắm & Giá cả",
        "Địa điểm & Phương hướng",
        "Học tập & Ngôn ngữ",
        "Hoạt động hằng ngày",
        "Giao thông & Du lịch",
        "Sức khỏe & Cơ thể",
        "Cảm xúc & Tính cách",
        "Công việc & Nghề nghiệp",
        "Mô tả & So sánh",
    ],
    3: [
        "Gia đình & Xã hội",
        "Thời gian & Lịch trình",
        "Ẩm thực & Nhà hàng",
        "Mua sắm & Thương mại",
        "Du lịch & Giải trí",
        "Giáo dục & Học tập",
        "Công việc & Văn phòng",
        "Sức khỏe & Thể thao",
        "Giao tiếp & Cảm xúc",
        "Môi trường & Thiên nhiên",
        "Văn hóa & Nghệ thuật",
        "Khoa học & Công nghệ",
    ],
    4: [
        "Gia đình & Quan hệ xã hội",
        "Thời gian & Lịch sử",
        "Ẩm thực & Nhà hàng",
        "Thương mại & Kinh doanh",
        "Du lịch & Khám phá",
        "Giáo dục & Đào tạo",
        "Nghề nghiệp & Chuyên môn",
        "Sức khỏe & Y tế",
        "Tâm lý & Cảm xúc",
        "Môi trường & Sinh thái",
        "Văn hóa & Truyền thống",
        "Khoa học & Nghiên cứu",
        "Kinh tế & Phát triển",
        "Công nghệ & Đổi mới",
        "Nghệ thuật & Giải trí",
    ],
    5: [
        "Xã hội & Cộng đồng",
        "Lịch sử & Di sản",
        "Ẩm thực & Văn hóa",
        "Kinh doanh & Doanh nghiệp",
        "Du lịch & Hội nhập",
        "Giáo dục & Học thuật",
        "Nghề nghiệp & Phát triển",
        "Y tế & Sức khỏe",
        "Tâm lý học & Hành vi",
        "Môi trường & Bảo tồn",
        "Văn hóa & Đa dạng",
        "Khoa học & Khám phá",
        "Kinh tế & Toàn cầu hóa",
        "Chính trị & Quản trị",
        "Công nghệ & Số hóa",
        "Ngôn ngữ & Văn học",
        "Nghệ thuật & Sáng tạo",
        "Triết học & Tư tưởng",
    ],
    6: [
        "Xã hội học & Nhân chủng học",
        "Lịch sử & Văn minh",
        "Ẩm thực quốc tế",
        "Kinh tế & Thị trường",
        "Du lịch & Địa lý",
        "Giáo dục & Sư phạm",
        "Nghề nghiệp & Lãnh đạo",
        "Y học & Dược học",
        "Tâm lý & Triết học",
        "Sinh thái & Môi trường",
        "Văn hóa & Di sản",
        "Khoa học & Công nghệ cao",
        "Tài chính & Đầu tư",
        "Chính trị & Ngoại giao",
        "Công nghệ thông tin",
        "Ngôn ngữ học & Dịch thuật",
        "Nghệ thuật & Biểu diễn",
        "Pháp luật & Nhân quyền",
    ],
};

// ── Helpers ──

function stableUUID(trad, simp, pinyin) {
    const np = (pinyin || "").replace(/\s+/g, "").toLowerCase();
    const key = `${trad || ""}|${simp || ""}|${np}|`;
    return crypto
        .createHash("md5")
        .update(key)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302)
                    return fetchUrl(res.headers.location).then(resolve, reject);
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                let d = "";
                res.on("data", (c) => (d += c));
                res.on("end", () => resolve(d));
            })
            .on("error", reject);
    });
}

// ── Auto-group words by POS/keyword ──

function scoreWord(word, topicName) {
    const chars = word.simplified || word.traditional || "";
    const pos = word.pos || "";
    let s = 0;

    // Topic keyword matching
    const kw = extractChineseChars(topicName);
    for (const c of kw) {
        if (chars.includes(c)) s += 1;
    }
    // POS matching
    if (/gia đình|quan hệ|xã hội|người/i.test(topicName) && /名/.test(pos)) s += 2;
    if (/thời gian|ngày|tháng|lịch/i.test(topicName) && /名/.test(pos)) s += 2;
    if (/ăn|uống|thức|đồ/i.test(topicName) && /名|动/.test(pos)) s += 2;
    if (/mua|sắm|giá|tiền|thương/i.test(topicName) && /动|名/.test(pos)) s += 2;
    if (/địa điểm|phương hướng|nơi/i.test(topicName) && /名/.test(pos)) s += 2;
    if (/học|giáo|dạy|ngôn ngữ/i.test(topicName) && /动|名/.test(pos)) s += 2;
    if (/hoạt động|hằng ngày/i.test(topicName) && /动/.test(pos)) s += 2;
    if (/giao thông|du lịch|đi/i.test(topicName) && /动|名/.test(pos)) s += 2;
    if (/sức khỏe|y tế|bệnh|cơ thể/i.test(topicName) && /名|形/.test(pos)) s += 2;
    if (/cảm xúc|tính cách|tâm lý|vui|buồn/i.test(topicName) && /形/.test(pos)) s += 2;
    if (/công việc|nghề|chức/i.test(topicName) && /名/.test(pos)) s += 2;
    if (/mô tả|so sánh|hình/i.test(topicName) && /形/.test(pos)) s += 2;
    if (/môi trường|thiên nhiên|sinh thái/i.test(topicName) && /名/.test(pos)) s += 2;
    if (/văn hóa|nghệ thuật|truyền thống/i.test(topicName) && /名/.test(pos)) s += 2;
    if (/khoa học|công nghệ|kỹ thuật/i.test(topicName) && /名/.test(pos)) s += 2;
    if (/kinh tế|tài chính|thị trường/i.test(topicName) && /名/.test(pos)) s += 2;
    if (/chính trị|pháp luật|ngoại giao/i.test(topicName) && /名/.test(pos)) s += 2;

    return s;
}

function extractChineseChars(str) {
    return (str.match(/[\u4e00-\u9fff]/g) || []).join("");
}

function autoGroup(words, topics) {
    const buckets = topics.map(() => []);
    const assigned = new Set();

    for (const w of words) {
        let best = -1,
            bestScore = 0;
        for (let i = 0; i < topics.length; i++) {
            const s = scoreWord(w, topics[i]);
            if (s > bestScore) {
                bestScore = s;
                best = i;
            }
        }
        if (bestScore >= 2 && best >= 0) {
            buckets[best].push(w);
            assigned.add(w);
        }
    }

    // Round-robin for unassigned
    const unassigned = words.filter((w) => !assigned.has(w));
    let rr = 0;
    for (const w of unassigned) {
        buckets[rr % buckets.length].push(w);
        rr++;
    }

    return buckets.filter((b) => b.length > 0);
}

// ── Grammar formatting ──

function formatGrammar(grammarPoints) {
    if (!grammarPoints || grammarPoints.length === 0) return "";
    const byCat = new Map();
    for (const gp of grammarPoints) {
        const cat = gp["类别"] || "";
        const catName = gp["类别名称"] || "";
        const key = cat + (catName ? ": " + catName : "");
        if (!byCat.has(key)) byCat.set(key, []);
        byCat.get(key).push(gp);
    }

    let md = "";
    let n = 1;
    for (const [cat, points] of byCat) {
        md += `**${cat}**\n\n`;
        for (const gp of points) {
            const detail = gp["细目"] || "";
            const content = gp["语法内容"] || "";
            md += `${n}. ${detail ? `**${detail}**: ` : ""}${content}\n\n`;
            n++;
        }
        md += "---\n\n";
    }
    return md.trim();
}

// ── Main ──

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function buildLevel(level) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`HSK LEVEL ${level}`);
    console.log(`${"=".repeat(50)}`);

    const hskLevel = `HSK ${level}`;
    const topics = TOPICS[level] || [];

    // ── Load Anki word list ──
    console.log(`  Loading Anki data...`);
    let ankiWords = [];
    try {
        const raw = await fetchUrl(`${ANKI_BASE}/HSK_Level_${level}.txt`);
        const lines = raw.split("\n").filter((l) => l.includes("\t"));
        const seen = new Set();
        for (const line of lines) {
            const cols = line.split("\t");
            if (cols.length < 3) continue;
            const simp = (cols[0] || "").trim();
            const trad = (cols[1] || "").trim();
            const pinyin = (cols[2] || "").trim();
            const posRaw = (cols[5] || "").trim();
            if (!simp) continue;
            const dedup = `${simp}|${(pinyin || "").replace(/\s+/g, "").toLowerCase()}`;
            if (seen.has(dedup)) continue;
            seen.add(dedup);
            const posMatch = posRaw.match(/[\u4e00-\u9fff]+/g);
            ankiWords.push({
                simplified: simp,
                traditional: trad || simp,
                pinyin,
                pos: posMatch ? posMatch.join(",") : "",
            });
        }
        console.log(`  → ${ankiWords.length} words`);
    } catch (e) {
        console.log(`  ⚠️  No Anki data: ${e.message}`);
        return;
    }

    // ── Map Anki words to DB IDs (search ALL vocab, not just this level) ──
    console.log(`  Mapping to DB...`);
    const dbVocab = await prisma.vocabulary.findMany({
        select: { id: true, hanSimplified: true, hanTraditional: true, pinyin: true },
    });

    // Build lookup: simplified|normPinyin → best DB entry
    const dbByChar = new Map();
    for (const v of dbVocab) {
        const simp = v.hanSimplified || v.hanTraditional;
        const np = (v.pinyin || "").replace(/\s+/g, "").toLowerCase();
        const key = `${simp}|${np}`;
        const existing = dbByChar.get(key);
        // Prefer entries with spaces in pinyin (better formatted)
        if (!existing || (v.pinyin && v.pinyin.includes(" ") && !existing.pinyin.includes(" "))) {
            dbByChar.set(key, v);
        }
    }

    // Helper: normalize Anki pinyin (split if unsplit, then remove spaces)
    function normAnkiPinyin(p) {
        // If no spaces, try to split using simple heuristic
        // For now just remove spaces and lowercase
        return (p || "").replace(/\s+/g, "").toLowerCase();
    }

    const wordObjs = [];
    let missing = 0;
    for (const aw of ankiWords) {
        const key = `${aw.simplified}|${normAnkiPinyin(aw.pinyin)}`;
        const db = dbByChar.get(key);
        if (db) {
            wordObjs.push({ id: db.id, simplified: aw.simplified, traditional: aw.traditional, pos: aw.pos });
        } else {
            // Try fuzzy: match by simplified char only (any pinyin)
            let found = false;
            for (const [k, v] of dbByChar) {
                if (k.startsWith(aw.simplified + "|")) {
                    wordObjs.push({ id: v.id, simplified: aw.simplified, traditional: aw.traditional, pos: aw.pos });
                    found = true;
                    if (missing < 10)
                        console.log(`    ⚠️ Fuzzy match: ${aw.simplified} "${aw.pinyin}" → DB "${v.pinyin}"`);
                    break;
                }
            }
            if (!found) {
                if (missing < 10) console.log(`    ❌ Missing: ${aw.simplified} "${aw.pinyin}"`);
                missing++;
            }
        }
    }
    console.log(`  → ${wordObjs.length} mapped, ${missing} missing`);

    // ── Group into topic lessons ──
    console.log(`  Grouping into ${topics.length} topics...`);
    const groups = autoGroup(wordObjs, topics);
    console.log(`  → ${groups.length} lesson groups`);

    // ── Load grammar ──
    console.log(`  Loading grammar...`);
    let grammarPoints = [];
    try {
        const raw = await fetchUrl(`${GRAMMAR_BASE}/HSK%20${level}.json`);
        grammarPoints = JSON.parse(raw);
    } catch (e) {
        console.log(`  ⚠️  No grammar: ${e.message}`);
    }
    console.log(`  → ${grammarPoints.length} grammar points`);

    // ── Delete old lessons for this level ──
    console.log(`  Cleaning old lessons...`);
    const old = await prisma.lesson.findMany({
        where: { hskLevel: { startsWith: hskLevel }, userId: ADMIN_USER_ID },
        select: { id: true, grammarIds: true },
    });
    const oldGids = new Set();
    for (const l of old) for (const g of l.grammarIds || []) oldGids.add(g);
    if (old.length > 0) {
        await prisma.lesson.deleteMany({ where: { hskLevel: { startsWith: hskLevel }, userId: ADMIN_USER_ID } });
        console.log(`  → Deleted ${old.length} old lessons`);
    }
    if (oldGids.size > 0) {
        await prisma.grammar.deleteMany({ where: { id: { in: [...oldGids] }, userId: ADMIN_USER_ID } });
    }

    // ── Create grammar & lessons ──
    console.log(`  Creating grammar & lessons...`);
    const now = new Date().toISOString();
    const gPerLesson = Math.max(1, Math.ceil(grammarPoints.length / Math.max(1, groups.length)));
    const gChunks = [];
    for (let i = 0; i < grammarPoints.length; i += gPerLesson) gChunks.push(grammarPoints.slice(i, i + gPerLesson));

    let gDone = 0,
        lDone = 0;
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const topic = topics[i] || `Nhóm ${i + 1}`;
        const title = `Bài ${i + 1}: ${topic}`;
        const gChunk = gChunks[i] || [];
        const grammarMd = formatGrammar(gChunk) || `**${title} — Ngữ pháp**\n\nĐang cập nhật.`;

        const gId = stableUUID(ADMIN_USER_ID, title, "grammar", String(level));
        const lId = stableUUID(ADMIN_USER_ID, title, "lesson", String(level));

        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO grammars (id, user_id, title, content, hsk_level, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content=EXCLUDED.content, updated_at=EXCLUDED.updated_at`,
                gId,
                ADMIN_USER_ID,
                title + " — Ngữ pháp",
                grammarMd,
                hskLevel,
                now,
                now,
            );
            gDone++;
        } catch (e) {
            console.log(`    ⚠️ G err: ${e.message}`);
        }

        try {
            const ids = group.map((w) => w.id);
            await prisma.$executeRawUnsafe(
                `INSERT INTO lessons (id, user_id, title, vocabulary_ids, grammar_ids, hsk_level, created_at, updated_at)
                 VALUES ($1,$2,$3,$4::uuid[],$5::uuid[],$6,$7,$8)
                 ON CONFLICT (id) DO UPDATE SET
                   title=EXCLUDED.title, vocabulary_ids=EXCLUDED.vocabulary_ids,
                   grammar_ids=EXCLUDED.grammar_ids, hsk_level=EXCLUDED.hsk_level, updated_at=EXCLUDED.updated_at`,
                lId,
                ADMIN_USER_ID,
                title,
                `{${ids.join(",")}}`,
                `{${gId}}`,
                hskLevel,
                now,
                now,
            );
            lDone++;
        } catch (e) {
            console.log(`    ⚠️ L err: ${e.message}`);
        }
    }

    console.log(`  ✅ ${gDone} grammar, ${lDone} lessons`);
}

async function main() {
    console.log("📚 Importing HSK 3.0 fixed-vocab lessons\n");
    const target = process.argv[2] || "all";

    if (target === "all") {
        for (let lvl = 1; lvl <= 6; lvl++) await buildLevel(lvl);
    } else {
        const lvl = parseInt(target);
        if (isNaN(lvl) || lvl < 1 || lvl > 6) {
            console.error("Level must be 1-6");
            process.exit(1);
        }
        await buildLevel(lvl);
    }

    // Summary
    const counts = await prisma.$queryRawUnsafe(
        "SELECT hsk_level, COUNT(*) FROM lessons GROUP BY hsk_level ORDER BY hsk_level",
    );
    console.log("\n📊 Final lessons:");
    counts.forEach((r) => console.log(`  ${r.hsk_level}: ${r.count} lessons`));
    console.log("\n✅ Done!");
}

main()
    .catch((e) => {
        console.error("❌", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
