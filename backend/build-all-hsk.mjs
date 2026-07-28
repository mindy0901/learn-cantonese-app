/**
 * build-all-hsk.mjs — Automated HSK lesson builder
 *
 * Usage: node build-all-hsk.mjs [level]
 *   level: 2-6 (single level), "all" (all levels), default: "all"
 *
 * What it does:
 * 1. Downloads Anki data from HSK 3.0 GitHub repo (pinyin, simplified, traditional)
 * 2. Inserts vocab into DB (idempotent — never overwrites existing)
 * 3. Downloads HSK Grammar JSON
 * 4. Creates grammar entries
 * 5. Auto-groups words into topic-based lessons
 * 6. Creates lesson entries linking vocab + grammar
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "crypto";
import https from "https";

// ── Configuration ──

const ADMIN_USER_ID = "627b7e1d-d928-47ae-9bc1-ea90daf48ebe";
const GITHUB_BASE = "https://raw.githubusercontent.com/krmanik/HSK-3.0/master/New%20HSK%20(2025)";

// ── Lesson topic plans per level ──
// Each level gets topic-based lessons. Words are auto-assigned based on POS or character.

const LESSON_PLANS = {
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
        "Màu sắc & Hình dạng",
        "Thời tiết & Khí hậu",
        "Động vật & Thực vật",
        "Quần áo & Trang phục",
        "Nhà cửa & Đồ dùng",
        "Số đếm & Đo lường",
        "Giải trí & Sở thích",
        "Giao tiếp xã hội",
        "Di chuyển & Chỉ đường",
        "Trường học & Lớp học",
        "Thể thao & Vận động",
        "Lễ hội & Ngày lễ",
        "Công nghệ & Internet",
        "Tính từ thông dụng 1",
        "Tính từ thông dụng 2",
        "Động từ thông dụng 1",
        "Động từ thông dụng 2",
        "Danh từ thông dụng",
        "Phó từ & Liên từ",
        "Lượng từ & Giới từ",
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
        "Kinh tế & Tài chính",
        "Luật pháp & Quy định",
        "Mô tả nâng cao",
        "Quan hệ xã hội",
        "Sự kiện & Lễ hội",
        "Nhà hàng & Ẩm thực",
        "Bệnh viện & Y tế",
        "Ngân hàng & Bưu điện",
        "Sân bay & Ga tàu",
        "Khách sạn & Nhà nghỉ",
        "Phỏng vấn & Tuyển dụng",
        "Hội họp & Thuyết trình",
        "Điện thoại & Email",
        "Tin tức & Truyền thông",
        "Phim ảnh & Âm nhạc",
        "Sách & Văn học",
        "Lịch sử & Địa lý",
        "Phong tục & Tập quán",
        "Tính từ nâng cao 1",
        "Tính từ nâng cao 2",
        "Động từ nâng cao 1",
        "Động từ nâng cao 2",
        "Thành ngữ thông dụng",
    ],
    4: [
        "Gia đình & Quan hệ xã hội",
        "Thời gian & Lịch sử",
        "Ẩm thực & Ẩm thực học",
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
        "Chính trị & Xã hội",
        "Công nghệ & Đổi mới",
        "Ngôn ngữ & Giao tiếp",
        "Nghệ thuật & Giải trí",
        "Thể thao & Sức khỏe",
        "Kiến trúc & Xây dựng",
        "Giao thông & Vận tải",
        "Nông nghiệp & Thực phẩm",
        "Truyền thông & Báo chí",
        "Quảng cáo & Marketing",
        "Thiết kế & Sáng tạo",
        "Tài chính cá nhân",
        "Bảo hiểm & An sinh",
        "Tình nguyện & Từ thiện",
        "Biến đổi khí hậu",
        "Đô thị hóa",
        "Toàn cầu hóa",
        "Từ vựng học thuật 1",
        "Từ vựng học thuật 2",
        "Từ vựng chuyên ngành 1",
        "Từ vựng chuyên ngành 2",
        "Thành ngữ & Tục ngữ",
    ],
    5: [
        "Xã hội & Cộng đồng",
        "Lịch sử & Di sản",
        "Ẩm thực & Văn hóa ẩm thực",
        "Kinh doanh & Doanh nghiệp",
        "Du lịch & Hội nhập",
        "Giáo dục & Học thuật",
        "Nghề nghiệp & Phát triển",
        "Y tế & CSSK",
        "Tâm lý học & Hành vi",
        "Môi trường & Bảo tồn",
        "Văn hóa & Đa dạng",
        "Khoa học & Khám phá",
        "Kinh tế & Toàn cầu hóa",
        "Chính trị & Quản trị",
        "Công nghệ & Số hóa",
        "Ngôn ngữ & Văn học",
        "Nghệ thuật & Sáng tạo",
        "Thể thao & Thi đấu",
        "Triết học & Tư tưởng",
        "Pháp luật & Công lý",
        "Ngoại giao & Quốc tế",
        "Nhân quyền & Bình đẳng",
        "Di cư & Đa văn hóa",
        "Đô thị & Nông thôn",
        "Công nghiệp & Sản xuất",
        "Năng lượng & Tài nguyên",
        "Hàng không & Vũ trụ",
        "Hàng hải & Đại dương",
        "Khảo cổ & Di chỉ",
        "Ngôn ngữ học",
        "Văn học so sánh",
        "Mỹ học & Phê bình",
        "Đạo đức học",
        "Logic học",
        "Xã hội học",
        "Kinh tế chính trị",
        "Quan hệ lao động",
        "An sinh xã hội",
        "Y tế công cộng",
        "Dịch tễ học",
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
        "Khoa học & CN cao",
        "Tài chính & Đầu tư",
        "Chính trị & Ngoại giao",
        "Công nghệ thông tin",
        "Ngôn ngữ học & Dịch thuật",
        "Nghệ thuật & Biểu diễn",
        "Thể thao & Olympic",
        "Pháp luật & Nhân quyền",
        "Tôn giáo & Tín ngưỡng",
        "Địa chính trị",
        "Kinh tế lượng",
        "Nhân khẩu học",
        "Đô thị học",
        "Tội phạm học",
        "Văn minh so sánh",
        "Vật lý lý thuyết",
        "Hóa học hữu cơ",
        "Sinh học phân tử",
        "Di truyền học",
        "Thần kinh học",
        "Miễn dịch học",
        "Dược lý học",
        "Y học cổ truyền",
        "Thiên văn học",
        "Khoa học máy tính",
        "Trí tuệ nhân tạo",
        "An ninh mạng",
        "Kỹ thuật phần mềm",
        "Robotics",
        "Công nghệ nano",
        "Năng lượng tái tạo",
        "Biến đổi khí hậu",
        "Đa dạng sinh học",
        "Văn học hiện đại",
        "Điện ảnh học",
        "Kiến trúc cảnh quan",
    ],
    7: [
        "Triết học & Tư tưởng nâng cao",
        "Văn học kinh điển",
        "Lịch sử thế giới",
        "Chính trị quốc tế",
        "Ngoại giao đa phương",
        "Luật quốc tế",
        "Kinh tế toàn cầu",
        "Tài chính quốc tế",
        "Thương mại xuyên biên giới",
        "Quản trị chiến lược",
        "Khởi nghiệp & Đổi mới",
        "Marketing toàn cầu",
        "Khoa học tiên tiến",
        "Vật lý lượng tử",
        "Công nghệ sinh học",
        "Y học hiện đại",
        "Kỹ thuật hàng không",
        "Trí tuệ nhân tạo",
        "Dữ liệu lớn & Phân tích",
        "An ninh mạng nâng cao",
        "Blockchain & Crypto",
        "Môi trường toàn cầu",
        "Năng lượng bền vững",
        "Biến đổi khí hậu",
        "Đô thị thông minh",
        "Kiến trúc bền vững",
        "Nghệ thuật đương đại",
        "Điện ảnh & Truyền thông",
        "Âm nhạc thế giới",
        "Tâm lý học lâm sàng",
        "Xã hội học hiện đại",
        "Nhân chủng học",
        "Ngôn ngữ học ứng dụng",
        "Giáo dục khai phóng",
        "Tôn giáo so sánh",
        "Đạo đức nghề nghiệp",
        "Khởi nghiệp xã hội",
        "Phát triển cộng đồng",
        "Di sản văn hóa",
        "Báo chí điều tra",
        "Quan hệ công chúng",
        "Truyền thông xã hội",
    ],
};

// ── HTTP helpers ──

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    return fetchUrl(res.headers.location).then(resolve, reject);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                }
                let data = "";
                res.on("data", (c) => (data += c));
                res.on("end", () => resolve(data));
            })
            .on("error", reject);
    });
}

// ── Stable UUID ──

function stableUUID(hanTraditional, hanSimplified, pinyin, jyutping) {
    const normPinyin = (pinyin || "").replace(/\s+/g, "").toLowerCase();
    const normJyutping = (jyutping || "").replace(/\s+/g, "").toLowerCase();
    const key = `${hanTraditional || ""}|${hanSimplified || ""}|${normPinyin}|${normJyutping}`;
    const hash = crypto.createHash("md5").update(key).digest("hex");
    return hash.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

// ── Word categorization by POS ──

const POS_CATEGORIES = {
    greetings: { pattern: /你好|再见|谢谢|对不起|没关系|不客气|早上好|晚上好|晚安|欢迎/ },
    family: { pos: ["名"], keywords: /爸|妈|哥|姐|弟|妹|爷|奶|公|婆|夫|妻|子|女|儿|孙|亲|家|族|婚|姻/ },
    time: {
        keywords:
            /年|月|日|天|时|分|秒|钟|点|现在|今天|昨天|明天|早上|上午|中午|下午|晚上|星期|周|号|刻|半|以前|以后|时候|时间|时期|期间/,
    },
    food: {
        keywords: /饭|菜|吃|喝|茶|水|酒|肉|鱼|鸡|牛|猪|米|面|汤|果|蔬|蛋|奶|糖|盐|油|酱|醋|味|饱|饿|渴|甜|酸|苦|辣|咸/,
    },
    shopping: { keywords: /买|卖|钱|元|块|角|分|贵|便宜|商店|市场|超市|衣服|鞋|穿|戴|件|条|双|付|找/ },
    places: {
        keywords:
            /地方|这里|那里|哪里|学校|医院|银行|饭店|公园|车站|机场|公司|家|楼|房间|路|街|边|旁边|对面|附近|远|近/,
    },
    study: {
        keywords:
            /学|教|书|写|读|看|听|说|问|答|懂|会|能|考试|题|笔|纸|本|课|班|年级|汉字|拼音|语言|词|句子|翻译|意思|明白|清楚/,
    },
    daily: {
        keywords:
            /起床|睡觉|上班|下班|工作|休息|做饭|洗衣|打扫|洗澡|刷牙|洗脸|看电视|听音乐|打电话|发短信|上网|运动|跑步|游泳|跳舞|唱歌/,
    },
    transport: {
        keywords: /车|飞机|火车|地铁|公交|出租|船|自行车|走路|开|坐|骑|票|站|到达|出发|旅行|旅游|行李|护照|签证|酒店/,
    },
    health: {
        keywords: /病|疼|药|医生|护士|医院|身体|头|手|脚|眼|耳|鼻|口|牙|心|血|发烧|感冒|咳嗽|舒服|累|困|休息|锻炼/,
    },
    emotion: { keywords: /高兴|快乐|开心|难过|生气|紧张|害怕|担心|喜欢|爱|恨|想|觉得|感觉|希望|愿意|决定/ },
    work: {
        keywords: /工作|公司|老板|同事|会议|报告|项目|任务|工资|奖金|加班|请假|辞职|面试|简历|职业|经理|秘书|工程师/,
    },
    describe: {
        pos: ["形"],
        keywords: /大|小|多|少|长|短|高|低|胖|瘦|美|丑|好|坏|新|旧|快|慢|冷|热|难|容易|简单|复杂|重要|漂亮|干净|安静/,
    },
    nature: {
        keywords:
            /天|地|山|水|火|风|雨|雪|云|花|草|树|河|海|湖|太阳|月亮|星星|空气|气候|季节|春|夏|秋|冬|动物|植物|鸟|猫|狗/,
    },
    culture: { keywords: /文化|传统|节日|春节|中秋|端午|历史|习俗|音乐|舞蹈|画画|书法|戏剧|电影|故事|小说|诗歌/ },
    science: { keywords: /科学|技术|电脑|手机|网络|数据|研究|实验|发现|发明|数学|物理|化学|生物|医学|工程/ },
    economy: { keywords: /经济|市场|贸易|投资|股票|银行|贷款|利息|税收|预算|收入|支出|消费|生产|企业|产业/ },
    law: { keywords: /法律|规则|权利|义务|合同|犯罪|警察|法院|律师|证据|审判|刑罚|政府|国家|社会/ },
};

/**
 * Score a word against a category. Returns 0-10.
 */
