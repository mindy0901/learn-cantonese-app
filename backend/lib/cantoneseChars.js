/**
 * Ký tự THUẦN CANTONESE (2026-08-17) — dùng để:
 *  1. Chặn pinyin-pro đoán bừa (xem `toPinyin` trong lib/pinyin.js).
 *  2. Nhận diện từ pure Cantonese (xem lib/pureCantonese.js).
 *
 * Đây là các chữ gần như CHỈ dùng trong tiếng Quảng (Cantonese):
 *  - Chủ yếu là chữ vay phiên âm có bộ 口 (口字旁): 嘅 喺 咗 嚟 嘢 哋 啲 ...
 *  - Một số chữ đặc thù: 冇 氹 冧 瞓 掟 孭 扽 抌 捽 撳 罉 搵 攞 ...
 *  - Ký tự ngoài BMP (mở rộng B): 𠮶 𡁵 𡃁 ... (pinyin-pro vốn echo sẵn)
 *
 * ⚠️ LOẠI TRỪ các chữ có cách dùng Mandarin thực sự (dù hiếm):
 *  - 係 (xì: 關係/系統 — chữ Mandarin chuẩn), 焗 (jú: 鹽焗雞), 閂 (shuān: 門閂),
 *    𦉘?/罅 (xià: 罅隙), 揸 (zhā), 睇? (dì hiếm)... → KHÔNG đưa vào đây để tránh
 *    false positive với từ Mandarin dùng chung.
 */

export const CANTONESE_ONLY_CHARS = new Set([
    // ── Vowel-loan 口字旁 (phổ biến nhất trong văn viết Cantonese) ──
    "嘅", // ge3 — trợ từ sở hữu ("的")
    "喺", // hai2 — ở, tại ("在")
    "唔", // m4 — không ("不")
    "咗", // zo2 — trợ từ hoàn thành ("了")
    "嚟", // lai4 — đến, lại ("來")
    "嘢", // je5 — đồ vật ("東西")
    "哋", // dei6 — hậu tố số nhiều ("們")
    "啲", // di1 — một chút, những ("些")
    "乜", // mat1 — gì ("什麼")
    "㗎", // gaa3 — trợ từ câu hỏi/nhấn mạnh
    "嗰", // go2 — cái kia ("那")
    "咩", // me1 — trợ từ câu hỏi ("嗎")
    "啖", // daam6 — ngụm, miếng ("口" dùng cho ăn/uống)
    "啱", // ngaam1 — đúng, vừa khớp ("對")
    "咁", // gam3 — như vậy ("這樣")
    "冇", // mou5 — không có ("沒有")
    "咩", // (trùng) — trợ từ
    // ── Chữ Cantonese đặc thù ──
    "氹", // tam5 — dỗ, dụ ("哄"); cũng "cái ao"
    "冧", // lam3 — sụp đổ; thích ("冧你")
    "瞓", // fan3 — ngủ ("睡")
    "掟", // deng6 — ném ("扔")
    "孭", // me1 — đeo, mang ("背")
    "扽", // dan3 — giật mạnh, kéo mạnh
    "抌", // dam2 — ném
    "捽", // cyut1 — xoa, chà ("搓")
    "撳", // gam6 — nhấn, bấm ("按")
    "罉", // cang1 — cái nồi, chảo
    "搵", // wan2 — tìm ("找")
    "攞", // lo2 — lấy, lấy ("拿")
    "揾", // wan2 — tìm (biến thể 搵)
    "睇", // tai2 — xem, nhìn ("看")
    "咡",
    "喐", // juk1 — động đậy ("動")
    "嘅", // (trùng)
    "咘",
    "咇",
    "咈", // (misc 口 loans)
    // ── Ký tự ngoài BMP (mở rộng B) — Cantonese HK ──
    "𠮶", // go2 — cái kia ("那")
    "𡁵", // faa3? — từ cảm thán
    "𡃁", // leng1? — từ xưng hô
    "𡃶", // 親昵
    "𡁶", //
    "𡃀", //
    "𠺘", // lam2? —
]);

/** True khi chữ Hán đó thuộc danh sách thuần Cantonese. */
export function isCantoneseOnlyChar(ch) {
    return CANTONESE_ONLY_CHARS.has(ch);
}

/** True khi chuỗi chứa ÍT NHẤT 1 ký tự thuần Cantonese. */
export function containsCantoneseOnlyChar(text) {
    if (!text) return false;
    for (const ch of String(text)) {
        if (CANTONESE_ONLY_CHARS.has(ch)) return true;
    }
    return false;
}

/**
 * Từ (CỤM) THUẦN CANTONESE — mọi ký tự đều là chữ Mandarin bình thường, nhưng
 * CỤM TỪ chỉ dùng trong Cantonese (thường KHÔNG có trong CEDICT, hoặc CEDICT
 * không đánh dấu) → blocklist riêng theo cụm từ (gồm cả giản/phồn).
 *
 * ⚠️ Mở rộng 2026-08-17 (AI curation ~220 từ): các cụm từ khẳng định PURE sau khi
 * quét toàn data (HK form ∉ CEDICT/CVDICT + không phải từ Mandarin). Dạng HK
 * (phồn thể) — cột Cantonese luôn có, detect check cả simp+hk nên đủ.
 */
