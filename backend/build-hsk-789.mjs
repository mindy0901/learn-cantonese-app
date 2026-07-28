/**
 * build-hsk-789.mjs — Build HSK 7-9 (merged) lessons
 *
 * HSK 7-9 words already exist in DB from original seed (5,810 entries).
 * This script creates lessons grouped by topic, with grammar from HSK 6.
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "crypto";
import https from "https";

const ADMIN_USER_ID = "627b7e1d-d928-47ae-9bc1-ea90daf48ebe";
const HSK_LEVEL = "HSK 7-9";
const GITHUB_BASE = "https://raw.githubusercontent.com/krmanik/HSK-3.0/master/New%20HSK%20(2025)";

// ── 30 topic-based lessons for HSK 7-9 advanced ──

const TOPIC_PLANS = [
    "Triết học & Tư tưởng Trung Hoa",
    "Văn học cổ điển & Hiện đại",
    "Thơ ca & Từ phú",
    "Lịch sử Trung Quốc cận đại",
    "Văn minh & Di sản thế giới",
    "Chính trị & Hành chính công",
    "Ngoại giao & Quan hệ quốc tế",
    "Luật pháp & Tư pháp",
    "Kinh tế vĩ mô & Vi mô",
    "Tài chính & Ngân hàng",
    "Thương mại quốc tế & Logistics",
    "Quản trị doanh nghiệp",
    "Marketing & Truyền thông",
    "Khoa học tự nhiên nâng cao",
    "Vật lý & Thiên văn học",
    "Hóa học & Vật liệu",
    "Sinh học & Di truyền học",
    "Y học & Dược lý",
    "Kỹ thuật & Công nghệ cao",
    "Trí tuệ nhân tạo & Dữ liệu lớn",
    "Công nghệ thông tin & An ninh mạng",
    "Môi trường & Phát triển bền vững",
    "Năng lượng & Tài nguyên",
    "Kiến trúc & Quy hoạch đô thị",
    "Nghệ thuật đương đại",
    "Âm nhạc & Biểu diễn nghệ thuật",
    "Điện ảnh & Truyền hình",
    "Tâm lý học & Xã hội học",
    "Giáo dục đại học & Nghiên cứu",
    "Tôn giáo & Tín ngưỡng phương Đông",
];

// ── Stable UUID ──

function stableUUID(...parts) {
    const hash = crypto.createHash("md5").update(parts.join("|")).digest("hex");
    return hash.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

// ── HTTP ──

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

// ── Auto-group words into topics using Chinese character frequency ──

/**
 * Each topic has representative Chinese characters.
 * Words are scored against topics and assigned to the best match.
 */
const TOPIC_CHARS = [
    "哲学思想道理德仁义礼智信道法自然",
    "文学小说散文诗词篇章著作读书笔记",
    "诗歌词曲赋韵律意境意象比喻象征",
    "历史革命战争朝代帝王年号纪年纪事",
    "文明遗产古迹保护传承世界民族传统",
    "政治政府政策选举议会民主立法执政",
    "外交国际关系条约协定谈判大使领事",
    "法律宪法刑法民法诉讼审判仲裁律师",
    "经济宏观微观市场供需通货膨胀货币",
    "金融银行证券股票基金期货利率汇率",
    "贸易进出口关税物流供应链港口航运",
    "企业管理组织战略决策领导人力资源",
    "营销广告品牌媒体公关传播推广策划",
    "科学物理化学生物数学几何代数统计",
    "物理力学光学电磁量子相对原子粒子",
    "化学元素分子反应催化剂合成分析检验",
    "生物基因细胞遗传进化生态微生物免疫",
    "医学诊断治疗手术药物病理临床预防",
    "工程技术设计制造机械电子自动化系统",
    "智能数据算法机器学习深度学习模型预测",
    "信息系统网络软件硬件数据库安全加密",
    "环境生态气候污染排放碳达峰可持续",
    "能源电力石油天然气太阳能风力核能",
    "建筑结构设计施工规划城市市政园林",
    "艺术绘画雕塑摄影设计创作审美表现",
    "音乐声乐器乐演唱表演歌剧交响乐团",
    "电影电视剧本导演演员拍摄剪辑后期",
    "心理认知行为情绪人格社会群体调查",
    "教育大学研究学院学科课程论文课题",
    "宗教信仰礼仪寺庙教堂道教佛教基督",
];

function scoreTopic(word, topicChars, idx) {
    const chars = word.hanSimplified || word.hanTraditional || "";
    let score = 0;
    for (const c of chars) {
        if (topicChars.includes(c)) score += 2;
    }
    // Boost first-char match
    if (chars.length > 0 && topicChars.includes(chars[0])) score += 3;
    return score;
}