function scoreCategory(word, category) {
    let score = 0;
    if (category.pos && category.pos.includes(word.pos)) score += 4;
    if (category.keywords) {
        const chars = word.simplified || word.traditional || "";
        if (category.keywords.test(chars)) score += 5;
    }
    if (category.pattern && category.pattern.test(word.simplified || "")) score += 5;
    return score;
}

/**
 * Assign words to topic buckets (round-robin for leftovers).
 */
function assignToTopics(words, topics) {
    const buckets = topics.map(() => []);
    const assigned = new Set();

    // First pass: assign by POS/keyword match
    for (const w of words) {
        let bestTopic = -1;
        let bestScore = 0;
        for (let i = 0; i < topics.length; i++) {
            const s = scoreCategory(w, LESSON_PLANS[0]?.[i] ? {} : {});
            // Use generic scoring for any word
            const chars = w.simplified || w.traditional || "";
            // Simple heuristic: distribute evenly
            if (s > bestScore) {
                bestScore = s;
                bestTopic = i;
            }
        }
        if (bestScore >= 4 && bestTopic >= 0) {
            buckets[bestTopic].push(w);
            assigned.add(w);
        }
    }

    // Second pass: distribute unassigned evenly
    const unassigned = words.filter((w) => !assigned.has(w));
    let idx = 0;
    for (const w of unassigned) {
        buckets[idx % buckets.length].push(w);
        idx++;
    }

    return buckets;
}

