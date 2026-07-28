import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "crypto";

const LESSONS = [
    {
        title: "Bài 1: Chào hỏi & Giới thiệu",
        words: [
            "你",
            "好",
            "您",
            "我",
            "他",
            "她",
            "是",
            "叫",
            "什么",
            "名字",
            "谁",
            "的",
            "认识",
            "高兴",
            "老师",
            "学生",
            "同学",
            "朋友",
            "呢",
            "吗",
            "谢谢",
            "不客气",
            "对不起",
            "没关系",
            "再见",
            "很",
            "也",
            "请",
        ],
        grammar: `**BÀI 1: CHÀO HỎI & GIỚI THIỆU**

---

**I. HỘI THOẠI**

**Đoạn 1: Chào hỏi**

A: 你好！(Nǐ hǎo!) — Xin chào!
B: 你好！(Nǐ hǎo!) — Xin chào!

A: 你好吗？(Nǐ hǎo ma?) — Bạn khỏe không?
B: 我很好，你呢？(Wǒ hěn hǎo, nǐ ne?) — Tôi rất khỏe, còn bạn?
A: 我也很好。(Wǒ yě hěn hǎo.) — Tôi cũng rất khỏe.

**Đoạn 2: Giới thiệu tên**

A: 你叫什么名字？(Nǐ jiào shénme míngzi?) — Bạn tên là gì?
B: 我叫小明，你呢？(Wǒ jiào Xiǎo Míng, nǐ ne?)
A: 我叫小红。(Wǒ jiào Xiǎo Hóng.)
B: 认识你很高兴！(Rènshi nǐ hěn gāoxìng!)

**Đoạn 3: Giới thiệu người khác**

A: 他是谁？(Tā shì shéi?)
B: 他是我的老师。(Tā shì wǒ de lǎoshī.)
A: 她呢？(Tā ne?)
B: 她是我的同学。(Tā shì wǒ de tóngxué.)

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 你 | nǐ | bạn |
| 2 | 好 | hǎo | tốt, khỏe |
| 3 | 您 | nín | ngài |
| 4 | 我 | wǒ | tôi |
| 5 | 他 | tā | anh ấy |
| 6 | 她 | tā | cô ấy |
| 7 | 是 | shì | là |
| 8 | 叫 | jiào | gọi |
| 9 | 什么 | shénme | cái gì |
| 10 | 名字 | míngzi | tên |
| 11 | 谁 | shéi | ai |
| 12 | 的 | de | của |
| 13 | 认识 | rènshi | quen biết |
| 14 | 高兴 | gāoxìng | vui mừng |
| 15 | 老师 | lǎoshī | giáo viên |
| 16 | 学生 | xuésheng | học sinh |
| 17 | 同学 | tóngxué | bạn học |
| 18 | 朋友 | péngyou | bạn bè |
| 19 | 呢 | ne | còn...? |
| 20 | 吗 | ma | không? |
| 21 | 谢谢 | xièxie | cảm ơn |
| 22 | 不客气 | bú kèqi | không có gì |
| 23 | 对不起 | duìbuqǐ | xin lỗi |
| 24 | 没关系 | méi guānxi | không sao |
| 25 | 再见 | zàijiàn | tạm biệt |
| 26 | 很 | hěn | rất |
| 27 | 也 | yě | cũng |
| 28 | 请 | qǐng | mời |

---

**III. NGỮ PHÁP**

**1. Câu đơn với 是 (shì)** — S + 是 + N
- 我是学生。Phủ định: 不是

**2. Câu hỏi với 吗 (ma)** — Thêm 吗 cuối câu
- 你好吗？

**3. Câu hỏi với 什么 (shénme)**
- 你叫什么名字？

**4. Câu hỏi với 谁 (shéi)**
- 他是谁？

**5. Trợ từ 呢 (ne)** — Còn...?
**6. Sở hữu với 的 (de)** — Của

---

**IV. LUYỆN TẬP**

1. Xin chào! → ____
2. Bạn tên là gì? → ____
3. Tôi là học sinh. → ____`,
    },
    {
        title: "Bài 2: Số đếm & Tuổi tác",
        words: [
            "一",
            "二",
            "三",
            "四",
            "五",
            "六",
            "七",
            "八",
            "九",
            "十",
            "零",
            "百",
            "千",
            "岁",
            "几",
            "年",
            "半",
            "号",
            "第",
        ],
        grammar: `**BÀI 2: SỐ ĐẾM & TUỔI TÁC**

---

**I. HỘI THOẠI**

A: 你多大？(Nǐ duō dà?)
B: 我二十岁。(Wǒ èrshí suì.)
A: 你呢？B: 我十九岁。

A: 你有几个朋友？B: 我有五个。

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 一 | yī | một |
| 2 | 二/两 | èr/liǎng | hai |
| 3 | 三 | sān | ba |
| 4 | 四 | sì | bốn |
| 5 | 五 | wǔ | năm |
| 6 | 六 | liù | sáu |
| 7 | 七 | qī | bảy |
| 8 | 八 | bā | tám |
| 9 | 九 | jiǔ | chín |
| 10 | 十 | shí | mười |
| 11 | 零 | líng | không |
| 12 | 百 | bǎi | trăm |
| 13 | 千 | qiān | nghìn |
| 14 | 岁 | suì | tuổi |
| 15 | 几 | jǐ | mấy |
| 16 | 年 | nián | năm |
| 17 | 半 | bàn | rưỡi |
| 18 | 号 | hào | ngày |
| 19 | 第 | dì | thứ |

---

**III. NGỮ PHÁP**

**1. Số đếm 1-10:** 一~十
**2. Số 11-99:** 十一, 二十, 九十九
**3. 二 vs 两:** 二 đếm số, 两 trước lượng từ
**4. Hỏi tuổi:** 多大？
**5. 第 + số = thứ tự:** 第一

---

**IV. LUYỆN TẬP**

1. Viết 15, 38, 100 bằng chữ Hán
2. Bạn bao nhiêu tuổi? → ____
3. Tôi 25 tuổi. → ____`,
    },
    {
        title: "Bài 3: Gia đình",
        words: [
            "家",
            "爸爸",
            "妈妈",
            "哥哥",
            "姐姐",
            "弟弟",
            "妹妹",
            "儿子",
            "女儿",
            "孩子",
            "爱人",
            "有",
            "口",
            "爱",
            "和",
            "都",
            "大家",
            "人",
            "男",
            "女",
        ],
        grammar: `**BÀI 3: GIA ĐÌNH**

---

**I. HỘI THOẠI**

A: 你家有几口人？B: 我家有三口人。爸爸、妈妈和我。
A: 你有哥哥吗？B: 我有一个哥哥和一个妹妹。

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 家 | jiā | nhà, gia đình |
| 2 | 爸爸 | bàba | bố |
| 3 | 妈妈 | māma | mẹ |
| 4 | 哥哥 | gēge | anh trai |
| 5 | 姐姐 | jiějie | chị gái |
| 6 | 弟弟 | dìdi | em trai |
| 7 | 妹妹 | mèimei | em gái |
| 8 | 儿子 | érzi | con trai |
| 9 | 女儿 | nǚ'ér | con gái |
| 10 | 孩子 | háizi | con cái |
| 11 | 爱人 | àiren | vợ/chồng |
| 12 | 有 | yǒu | có |
| 13 | 口 | kǒu | miệng |
| 14 | 爱 | ài | yêu |
| 15 | 和 | hé | và |
| 16 | 都 | dōu | đều |
| 17 | 大家 | dàjiā | mọi người |
| 18 | 人 | rén | người |
| 19 | 男 | nán | nam |
| 20 | 女 | nǚ | nữ |

---

**III. NGỮ PHÁP**

**1. 有 — Có:** 我有一个姐姐。Phủ định: 没有
**2. Lượng từ 口:** 我家有三口人。
**3. 和 — Và (nối danh từ)**
**4. 都 — Đều**

---

**IV. LUYỆN TẬP**

1. Nhà tôi có 4 người. → ____
2. Tôi có một chị gái và một em trai. → ____`,
    },
    {
        title: "Bài 4: Thời gian & Ngày tháng",
        words: [
            "今天",
            "明天",
            "昨天",
            "星期",
            "月",
            "日",
            "点",
            "分",
            "现在",
            "上午",
            "下午",
            "晚上",
            "早上",
            "时候",
            "小时",
            "分钟",
            "前",
            "后",
        ],
        grammar: `**BÀI 4: THỜI GIAN & NGÀY THÁNG**

---

**I. HỘI THOẠI**

A: 今天星期几？B: 今天星期三。
A: 明天是几号？B: 明天是十五号。
A: 现在几点？B: 现在八点半。

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 今天 | jīntiān | hôm nay |
| 2 | 明天 | míngtiān | ngày mai |
| 3 | 昨天 | zuótiān | hôm qua |
| 4 | 星期 | xīngqī | tuần |
| 5 | 月 | yuè | tháng |
| 6 | 日 | rì | ngày |
| 7 | 点 | diǎn | giờ |
| 8 | 分 | fēn | phút |
| 9 | 现在 | xiànzài | bây giờ |
| 10 | 上午 | shàngwǔ | buổi sáng |
| 11 | 下午 | xiàwǔ | buổi chiều |
| 12 | 晚上 | wǎnshang | buổi tối |
| 13 | 早上 | zǎoshang | sáng sớm |
| 14 | 时候 | shíhou | lúc, khi |
| 15 | 小时 | xiǎoshí | tiếng |
| 16 | 分钟 | fēnzhōng | phút |
| 17 | 前 | qián | trước |
| 18 | 后 | hòu | sau |

---

**III. NGỮ PHÁP**

**1. Hỏi thứ:** 星期几？星期一~六, 星期天
**2. Hỏi ngày:** 几号？
**3. Nói giờ:** S + 点 + 分 (三点半)
**4. Trật tự:** lớn → nhỏ
**5. 时候 vs 小时**

---

**IV. LUYỆN TẬP**

1. Hôm nay thứ mấy? → ____
2. Bây giờ 10 giờ 15 phút. → ____`,
    },
    {
        title: "Bài 5: Đồ ăn & Thức uống",
        words: [
            "吃",
            "喝",
            "饭",
            "菜",
            "水",
            "茶",
            "水果",
            "苹果",
            "米饭",
            "面",
            "面条",
            "包子",
            "鸡",
            "鸡蛋",
            "牛奶",
            "杯子",
            "碗",
            "筷子",
            "好吃",
            "喜欢",
            "想",
        ],
        grammar: `**BÀI 5: ĐỒ ĂN & THỨC UỐNG**

---

**I. HỘI THOẠI**

A: 你想吃什么？B: 我想吃米饭和鸡。
A: 你喝什么？B: 我喝水。
A: 这个菜好吃吗？B: 很好吃！
A: 你喜欢吃什么水果？B: 我喜欢吃苹果。

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 吃 | chī | ăn |
| 2 | 喝 | hē | uống |
| 3 | 饭 | fàn | cơm |
| 4 | 菜 | cài | món ăn |
| 5 | 水 | shuǐ | nước |
| 6 | 茶 | chá | trà |
| 7 | 水果 | shuǐguǒ | trái cây |
| 8 | 苹果 | píngguǒ | táo |
| 9 | 米饭 | mǐfàn | cơm |
| 10 | 面 | miàn | mì |
| 11 | 面条 | miàntiáo | mì sợi |
| 12 | 包子 | bāozi | bánh bao |
| 13 | 鸡 | jī | gà |
| 14 | 鸡蛋 | jīdàn | trứng |
| 15 | 牛奶 | niúnǎi | sữa |
| 16 | 杯子 | bēizi | cốc |
| 17 | 碗 | wǎn | bát |
| 18 | 筷子 | kuàizi | đũa |
| 19 | 好吃 | hǎochī | ngon |
| 20 | 喜欢 | xǐhuan | thích |
| 21 | 想 | xiǎng | muốn |

---

**III. NGỮ PHÁP**

**1. 吃/喝 + đồ ăn/uống**
**2. 想 + V — Muốn**
**3. 喜欢 — Thích**
**4. Lượng từ:** 一杯水, 一碗米饭
**5. 好吃 — Ngon**

---

**IV. LUYỆN TẬP**

1. Tôi muốn uống trà. → ____
2. Bạn thích ăn gì? → ____`,
    },
    {
        title: "Bài 6: Mua sắm",
        words: [
            "买",
            "卖",
            "钱",
            "元",
            "块",
            "毛",
            "多少",
            "贵",
            "便宜",
            "商店",
            "个",
            "件",
            "本",
            "些",
            "这",
            "那",
            "给",
            "要",
        ],
        grammar: `**BÀI 6: MUA SẮM**

---

**I. HỘI THOẠI**

A: 这个苹果多少钱？B: 五块一斤。
A: 太贵了！便宜一点儿，好吗？B: 四块五吧。
A: 这件衣服多少钱？B: 一百元。A: 可以便宜吗？

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 买 | mǎi | mua |
| 2 | 卖 | mài | bán |
| 3 | 钱 | qián | tiền |
| 4 | 元 | yuán | đồng |
| 5 | 块 | kuài | đồng |
| 6 | 毛 | máo | hào |
| 7 | 多少 | duōshao | bao nhiêu |
| 8 | 贵 | guì | đắt |
| 9 | 便宜 | piányi | rẻ |
| 10 | 商店 | shāngdiàn | cửa hàng |
| 11 | 个 | ge | cái |
| 12 | 件 | jiàn | cái (áo) |
| 13 | 本 | běn | quyển |
| 14 | 些 | xiē | một ít |
| 15 | 这 | zhè | này |
| 16 | 那 | nà | kia |
| 17 | 给 | gěi | cho, đưa |
| 18 | 要 | yào | muốn |

---

**III. NGỮ PHÁP**

**1. Hỏi giá:** 多少钱？
**2. Tiền tệ:** 元/块, 毛
**3. Lượng từ:** 个, 件, 本
**4. 这/那 — Này/Kia**
**5. 给 — Cho**

---

**IV. LUYỆN TẬP**

1. Cái này bao nhiêu tiền? → ____
2. Đắt quá! Rẻ một chút được không? → ____`,
    },
    {
        title: "Bài 7: Địa điểm & Phương hướng",
        words: [
            "在",
            "这儿",
            "那儿",
            "哪儿",
            "学校",
            "医院",
            "商店",
            "饭店",
            "家",
            "上",
            "下",
            "前",
            "后",
            "里",
            "外",
            "边",
            "去",
            "来",
            "回",
            "到",
        ],
        grammar: `**BÀI 7: ĐỊA ĐIỂM & PHƯƠNG HƯỚNG**

---

**I. HỘI THOẠI**

A: 请问，商店在哪儿？B: 在那儿，学校的后面。
A: 你在哪儿？B: 我在家。

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 在 | zài | ở, tại |
| 2 | 这儿 | zhèr | ở đây |
| 3 | 那儿 | nàr | ở đó |
| 4 | 哪儿 | nǎr | ở đâu |
| 5 | 学校 | xuéxiào | trường học |
| 6 | 医院 | yīyuàn | bệnh viện |
| 7 | 商店 | shāngdiàn | cửa hàng |
| 8 | 饭店 | fàndiàn | nhà hàng |
| 9 | 家 | jiā | nhà |
| 10 | 上 | shàng | trên |
| 11 | 下 | xià | dưới |
| 12 | 前 | qián | trước |
| 13 | 后 | hòu | sau |
| 14 | 里 | lǐ | trong |
| 15 | 外 | wài | ngoài |
| 16 | 边 | biān | phía |
| 17 | 去 | qù | đi |
| 18 | 来 | lái | đến |
| 19 | 回 | huí | về |
| 20 | 到 | dào | đến nơi |

---

**III. NGỮ PHÁP**

**1. 在 — Ở, tại**
**2. 去/来/回 — Đi/Đến/Về**
**3. Phương hướng:** N + 边
**4. 这儿/那儿/哪儿**

---

**IV. LUYỆN TẬP**

1. Trường học ở đâu? → ____
2. Tôi đi đến bệnh viện. → ____`,
    },
    {
        title: "Bài 8: Học tập & Ngôn ngữ",
        words: [
            "学习",
            "书",
            "笔",
            "中文",
            "汉字",
            "写",
            "读",
            "说",
            "听",
            "看",
            "词典",
            "意思",
            "懂",
            "会",
            "能",
            "可以",
            "问",
            "回答",
            "问题",
        ],
        grammar: `**BÀI 8: HỌC TẬP & NGÔN NGỮ**

---

**I. HỘI THOẠI**

A: 你学习中文吗？B: 对，我学习中文。
A: 你觉得中文难吗？B: 不太难。
A: 你会写汉字吗？B: 我会写一些。

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 学习 | xuéxí | học tập |
| 2 | 书 | shū | sách |
| 3 | 笔 | bǐ | bút |
| 4 | 中文 | Zhōngwén | tiếng Trung |
| 5 | 汉字 | Hànzì | chữ Hán |
| 6 | 写 | xiě | viết |
| 7 | 读 | dú | đọc |
| 8 | 说 | shuō | nói |
| 9 | 听 | tīng | nghe |
| 10 | 看 | kàn | xem |
| 11 | 词典 | cídiǎn | từ điển |
| 12 | 意思 | yìsi | ý nghĩa |
| 13 | 懂 | dǒng | hiểu |
| 14 | 会 | huì | biết |
| 15 | 能 | néng | có thể |
| 16 | 可以 | kěyǐ | được phép |
| 17 | 问 | wèn | hỏi |
| 18 | 回答 | huídá | trả lời |
| 19 | 问题 | wèntí | câu hỏi |

---

**III. NGỮ PHÁP**

**1. 会/能/可以**
**2. Động từ:** 看书, 写字, 说话
**3. 觉得 — Cảm thấy**

---

**IV. LUYỆN TẬP**

1. Bạn biết nói tiếng Trung không? → ____
2. Tôi không hiểu. → ____`,
    },
    {
        title: "Bài 9: Hoạt động hàng ngày",
        words: [
            "起床",
            "睡觉",
            "吃饭",
            "上课",
            "下课",
            "上班",
            "下班",
            "工作",
            "休息",
            "运动",
            "跑步",
            "游泳",
            "做",
            "开",
            "关",
            "洗",
            "穿",
            "用",
            "打电话",
            "上网",
        ],
        grammar: `**BÀI 9: HOẠT ĐỘNG HÀNG NGÀY**

---

**I. HỘI THOẠI**

A: 你每天早上几点起床？B: 我六点半起床。
A: 几点上班？B: 八点上班，五点下班。
A: 你周末做什么？B: 我喜欢跑步和游泳。

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 起床 | qǐchuáng | thức dậy |
| 2 | 睡觉 | shuìjiào | ngủ |
| 3 | 吃饭 | chīfàn | ăn cơm |
| 4 | 上课 | shàngkè | lên lớp |
| 5 | 下课 | xiàkè | tan lớp |
| 6 | 上班 | shàngbān | đi làm |
| 7 | 下班 | xiàbān | tan làm |
| 8 | 工作 | gōngzuò | làm việc |
| 9 | 休息 | xiūxi | nghỉ ngơi |
| 10 | 运动 | yùndòng | tập thể dục |
| 11 | 跑步 | pǎobù | chạy bộ |
| 12 | 游泳 | yóuyǒng | bơi |
| 13 | 做 | zuò | làm |
| 14 | 开 | kāi | mở, bật |
| 15 | 关 | guān | đóng, tắt |
| 16 | 洗 | xǐ | giặt, rửa |
| 17 | 穿 | chuān | mặc |
| 18 | 用 | yòng | dùng |
| 19 | 打电话 | dǎ diànhuà | gọi điện |
| 20 | 上网 | shàngwǎng | lên mạng |

---

**III. NGỮ PHÁP**

**1. 在 + V — Đang làm gì**
**2. Động từ ly hợp:** 睡觉, 上课
**3. Cặp đối lập:** 开↔关, 上↔下
**4. 一起 — Cùng nhau**

---

**IV. LUYỆN TẬP**

1. Mỗi ngày tôi dậy lúc 7 giờ. → ____
2. Cuối tuần bạn làm gì? → ____`,
    },
    {
        title: "Bài 10: Giao thông & Du lịch",
        words: [
            "车",
            "出租车",
            "公共汽车",
            "火车",
            "飞机",
            "地铁",
            "坐",
            "开",
            "怎么",
            "走",
            "路",
            "远",
            "近",
            "快",
            "慢",
            "分钟",
            "小时",
            "到",
            "从",
            "往",
        ],
        grammar: `**BÀI 10: GIAO THÔNG & DU LỊCH**

---

**I. HỘI THOẠI**

A: 你怎么去学校？B: 我坐公共汽车去。
A: 要多长时间？B: 二十分钟。
A: 你好，我去火车站。B: 不远，五分钟就到。

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 车 | chē | xe |
| 2 | 出租车 | chūzūchē | taxi |
| 3 | 公共汽车 | gōnggòng qìchē | xe buýt |
| 4 | 火车 | huǒchē | tàu hỏa |
| 5 | 飞机 | fēijī | máy bay |
| 6 | 地铁 | dìtiě | tàu điện ngầm |
| 7 | 坐 | zuò | đi |
| 8 | 开 | kāi | lái xe |
| 9 | 怎么 | zěnme | thế nào |
| 10 | 走 | zǒu | đi bộ |
| 11 | 路 | lù | đường |
| 12 | 远 | yuǎn | xa |
| 13 | 近 | jìn | gần |
| 14 | 快 | kuài | nhanh |
| 15 | 慢 | màn | chậm |
| 16 | 分钟 | fēnzhōng | phút |
| 17 | 小时 | xiǎoshí | tiếng |
| 18 | 到 | dào | đến |
| 19 | 从 | cóng | từ |
| 20 | 往 | wǎng | về phía |

---

**III. NGỮ PHÁP**

**1. 怎么 + V — Làm thế nào**
**2. 坐 + phương tiện**
**3. 从 A 到 B**
**4. 多长时间？**
**5. 远/近**

---

**IV. LUYỆN TẬP**

1. Bạn đi làm bằng gì? → ____
2. Từ nhà đến trường mất bao lâu? → ____`,
    },
    {
        title: "Bài 11: Thời tiết & Sức khỏe",
        words: [
            "天气",
            "冷",
            "热",
            "下雨",
            "晴天",
            "生病",
            "看病",
            "舒服",
            "疼",
            "头",
            "身体",
            "药",
            "休息",
            "累",
            "饿",
            "渴",
            "困",
        ],
        grammar: `**BÀI 11: THỜI TIẾT & SỨC KHỎE**

---

**I. HỘI THOẠI**

A: 今天天气怎么样？B: 很冷！
A: 会下雨吗？B: 不会，今天是晴天。
A: 你怎么了？B: 我不太舒服。
医生: 你哪儿不舒服？病人: 我头疼。

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 天气 | tiānqì | thời tiết |
| 2 | 冷 | lěng | lạnh |
| 3 | 热 | rè | nóng |
| 4 | 下雨 | xiàyǔ | mưa |
| 5 | 晴天 | qíngtiān | nắng |
| 6 | 生病 | shēngbìng | bị bệnh |
| 7 | 看病 | kànbìng | khám bệnh |
| 8 | 舒服 | shūfu | thoải mái |
| 9 | 疼 | téng | đau |
| 10 | 头 | tóu | đầu |
| 11 | 身体 | shēntǐ | cơ thể |
| 12 | 药 | yào | thuốc |
| 13 | 休息 | xiūxi | nghỉ ngơi |
| 14 | 累 | lèi | mệt |
| 15 | 饿 | è | đói |
| 16 | 渴 | kě | khát |
| 17 | 困 | kùn | buồn ngủ |

---

**III. NGỮ PHÁP**

**1. 天气怎么样？**
**2. Adj + 了:** 饿了, 渴了, 累了
**3. Bộ phận + 疼:** 头疼
**4. 有点儿 — Hơi**

---

**IV. LUYỆN TẬP**

1. Hôm nay thời tiết thế nào? → ____
2. Tôi hơi mệt. → ____
3. Tôi đau đầu. → ____`,
    },
    {
        title: "Bài 12: Mô tả & Màu sắc",
        words: [
            "大",
            "小",
            "多",
            "少",
            "高",
            "长",
            "短",
            "新",
            "旧",
            "漂亮",
            "好看",
            "白",
            "黑",
            "红",
            "蓝",
            "绿",
            "黄",
            "颜色",
            "衣服",
            "觉得",
            "最",
            "非常",
            "太",
        ],
        grammar: `**BÀI 12: MÔ TẢ & MÀU SẮC**

---

**I. HỘI THOẠI**

A: 你的家很大吗？B: 不大，很小。
A: 你喜欢什么颜色？B: 我喜欢蓝色。
A: 这件红色的衣服很好看！B: 对，很漂亮！
A: 这个新的比那个旧的好看。

---

**II. TỪ VỰNG**

| # | Tiếng Trung | Pinyin | Nghĩa |
|---|---|---|---|
| 1 | 大 | dà | to, lớn |
| 2 | 小 | xiǎo | nhỏ |
| 3 | 多 | duō | nhiều |
| 4 | 少 | shǎo | ít |
| 5 | 高 | gāo | cao |
| 6 | 长 | cháng | dài |
| 7 | 短 | duǎn | ngắn |
| 8 | 新 | xīn | mới |
| 9 | 旧 | jiù | cũ |
| 10 | 漂亮 | piàoliang | đẹp |
| 11 | 好看 | hǎokàn | đẹp |
| 12 | 白 | bái | trắng |
| 13 | 黑 | hēi | đen |
| 14 | 红 | hóng | đỏ |
| 15 | 蓝 | lán | xanh dương |
| 16 | 绿 | lǜ | xanh lá |
| 17 | 黄 | huáng | vàng |
| 18 | 颜色 | yánsè | màu sắc |
| 19 | 衣服 | yīfu | quần áo |
| 20 | 觉得 | juéde | cảm thấy |
| 21 | 最 | zuì | nhất |
| 22 | 非常 | fēicháng | vô cùng |
| 23 | 太 | tài | quá |

---

**III. NGỮ PHÁP**

**1. Tính từ đối lập:** 大↔小, 多↔少, 新↔旧
**2. Màu sắc:** Tên màu + 色
**3. Phó từ:** 太 > 非常 > 很 > 有点儿
**4. 比 — So sánh hơn**
**5. 最 — Nhất**

---

**IV. LUYỆN TẬP**

1. Nhà tôi rất nhỏ. → ____
2. Tôi thích màu xanh dương. → ____
3. Anh ấy cao hơn tôi. → ____`,
    },
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    const allVocab = await prisma.vocabulary.findMany({
        where: { hskLevel: { not: null, not: "" } },
        select: { id: true, hanSimplified: true, hanTraditional: true, jyutping: true },
    });

    const simpToVocab = new Map();
    for (const v of allVocab) {
        const key = (v.hanSimplified || v.hanTraditional || "").trim();
        if (!key) continue;
        const e = simpToVocab.get(key);
        if (!e || (!e.jyutping && v.jyutping)) simpToVocab.set(key, v);
    }

    const userId = "627b7e1d-d928-47ae-9bc1-ea90daf48ebe";
    const now = new Date().toISOString();

    for (const plan of LESSONS) {
        const ids = [],
            seen = new Set(),
            nf = [];
        for (const w of plan.words) {
            if (seen.has(w)) continue;
            const v = simpToVocab.get(w);
            if (v) {
                ids.push(v.id);
                seen.add(w);
            } else {
                nf.push(w);
            }
        }
        console.log(`${plan.title}: ${ids.length} unique${nf.length ? ", missing:" + nf.join(",") : ""}`);

        const gId = crypto
            .createHash("md5")
            .update(userId + "|" + plan.title + "|g")
            .digest("hex")
            .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
        await prisma.$executeRawUnsafe(
            `INSERT INTO grammars (id, user_id, title, content, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content=EXCLUDED.content, updated_at=EXCLUDED.updated_at`,
            gId,
            userId,
            plan.title + " — Ngữ pháp",
            plan.grammar,
            now,
            now,
        );

        const lId = crypto
            .createHash("md5")
            .update(userId + "|" + plan.title + "|l")
            .digest("hex")
            .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
        await prisma.$executeRawUnsafe(
            `INSERT INTO lessons (id, user_id, title, vocabulary_ids, grammar_ids, created_at, updated_at) VALUES ($1,$2,$3,$4::uuid[],$5::uuid[],$6,$7) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, vocabulary_ids=EXCLUDED.vocabulary_ids, grammar_ids=EXCLUDED.grammar_ids, updated_at=EXCLUDED.updated_at`,
            lId,
            userId,
            plan.title,
            `{${ids.join(",")}}`,
            `{${gId}}`,
            now,
            now,
        );
    }
    console.log("\n✅ 12 lessons done");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