function autoGroup(words, topics, topicChars) {
    const buckets = topics.map(() => []);
    const assigned = new Set();

    // First pass: assign by character match
    for (const w of words) {
        let best = -1;
        let bestScore = 0;
        for (let i = 0; i < topics.length; i++) {
            const s = scoreTopic(w, topicChars[i], i);
            if (s > bestScore) {
                bestScore = s;
                best = i;
            }
        }
        if (bestScore >= 2 && best >= 0) {
            buckets[best].push(w);
            assigned.add(w.id);
        }
    }

    // Second pass: distribute unassigned round-robin
    const unassigned = words.filter((w) => !assigned.has(w.id));
    let rrIdx = 0;
    for (const w of unassigned) {
        buckets[rrIdx % buckets.length].push(w);
        rrIdx++;
    }

    return buckets.filter((b) => b.length >= 8);
}

// ── Main ──

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    console.log("🚀 Building HSK 7-9 (merged) lessons\n");

    // ── Step 1: Get all HSK 7-9 vocab from DB ──
    console.log("[1/4] Fetching HSK 7-9 vocab from DB...");
    const allVocab = await prisma.vocabulary.findMany({
        where: { hskLevel: HSK_LEVEL },
        select: { id: true, hanSimplified: true, hanTraditional: true, pinyin: true },
        orderBy: { hanTraditional: "asc" },
    });
    console.log(`  → ${allVocab.length} entries`);

    if (allVocab.length === 0) {
        console.log("  ⚠️  No HSK 7-9 vocab found! Aborting.");
        return;
    }

    // ── Step 2: Group into lessons ──
    console.log("[2/4] Grouping into topic-based lessons...");
    const groups = autoGroup(allVocab, TOPIC_PLANS, TOPIC_CHARS);
    console.log(`  → ${groups.length} lesson groups`);

    // ── Step 3: Download HSK 6 grammar (best available for 7-9) ──
    console.log("[3/4] Downloading HSK 6 grammar (for 7-9)...");
    let grammarPoints = [];
    try {
        const raw = await fetchUrl(`${GITHUB_BASE}/HSK%20Grammar/json/HSK%206.json`);
        grammarPoints = JSON.parse(raw);
    } catch (e) {
        console.log(`  ⚠️  Cannot download grammar: ${e.message}`);
    }
    console.log(`  → ${grammarPoints.length} grammar points`);

    // ── Step 4: Create lessons ──
    console.log("[4/4] Creating grammar & lesson entries...");
    const now = new Date().toISOString();

    const grammarPerLesson = Math.max(1, Math.ceil(grammarPoints.length / groups.length));
    const grammarChunks = [];
    for (let i = 0; i < grammarPoints.length; i += grammarPerLesson) {
        grammarChunks.push(grammarPoints.slice(i, i + grammarPerLesson));
    }

    let grammarDone = 0;
    let lessonDone = 0;

    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const topicName = TOPIC_PLANS[i];
        const title = `Bài ${i + 1}: ${topicName}`;

        const gChunk = grammarChunks[i] || [];
        let grammarMd = "";
        for (const gp of gChunk) {
            const cat = gp["类别"] || "";
            const catName = gp["类别名称"] || "";
            const detail = gp["细目"] || "";
            const content = gp["语法内容"] || "";
            const header = cat + (catName ? ": " + catName : "");
            const body = detail ? `${detail}: ${content}` : content;
            grammarMd += `**${header}**\n\n${body}\n\n---\n\n`;
        }

        const gId = stableUUID(ADMIN_USER_ID, title, "grammar", "789");
        const lId = stableUUID(ADMIN_USER_ID, title, "lesson", "789");

        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO grammars (id, user_id, title, content, hsk_level, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content=EXCLUDED.content, updated_at=EXCLUDED.updated_at`,
                gId,
                ADMIN_USER_ID,
                title + " — Ngữ pháp",
                grammarMd || `**${title} — Ngữ pháp**\n\nĐang cập nhật nội dung ngữ pháp cho bài học này.`,
                "HSK 7-9",
                now,
                now,
            );
            grammarDone++;
        } catch (e) {
            console.log(`  ⚠️  Grammar insert error: ${e.message}`);
        }

        try {
            const vocabIds = group.map((w) => w.id);
            await prisma.$executeRawUnsafe(
                `INSERT INTO lessons (id, user_id, title, vocabulary_ids, grammar_ids, hsk_level, created_at, updated_at)
                 VALUES ($1, $2, $3, $4::uuid[], $5::uuid[], $6, $7, $8)
                 ON CONFLICT (id) DO UPDATE SET
                   title=EXCLUDED.title, vocabulary_ids=EXCLUDED.vocabulary_ids,
                   grammar_ids=EXCLUDED.grammar_ids, hsk_level=EXCLUDED.hsk_level, updated_at=EXCLUDED.updated_at`,
                lId,
                ADMIN_USER_ID,
                title,
                `{${vocabIds.join(",")}}`,
                `{${gId}}`,
                "HSK 7-9",
                now,
                now,
            );
            lessonDone++;
        } catch (e) {
            console.log(`  ⚠️  Lesson insert error: ${e.message}`);
        }
    }

    console.log(`  → ${grammarDone} grammar entries, ${lessonDone} lesson entries`);
    console.log("\n✅ HSK 7-9 done!");
}

main()
    .catch((e) => {
        console.error("❌ Error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