/**
 * Auto-assign words to topic plans for a level.
 * Uses POS (part of speech) from Anki data as primary signal.
 */
function autoGroupWords(words, level) {
    const plans = LESSON_PLANS[level];
    if (!plans) {
        // Fallback: 20 words per lesson
        const perLesson = Math.max(10, Math.ceil(words.length / 15));
        const groups = [];
        for (let i = 0; i < words.length; i += perLesson) {
            groups.push(words.slice(i, i + perLesson));
        }
        return groups;
    }

    // Build category scoring for each topic plan
    const topicKeywords = buildTopicKeywords(plans);

    const buckets = plans.map(() => []);
    const assigned = new Set();

    // First pass: assign by POS/keyword match
    for (const w of words) {
        let bestTopic = -1;
        let bestScore = 0;
        const chars = w.simplified || w.traditional || "";
        const pos = w.pos || "";

        for (let i = 0; i < plans.length; i++) {
            const keywords = topicKeywords[i];
            let score = 0;

            // Check POS match
            if (keywords.posRe && keywords.posRe.test(pos)) score += 4;
            // Check keyword match in the word
            if (keywords.charRe) {
                const matches = (chars.match(keywords.charRe) || []).length;
                score += Math.min(matches, 5);
            }
            // Check whole word match
            if (keywords.wordSet && keywords.wordSet.has(chars)) score += 6;

            if (score > bestScore) {
                bestScore = score;
                bestTopic = i;
            }
        }

        if (bestScore >= 3 && bestTopic >= 0) {
            buckets[bestTopic].push(w);
            assigned.add(w);
        }
    }

    // Second pass: distribute unassigned evenly (round-robin)
    const unassigned = words.filter((w) => !assigned.has(w));
    let rrIdx = 0;
    for (const w of unassigned) {
        buckets[rrIdx % buckets.length].push(w);
        rrIdx++;
    }

    // Filter empty buckets, return groups with at least 5 words
    return buckets.filter((b) => b.length >= 5);
}