export const CANTONESE_ONLY_WORDS = new Set([
    // ── Từ cơ bản đã có (2026-08-17) ──
    "一於",
    "一于", // jat1 jyu1 — "thà cứ / cứ việc..." (Mandarin: 干脆)
    "點解",
    "点解", // dim2 gaai2 — "tại sao" (Mandarin: 為什麼)
    "邊度",
    "边度", // bin1 dou6 — "ở đâu" (Mandarin: 哪裡)
    "而家", // ji4 gaa1 — "bây giờ" (Mandarin: 現在)
    "第時",
    "第时", // dai6 si4 — "lúc khác / sau này" (Mandarin: 以後)

    // ── Nhóm 係 (hai6) — 係 là trợ động từ "là", chỉ dùng trong viết Cantonese ──
    "但系",
    "即系",
    "即系話",
    "淨系",
    "只系",
    "定系",
    "實系",
    "梗系",
    "真系",
    "硬系",
    "確係",
    "都系",
    "總系",
    "單系",
    "又係",
    "仲系",
    "好似系",
    "就係",
    "尤其系",
    "系咪",
    "系呀",
    "系呢",
    "系噉",
    "系都",
    "系領帶",
    "系人都",

    // ── Nhóm 呢 (nei1) "này/đây" ──
    "呢個",
    "呢度",
    "呢次",
    "呢邊",

    // ── Nhóm 諗 (nam2) "nghĩ" ──
    "諗住",
    "諗法",
    "諗起",
    "諗返",

    // ── Nhóm 食 (sik6) "ăn" ──
    "食飯",
    "食煙",
    "食屎",
    "好食",

    // ── Nhóm 返 (faan1) "về/quay" ──
    "返去",
    "返學",
    "返屋企",
    "返轉頭",

    // ── Nhóm 埋 (maai4) ──
    "加埋",
    "同埋",
    "收埋",
    "行埋",
    "夾埋",
    "埋去",

    // ── Nhóm 講 (gong2) ──
    "講下",
    "講真",
    "講笑",
    "講緊",
    "講故",
    "老實講",

    // ── Nhóm 點 (dim2) "làm sao" ──
    "點先",
    "點呀",
    "點樣",
    "點知",
    "點算",
    "點都",

    // ── Nhóm 好 (hou2) ──
    "好多時",
    "好少",
    "好彩",
    "好耐",
    "好鬼",

    // ── Nhóm 幾 (gei2) ──
    "幾多人",
    "幾大",
    "幾好",
    "幾廿",
    "幾耐",

    // ── Nhóm 咪 (mai5/6) ──
    "咪住",
    "咪又",
    "咪又系",
    "咪就係",
    "咪話",

    // ── Nhóm 仔/女 ──
    "仔女",
    "女仔",
    "男仔",
    "後生仔",
    "肥仔",
    "阿仔",
    "細佬",

    // ── Nhóm 俾/畀 (bei2) "cho/bị" ──
    "俾人",
    "俾錢",
    "畀人",
    "畀錢",

    // ── Nhóm 都 (dou1) ──
    "都叫",
    "都大",
    "都好",
    "都系",

    // ── Nhóm 有 ──
    "有得",
    "有排",

    // ── Nhóm 又 ──
    "又再",
    "又話",

    // ── Nhóm 仲 (zung6) ──
    "仲有",
    "仲要",

    // ── Nhóm 就 (zau6) ──
    "就快",
    "就真",
    "就話",

    // ── Nhóm 行 (haang4) "đi" ──
    "行山",
    "行開",

    // ── Nhóm 系人/口語 ──
    "份人",
    "人話",
    "今鋪",
    "令到",
    "停低",
    "先至",
    "入去",
    "入面",
    "坐低",
    "夠膽",
    "大大力",
    "大把",
    "大鑊",
    "失驚無神",
    "夾硬",
    "出街",
    "傾偈",
    "傾計",
    "差人",
    "差佬",
    "影相",
    "心諗",
    "打機",
    "打畀",
    "把口",
    "揼",
    "搞到",
    "搞掂",
    "故仔",
    "無啦啦",
    "最尾",
    "朝早",
    "條友",
    "極之",
    "樣衰",
    "核突",
    "死都",
    "求其",
    "港女",
    "然之後",
    "照計",
    "特登",
    "甚至乎",
    "生仔",
    "生果",
    "由得",
    "留低",
    "痴線",
    "的而且確",
    "直頭",
    "離地",
    "算啦",
    "粵文",
    "細個",
    "細聲",
    "細路",
    "結他",
    "老竇",
    "老細",
    "老豆",
    "耳仔",
    "肚餓",
    "膊頭",
    "茶餐廳",
    "落去",
    "見工",
    "話曬",
    "識到",
    "試嚇",
    "試過",
    "跟住",
    "邊個",
    "邊會",
    "醒起",
    "鍾意",
    "銀包",
    "閪",
    "間中",
    "間房",
    "阿叔",
    "阿頭",
    "隨住",
    "面書",
    "追po",
    "手提電話",
    "嫲嫲",
    "屋企人",
    "你老母",
    "屌你老母",
    "戇鳩",
    "一次過",
    "不嬲",
    "專登",
    "個鐘",
    "為之",
    "之但系",
    "些少",
    "亦都",
    "冚",
    "千祈",
    "去飲",
    "隻手",
    "後尾",
    "吖嘛",
    "聽日",
    "聽過",
    "呀嘛",
    "咋嘛",
    "啩",
    "嗱",
    "噉樣",
    "多得",
    "家先",
    "尋日",
    "尋晚",
    "少少",
]);
