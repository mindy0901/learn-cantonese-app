/**
 * import-lessons-v2.mjs — HSK 3.0 lessons from drkameleon (vocab) + chelsea6502 (grammar)
 *
 * Sources:
 *   Vocab:  drkameleon/complete-hsk-vocabulary (newest HSK 3.0, has English)
 *   Grammar: chelsea6502/hsk-2025-data grammar.tsv (categories + examples)
 *
 * No krmanik/HSK-3.0 dependency.
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "crypto";
import https from "https";

const ADMIN_USER_ID = "627b7e1d-d928-47ae-9bc1-ea90daf48ebe";
const VOCAB_URL = "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/master/complete.json";
const GRAMMAR_URL = "https://raw.githubusercontent.com/chelsea6502/hsk-2025-data/master/grammar.tsv";

// ── Helpers ──

function stableUUID(...parts) {
    const hash = crypto.createHash("md5").update(parts.join("|")).digest("hex");
    return hash.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
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

function pickNewestLevel(levels) {
    let best = null;
    for (const lvl of levels || []) {
        if (!lvl.startsWith("newest-")) continue;
        const num = parseInt(lvl.replace("newest-", ""));
        if (!best || num < best) best = num;
    }
    return best ? `HSK ${best}` : null;
}

function normPinyin(p) {
    return (p || "").replace(/\s+/g, "").toLowerCase();
}

// ── Topic plans (one set per level, shared) ──

const TOPICS = [
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
    "Màu sắc & Hình dạng",
    "Thời tiết & Thiên nhiên",
    "Nhà cửa & Đồ dùng",
    "Giải trí & Sở thích",
    "Giao tiếp xã hội",
    "Thể thao & Vận động",
    "Công nghệ & Internet",
    "Văn hóa & Nghệ thuật",
    "Khoa học & Giáo dục",
    "Kinh tế & Thương mại",
    "Chính trị & Xã hội",
    "Môi trường & Sinh thái",
];

function scoreWord(simp, topic) {
    let s = 0;
    const kwMap = {
        "Gia đình": "爸妈哥姐弟妹爷奶夫妻子女亲家族婚",
        "Thời gian": "年月日天时分秒现在昨今明早晚午星周",
        "Đồ ăn|Ẩm thực": "饭菜吃喝茶酒肉鱼鸡牛猪米面汤果蔬蛋奶糖盐油酱醋味",
        "Mua sắm|Giá cả|Thương mại|Kinh tế": "买卖钱元块角分贵便宜商店市场超市银",
        "Địa điểm|Phương hướng": "地方这里那里哪学校医院银行饭店公园站机场路街边旁对",
        "Học tập|Ngôn ngữ|Giáo dục": "学教书读写看听答懂会考试题笔纸本课班年级汉拼音语言词",
        "Hoạt động|hằng ngày": "起床睡觉上班下班工作休洗打扫看听打电发短上网运跑游泳跳舞唱",
        "Giao thông|Du lịch": "车飞机火车地铁公交出租船自行走路开坐骑票站达出发旅行旅游",
        "Sức khỏe|Cơ thể|Y tế": "病疼药医生护士医院身体头手脚眼耳鼻口牙心血烧感冒咳嗽",
        "Cảm xúc|Tính cách|Tâm lý": "高兴快乐开心难过生气紧张害怕担喜欢爱恨想感觉希望愿意决",
        "Công việc|Nghề nghiệp": "工作公司老板同事会议报告项目任务工资奖金加班辞职面试简历职业经理",
        "Mô tả|So sánh|Hình dạng": "大小多少长短高矮胖瘦美丑好坏新旧快慢冷热难容易简单复杂重要漂亮",
        "Màu sắc": "红黄蓝绿白黑紫灰粉橙",
        "Thời tiết|Thiên nhiên|Môi trường|Sinh thái": "天雨风云雪晴阴凉暖春夏秋冬花草树河海湖山太阳月亮星空气候",
        "Nhà cửa|Đồ dùng": "房门窗桌椅床柜灯电视冰箱洗衣机空调厨房浴",
        "Giải trí|Sở thích|Nghệ thuật": "音乐电影戏画画书歌舞蹈摄影游",
        "Giao tiếp|xã hội|Chính trị": "说话告诉问回答介绍联系交朋友会政府国家政策选举领导管理",
        "Thể thao|Vận động": "运动比赛跑步游泳篮球足球乒乓跳",
        "Công nghệ|Internet|Khoa học": "电脑手机网络数据程软硬件机器研实验发现明数学物理化生",
        "Văn hóa|Truyền thống": "文化传统节日春节中秋端午历史习俗",
    };
    for (const [pattern, chars] of Object.entries(kwMap)) {
        if (new RegExp(pattern, "i").test(topic)) {
            for (const c of chars) if (simp.includes(c)) s++;
        }
    }
    return s;
}

function autoGroup(words, numTopics) {
    const topics = TOPICS.slice(0, numTopics);
    const buckets = topics.map(() => []);
    const assigned = new Set();

    for (const w of words) {
        let best = -1,
            bestScore = 0;
        for (let i = 0; i < topics.length; i++) {
            const s = scoreWord(w.simplified, topics[i]);
            if (s > bestScore) {
                bestScore = s;
                best = i;
            }
        }
        if (bestScore >= 1 && best >= 0) {
            buckets[best].push(w);
            assigned.add(w.id);
        }
    }

    const unassigned = words.filter((w) => !assigned.has(w.id));
    let rr = 0;
    for (const w of unassigned) {
        buckets[rr % buckets.length].push(w);
        rr++;
    }

    return { groups: buckets.filter((b) => b.length > 0), topicNames: topics };
}

// ── Main ──

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    console.log("📚 Building HSK 3.0 lessons (drkameleon + chelsea6502)\n");

    // ── Load grammar.tsv ──
    console.log("[1/4] Loading grammar.tsv...");
    const tsvRaw = await fetchUrl(GRAMMAR_URL);
    const tsvLines = tsvRaw.split("\n").filter((l) => l.trim());
    const grammarByLevel = new Map(); // "HSK1" → [{ content, type, category, detail, cases }]

    for (let i = 1; i < tsvLines.length; i++) {
        const cols = tsvLines[i].split("\t");
        if (cols.length < 6) continue;
        const level = cols[0].trim(); // "HSK1"..."HSK6","HSK7-9"
        if (!grammarByLevel.has(level)) grammarByLevel.set(level, []);
        grammarByLevel.get(level).push({
            content: cols[1],
            grammarType: cols[2],
            categoryType: cols[3],
            grammarDetail: cols[4],
            cases: (cols[5] || "").split("|").filter(Boolean),
        });
    }
    console.log(
        `  → ${[...grammarByLevel.values()].reduce((s, a) => s + a.length, 0)} grammar points across ${grammarByLevel.size} levels`,
    );

    // ── Load drkameleon vocab ──
    console.log("[2/4] Loading drkameleon vocab...");
    const vocabRaw = await fetchUrl(VOCAB_URL);
    const vocabData = JSON.parse(vocabRaw);
    const vocabByLevel = new Map(); // "HSK 1" → [{ id, simplified, traditional, pinyin, engMeanings }]

    for (const key of Object.keys(vocabData)) {
        const entry = vocabData[key];
        const simp = (entry.simplified || "").trim();
        if (!simp) continue;
        const hskLevel = pickNewestLevel(entry.level);
        if (!hskLevel) continue;

        for (const form of entry.forms || []) {
            const trad = (form.traditional || simp).trim();
            const pinyin = (form.transcriptions?.pinyin || "").trim();
            const eng = (form.meanings || []).join("; ");
            const id = stableUUID(trad, simp, normPinyin(pinyin), "");

            if (!vocabByLevel.has(hskLevel)) vocabByLevel.set(hskLevel, []);
            const arr = vocabByLevel.get(hskLevel);
            if (!arr.find((w) => w.id === id)) {
                arr.push({ id, simplified: simp, traditional: trad, pinyin, engMeanings: eng });
            }
        }
    }
    for (const [lvl, words] of vocabByLevel) {
        console.log(`  ${lvl}: ${words.length} words`);
    }

    // ── Map to DB ──
    console.log("[3/4] Mapping vocab to DB...");
    const allDb = await prisma.vocabulary.findMany({
        select: { id: true, hanSimplified: true, hanTraditional: true, pinyin: true },
    });
    const dbMap = new Map();
    for (const v of allDb) {
        const key = `${v.hanSimplified || v.hanTraditional}|${normPinyin(v.pinyin)}`;
        if (!dbMap.has(key) || (v.pinyin && v.pinyin.includes(" "))) {
            dbMap.set(key, v.id);
        }
    }

    // ── Build lessons per level ──
    console.log("[4/4] Building lessons...\n");
    const now = new Date().toISOString();
    const levels = [...vocabByLevel.keys()].sort();
    let totalLessons = 0;

    for (const hskLevel of levels) {
        const vocabWords = vocabByLevel.get(hskLevel) || [];
        const levelNum = hskLevel.replace("HSK ", "");
        const grammarKey = levelNum === "7" ? "HSK7-9" : `HSK${levelNum}`;
        const grammar = grammarByLevel.get(grammarKey) || [];

        // Map vocab to DB IDs
        const wordObjs = [];
        for (const vw of vocabWords) {
            const key = `${vw.simplified}|${normPinyin(vw.pinyin)}`;
            const dbId = dbMap.get(key);
            if (dbId) wordObjs.push({ ...vw, dbId });
        }

        const numTopics = Math.max(6, Math.ceil(wordObjs.length / 25));
        const { groups, topicNames } = autoGroup(wordObjs, numTopics);

        // Distribute grammar
        const gPerLesson = Math.max(1, Math.ceil(grammar.length / groups.length));
        const gChunks = [];
        for (let i = 0; i < grammar.length; i += gPerLesson) gChunks.push(grammar.slice(i, i + gPerLesson));

        // Clean old lessons
        const old = await prisma.lesson.findMany({
            where: { hskLevel, userId: ADMIN_USER_ID },
            select: { id: true, grammarIds: true },
        });
        const oldGids = new Set();
        for (const l of old) for (const g of l.grammarIds || []) oldGids.add(g);
        if (old.length > 0) await prisma.lesson.deleteMany({ where: { hskLevel, userId: ADMIN_USER_ID } });
        if (oldGids.size > 0)
            await prisma.grammar.deleteMany({ where: { id: { in: [...oldGids] }, userId: ADMIN_USER_ID } });

        console.log(`${hskLevel}: ${wordObjs.length} words → ${groups.length} lessons, ${grammar.length} grammar`);

        // Create lessons
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const topic = topicNames[i] || `Nhóm ${i + 1}`;
            const title = `Bài ${i + 1}: ${topic}`;
            const ids = group.map((w) => w.dbId);

            // Build grammar markdown
            const gChunk = gChunks[i] || [];
            let gMd = "";
            for (const gp of gChunk) {
                const header = [gp.grammarType, gp.categoryType, gp.grammarDetail].filter(Boolean).join(" > ");
                gMd += `**${header}**: ${gp.content}\n\n`;
                for (const ex of gp.cases) gMd += `• ${ex}\n`;
                gMd += "\n";
            }
            if (!gMd) gMd = `**${title} — Ngữ pháp**\n\nĐang cập nhật.`;

            const gId = stableUUID(ADMIN_USER_ID, title, "g", levelNum);
            const lId = stableUUID(ADMIN_USER_ID, title, "l", levelNum);

            try {
                await prisma.$executeRawUnsafe(
                    `INSERT INTO grammars (id, user_id, title, content, hsk_level, created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)
                     ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content=EXCLUDED.content, updated_at=EXCLUDED.updated_at`,
                    gId,
                    ADMIN_USER_ID,
                    title + " — Ngữ pháp",
                    gMd,
                    hskLevel,
                    now,
                    now,
                );
            } catch (e) {
                /* ignore */
            }

            try {
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
                totalLessons++;
            } catch (e) {
                console.log(`  ⚠️ ${title}: ${e.message}`);
            }
        }
    }

    // ── Summary ──
    const counts = await prisma.$queryRawUnsafe(
        "SELECT hsk_level, COUNT(*) FROM lessons GROUP BY hsk_level ORDER BY hsk_level",
    );
    console.log(`\n📊 ${totalLessons} lessons total:`);
    counts.forEach((r) => console.log(`  ${r.hsk_level}: ${r.count}`));
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