/**
 * Build keyword patterns from Vietnamese topic names.
 */
function buildTopicKeywords(plans) {
    const map = {
        "Gia đình": { chars: "爸妈哥姐弟妹爷奶公婆夫妻子女儿孙亲家族婚姻姻戚", posRe: /名/ },
        "Thời gian": { chars: "年月日天时分秒钟点现在今天昨明早晚午星周号刻半前后时候时期期间历", posRe: /名/ },
        "Đồ ăn|Ẩm thực": { chars: "饭菜吃喝茶酒肉鱼鸡牛猪米面汤果蔬蛋奶糖盐油酱醋味饱饿渴酸甜苦辣咸", posRe: /名/ },
        "Mua sắm": { chars: "买卖钱元块角分贵便宜商店市场超市衣服鞋穿戴件条双付找", posRe: /动|名/ },
        "Địa điểm|Phương hướng": {
            chars: "地方这里那里哪里学校医院银行饭店公园车站机场公司家楼房问路街边旁对面附近远近东南西北左右前后上下里外进出",
            posRe: /名/,
        },
        "Học tập": {
            chars: "学教书读写看听说问答懂会能考试题笔纸本课班年级汉字拼音语言词句子翻译意思明白清楚",
            posRe: /动|名/,
        },
        "Hoạt động|hằng ngày": {
            chars: "起床睡觉上班下班工作休息做饭洗衣打扫洗澡刷牙洗脸看电视听音乐打电话发短信上网运动跑步游泳跳舞唱歌",
            posRe: /动/,
        },
        "Giao thông|Du lịch": {
            chars: "车飞机火车地铁公交出租船自行车走路开坐骑票站到达出发旅行旅游行李护照签证酒店",
            posRe: /动|名/,
        },
        "Sức khỏe": { chars: "病疼药医生护士医院身体头手脚眼耳鼻口牙心血发烧感冒咳嗽舒服累困休息锻炼", posRe: /名|形/ },
        "Cảm xúc|Tính cách": {
            chars: "高兴快乐开心难过生气紧张害怕担心喜欢爱恨想觉得感觉希望愿意决定",
            posRe: /形|动/,
        },
        "Công việc|Nghề nghiệp": {
            chars: "工作公司老板同事会议报告项目任务工资奖金加班请假辞职面试简历职业经理秘书工程师",
            posRe: /名|动/,
        },
        "Mô tả|So sánh": {
            chars: "大小多少长短高矮胖瘦美丑好坏新旧快慢冷热难容易简单复杂重要漂亮干净安静更最比较非常特别",
            posRe: /形/,
        },
        "Xã hội|Cộng đồng": { chars: "社会人民群众团体组织社区邻居朋友同伴关系交流合作帮助支持", posRe: /名/ },
        "Môi trường|Thiên nhiên|Sinh thái": {
            chars: "天地山水火风雨雪云花草树河海湖太阳月亮星星空气气候季节春夏秋冬动物植物鸟猫狗",
            posRe: /名/,
        },
        "Văn hóa|Nghệ thuật|Truyền thống": {
            chars: "文化传统节日春节中秋端午历史习俗音乐舞蹈画画书法戏剧电影故事小说诗歌",
            posRe: /名/,
        },
        "Khoa học|Công nghệ": {
            chars: "科学技术电脑手机网络数据研究实验发现发明数学物理化学生物医学工程",
            posRe: /名/,
        },
        "Kinh tế|Tài chính": { chars: "经济市场贸易投资股票银行贷款利息税收预算收入支出消费生产企业产业", posRe: /名/ },
        "Chính trị|Pháp luật|Quản trị": {
            chars: "法律法规权利义务合同犯罪警察法院律师证据审判刑罚政府国家社会政治政策选举领导管理",
            posRe: /名/,
        },
    };

    return plans.map((plan) => {
        let charStr = "";
        let posStr = "";
        const wordSet = new Set();

        for (const [pattern, def] of Object.entries(map)) {
            if (new RegExp(pattern).test(plan)) {
                charStr += def.chars || "";
                posStr += def.posRe ? def.posRe.source.replace(/[\/|]/g, "") : "";
            }
        }

        // Also add common plan-specific characters
        const planChars = extractChineseChars(plan);
        charStr += planChars;

        return {
            charRe: charStr ? new RegExp(`[${charStr}]`) : null,
            posRe: posStr ? new RegExp(`[${posStr}]`) : null,
            wordSet,
        };
    });
}

function extractChineseChars(str) {
    return (str.match(/[\u4e00-\u9fff]/g) || []).join("");
}

// ── Grammar content generation ──

function formatGrammarContent(grammarPoints) {
    if (!grammarPoints || grammarPoints.length === 0) return "";

    // Group by category
    const byCategory = new Map();
    for (const gp of grammarPoints) {
        const cat = gp["类别"] || "Khác";
        const catName = gp["类别名称"] || "";
        const key = cat + (catName ? ": " + catName : "");
        if (!byCategory.has(key)) byCategory.set(key, []);
        byCategory.get(key).push(gp);
    }

    let md = "";
    let sectionNum = 1;

    for (const [cat, points] of byCategory) {
        md += `**${cat}**\n\n`;
        for (const gp of points) {
            const detail = gp["细目"] || "";
            const content = gp["语法内容"] || "";
            const title = detail ? `${detail}: ${content}` : content;
            md += `${sectionNum}. **${title}**\n\n`;
            sectionNum++;
        }
        md += "---\n\n";
    }

    return md.trim();
}

// ── Main builder function ──

async function buildLevel(prisma, level) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`BUILDING HSK LEVEL ${level}`);
    console.log(`${"=".repeat(60)}`);

    const hskLevel = `HSK ${level}`;

    // ── Step 1: Download Anki data (skip for levels without Anki data) ──
    console.log(`  [1/5] Downloading Anki data...`);
    const ankiUrl = `${GITHUB_BASE}/Anki%20xiehanzi/HSK_Level_${level}.txt`;
    let ankiRaw;
    let parsed = [];
    try {
        ankiRaw = await fetchUrl(ankiUrl);
    } catch (e) {
        console.log(`  ⚠️  No Anki data: ${e.message} — using DB-only words`);
        ankiRaw = null;
    }

    if (ankiRaw) {
        const ankiLines = ankiRaw.split("\n").filter((l) => l.includes("\t"));
        console.log(`  → ${ankiLines.length} entries`);
        // Parse Anki data for POS info
        const seenChars = new Set();
        for (const line of ankiLines) {
            const cols = line.split("\t");
            if (cols.length < 3) continue;
            const simplified = (cols[0] || "").trim();
            const traditional = (cols[1] || "").trim();
            const pinyin = (cols[2] || "").trim();
            const posRaw = (cols[5] || "").trim();
            if (!simplified) continue;
            const posMatch = posRaw.match(/[\u4e00-\u9fff]+/g);
            const pos = posMatch ? posMatch.join(",") : "";
            const id = stableUUID(traditional || simplified, simplified, pinyin, "");
            const dedupKey = `${simplified}|${(pinyin || "").replace(/\s+/g, "").toLowerCase()}`;
            if (seenChars.has(dedupKey)) continue;
            seenChars.add(dedupKey);
            parsed.push({
                id,
                hanSimplified: simplified,
                hanTraditional: traditional || simplified,
                pinyin,
                hskLevel,
                pos,
            });
        }
        console.log(`  → ${parsed.length} unique parsed entries`);
    }

    const now = new Date().toISOString();

    // ── Step 3: Create lessons ──
    console.log(`  [3/5] Creating lessons...`);

    // Get all vocab for this level from DB
    const levelPattern = `HSK ${level}`;
    const dbVocabAll = await prisma.$queryRawUnsafe(
        `SELECT id, han_simplified as "hanSimplified", han_traditional as "hanTraditional", pinyin
         FROM vocabularies WHERE hsk_level = $1`,
        levelPattern,
    );
    const dbVocab = dbVocabAll;
    console.log(`  → ${dbVocab.length} vocab in DB for ${levelPattern}`);

    // Map each DB entry back to parsed info for POS
    const dbMap = new Map(dbVocab.map((v) => [v.id, v]));

    // Build a POS lookup from parsed Anki data
    const posMap = new Map(parsed.map((p) => [p.id, p.pos || ""]));

    // Use ALL words from DB (not just Anki) for lesson grouping
    const wordsForGrouping = dbVocab.map((v) => ({
        id: v.id,
        simplified: v.hanSimplified || v.hanTraditional,
        traditional: v.hanTraditional,
        pos: posMap.get(v.id) || "",
    }));

    const groups = autoGroupWords(wordsForGrouping, level);

    // If auto-grouping produced no groups, fallback to chunking
    let finalGroups = groups;
    if (finalGroups.length === 0 || finalGroups.every((g) => g.length < 5)) {
        const perLesson = Math.max(8, Math.ceil(wordsForGrouping.length / 12));
        finalGroups = [];
        for (let i = 0; i < wordsForGrouping.length; i += perLesson) {
            finalGroups.push(wordsForGrouping.slice(i, i + perLesson));
        }
    }

    console.log(`  → ${finalGroups.length} auto-generated lesson groups`);

    // ── Step 4: Download grammar JSON ──
    console.log(`  [4/5] Downloading grammar data...`);
    const grammarUrl = `${GITHUB_BASE}/HSK%20Grammar/json/HSK%20${level}.json`;
    let grammarPoints;
    try {
        const grammarRaw = await fetchUrl(grammarUrl);
        grammarPoints = JSON.parse(grammarRaw);
    } catch (e) {
        console.log(`  ⚠️  Cannot download grammar: ${e.message}`);
        grammarPoints = [];
    }
    console.log(`  → ${grammarPoints.length} grammar points`);

    // ── Step 5: Delete old lessons & grammars for this level (clean rebuild) ──
    console.log(`  [5/6] Cleaning old lessons & grammars for ${hskLevel}...`);
    const oldLessons = await prisma.lesson.findMany({
        where: { hskLevel, userId: ADMIN_USER_ID },
        select: { id: true, grammarIds: true },
    });
    const oldGrammarIds = new Set();
    for (const l of oldLessons) {
        for (const gid of l.grammarIds || []) oldGrammarIds.add(gid);
    }
    if (oldLessons.length > 0) {
        await prisma.lesson.deleteMany({ where: { hskLevel, userId: ADMIN_USER_ID } });
        console.log(`  → Deleted ${oldLessons.length} old lessons`);
    }
    if (oldGrammarIds.size > 0) {
        await prisma.grammar.deleteMany({
            where: { id: { in: [...oldGrammarIds] }, userId: ADMIN_USER_ID },
        });
        console.log(`  → Deleted ${oldGrammarIds.size} old grammar entries`);
    }

    // ── Step 6: Create grammar & lesson entries ──
    console.log(`  [6/6] Creating grammar & lesson entries...`);

    // Distribute grammar points across lessons
    const lessonsToCreate = [];
    const plans = LESSON_PLANS[level] || [];

    // Assign grammar points to lessons evenly
    const grammarPerLesson = Math.max(1, Math.ceil(grammarPoints.length / Math.max(1, finalGroups.length)));
    const grammarChunks = [];
    for (let i = 0; i < grammarPoints.length; i += grammarPerLesson) {
        grammarChunks.push(grammarPoints.slice(i, i + grammarPerLesson));
    }

    for (let i = 0; i < finalGroups.length; i++) {
        const group = finalGroups[i];
        const topicName = plans[i] || `Nhóm ${i + 1}`;
        const title = `Bài ${i + 1}: ${topicName}`;
        const vocabIds = group.map((w) => w.id);
        const grammarChunk = grammarChunks[i] || [];
        const grammarContent = formatGrammarContent(grammarChunk);

        const gId = stableUUID(ADMIN_USER_ID, title, "grammar", level.toString());
        const lId = stableUUID(ADMIN_USER_ID, title, "lesson", level.toString());

        lessonsToCreate.push({
            grammarId: gId,
            lessonId: lId,
            title,
            vocabIds,
            grammarTitle: title + " — Ngữ pháp",
            grammarContent:
                grammarContent || `**${title} — Ngữ pháp**\n\nĐang cập nhật nội dung ngữ pháp cho bài học này.`,
            hskLevel,
        });
    }

    // Batch insert grammar + lessons
    let grammarDone = 0;
    let lessonDone = 0;
    for (const lc of lessonsToCreate) {
        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO grammars (id, user_id, title, content, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content=EXCLUDED.content, updated_at=EXCLUDED.updated_at`,
                lc.grammarId,
                ADMIN_USER_ID,
                lc.grammarTitle,
                lc.grammarContent,
                now,
                now,
            );
            grammarDone++;
        } catch (e) {
            console.log(`  ⚠️  Grammar insert error for "${lc.title}": ${e.message}`);
        }

        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO lessons (id, user_id, title, vocabulary_ids, grammar_ids, hsk_level, created_at, updated_at)
                 VALUES ($1, $2, $3, $4::uuid[], $5::uuid[], $6, $7, $8)
                 ON CONFLICT (id) DO UPDATE SET
                   title=EXCLUDED.title, vocabulary_ids=EXCLUDED.vocabulary_ids,
                   grammar_ids=EXCLUDED.grammar_ids, hsk_level=EXCLUDED.hsk_level, updated_at=EXCLUDED.updated_at`,
                lc.lessonId,
                ADMIN_USER_ID,
                lc.title,
                `{${lc.vocabIds.join(",")}}`,
                `{${lc.grammarId}}`,
                lc.hskLevel,
                now,
                now,
            );
            lessonDone++;
        } catch (e) {
            console.log(`  ⚠️  Lesson insert error for "${lc.title}": ${e.message}`);
        }
    }

    console.log(`  → ${grammarDone} grammar entries, ${lessonDone} lesson entries`);
    console.log(`  ✅ HSK ${level} done!`);

    return true;
}

// ── Main ──

async function main() {
    const args = process.argv.slice(2);
    const target = args[0] || "all";

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    try {
        console.log("🚀 HSK Lesson Builder — Automated Pipeline");
        console.log(`Target: ${target}`);
        console.log(`Admin user: ${ADMIN_USER_ID}`);

        if (target === "all") {
            // Clean up old HSK 7-9 lessons first
            console.log("Cleaning up old HSK 7-9 lessons...");
            const old789 = await prisma.lesson.findMany({
                where: { hskLevel: "HSK 7-9", userId: ADMIN_USER_ID },
                select: { id: true, grammarIds: true },
            });
            const oldGids = new Set();
            for (const l of old789) {
                for (const g of l.grammarIds || []) oldGids.add(g);
            }
            if (old789.length > 0) {
                await prisma.lesson.deleteMany({ where: { hskLevel: "HSK 7-9", userId: ADMIN_USER_ID } });
                console.log(`  → Deleted ${old789.length} old HSK 7-9 lessons`);
            }
            if (oldGids.size > 0) {
                await prisma.grammar.deleteMany({ where: { id: { in: [...oldGids] }, userId: ADMIN_USER_ID } });
            }

            for (let level = 2; level <= 7; level++) {
                await buildLevel(prisma, level);
            }
        } else {
            const level = parseInt(target);
            if (isNaN(level) || level < 2 || level > 7) {
                console.error(`❌ Invalid level: ${target}. Use 2-7 or "all".`);
                process.exit(1);
            }
            await buildLevel(prisma, level);
        }

        console.log("\n🎉 All done!");
    } catch (e) {
        console.error("❌ Error:", e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
