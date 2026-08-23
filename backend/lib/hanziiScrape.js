import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import { pinyin as pinyinPro } from "pinyin-pro";
import { buildMergedSinoVietnameseMap } from "./sinoVietnamesesMap.js";
import { applyThirdToneSandhi } from "./pinyin.js";
import { normalizeRomanizationPunctuation } from "./wordNormalize.js";
import { normalizeSinoVietnameseValue } from "./sinoVietnameseReadings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

// Hanzii chỉ serve đầy đủ SSR content cho bot SEO (Googlebot). Với UA browser thường
// bị Cloudflare trả về shell 21KB (không có div kind_ / ng-state).
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

// Lazy cache map Hán→Hán-Việt (đọc 1 lần từ backend/data/sino-vietnamese.json).
let mergedSvMap = null;
function getSvMap() {
    if (!mergedSvMap) mergedSvMap = buildMergedSinoVietnameseMap().map;
    return mergedSvMap;
}

/** Tính Hán-Việt cho cả từ (ghép từng ký tự theo map, cách nhau 1 space) — VD "一" → "NHẤT". */
function wordSinoVietnamese(word) {
    const map = getSvMap();
    const parts = [];
    for (const ch of String(word ?? "")) {
        parts.push(map.get(ch)?.value ?? "");
    }
    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    return joined || undefined;
}

/**
 * Hán-Việt TOÀN TỪ: lấy từ DOM hero `.line-word .txt-cn_vi` của Hanzii (VD "[ dụng lai ]"
 * → "DỤNG LAI") — Hanzii trả theo NGỮ CẢNH của từ ghép nên chính xác hơn map per-char.
 * ⚠️ 2026-08-23: KHÔNG dùng map `sino-vietnamese.json` ở đây (map outdated & thiếu chính
 * xác). Map chỉ là fill fallback CUỐI khi Hanzii hoàn toàn không có entry (nhánh
 * `!dom?.groups?.length` bên dưới).
 */
function wholeWordSino($, word) {
    const heroText = $(".line-word .txt-cn_vi").first().text().replace(/\s+/g, " ").trim();
    const stripped = heroText
        .replace(/^\s*\[+\s*/, "")
        .replace(/\s*\]+\s*$/, "")
        .trim();
    const heroSino = stripped ? normalizeSinoVietnameseValue(stripped) || "" : "";
    // ⚠️ 2026-08-23: CHỈ lấy Hán-Việt từ HANZII (hero cn_vi) — Hanzii trả theo NGỮ CẢNH
    // của từ ghép (VD 朝早 → "TRIỀU TẢO" đúng). KHÔNG fallback map `sino-vietnamese.json`
    // ở đây — map đã outdated & thiếu chính xác nhiều, chỉ được dùng làm fill fallback
    // CUỐI khi Hanzii hoàn toàn không có entry (nhánh `!dom?.groups?.length` bên dưới).
    return heroSino || undefined;
}

// Lazy cache Converter OpenCC (cn → t) — dùng để tái tạo phồn thể cho ví dụ (state
// chỉ chứa giản thể).
let toTradConverter = null;
async function getToTrad() {
    if (!toTradConverter) {
        const { Converter } = await import("opencc-js");
        toTradConverter = Converter({ from: "cn", to: "t" });
    }
    return toTradConverter;
}

/** "giản" → "giản【phồn】" (giống format DOM cũ, để frontend split giữ cả 2 form). */
async function withTraditional(simp) {
    const s = String(simp ?? "").trim();
    if (!s) return s;
    const toTrad = await getToTrad();
    const trad = toTrad(s);
    return trad && trad !== s ? `${s}【${trad}】` : s;
}

/**
 * Convert hanzi (giản thể) → pinyin CHUẨN bằng pinyin-pro (lowercase, tone marks,
 * space-separated) — dùng cho VÍ DỤ (example). Không tin pinyin Hanzii vì hay bị
 * lỗi split (VD capitalize chữ đầu → "Xué" thành "X u é"). Giữ dấu câu cuối câu.
 * `toneSandhi: true` (LUÔN) — biến âm chuẩn (VD "yí miàn" thay vì "yī miàn").
 *
 * ⚠️ Chuẩn hóa dấu câu Hán → ASCII qua `normalizeRomanizationPunctuation` (GIỐNG
 * `toPinyin` trong lib/pinyin.js): "，"/"、"/"。" giữa câu → ","/"." (VD "工业上，..."
 * → "gōng yè shàng, ..." chứ KHÔNG "gōng yè shàng ， ..."). (2026-08-21)
 */
function hanToPinyin(hanzi) {
    const h = String(hanzi ?? "").trim();
    if (!h) return "";
    // Tách dấu câu cuối để giữ dính vào câu, NHƯNG quy về dấu ASCII (pinyin dùng "."
    // không phải "。" của Hán tự — VD "xué xiào ... jǐn qí.").
    const pm = h.match(/^(.*?)([.,!?。！？;；:：…]+)$/);
    const core = pm ? pm[1] : h;
    const tail = pm
        ? pm[2]
              .replace(/。/g, ".")
              .replace(/！/g, "!")
              .replace(/？/g, "?")
              .replace(/；/g, ";")
              .replace(/：/g, ":")
              .replace(/…/g, "...")
        : "";
    const converted = pinyinPro(core, { toneType: "symbol", type: "string", toneSandhi: true });
    if (!converted) return h;
    // 三声变调 (3+3 → 2+3) — pinyin-pro toneSandhi không xử lý. (2026-08-23)
    return normalizeRomanizationPunctuation(applyThirdToneSandhi(converted)) + tail;
}

/** Chuẩn hóa pinyin để so khớp (bỏ khoảng trắng, lowercase, GIỮ thanh điệu). */
function normPinyin(s) {
    return String(s ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
}

/**
 * Chuyển giá trị cấp độ HSK của Hanzii (lv_hsk_new) → định dạng app ("HSK 6").
 * "6" → "HSK 6"; "7-9" → "HSK 7-9"; rỗng → undefined. (2026-08-22)
 */
function hskLevelFrom(v) {
    const s = String(v ?? "").trim();
    if (!s) return undefined;
    const range = s.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
    if (range) return `HSK ${range[1]}-${range[2]}`;
    const n = s.match(/\d+/)?.[0];
    if (!n) return undefined;
    return `HSK ${n}`;
}

// Mã kind = TỪ LOẠI (parts of speech) mà Hanzii dùng trong content/detailWord. Các nhóm
// KHÔNG phải từ loại (Lưu ý, góp ý, hình ảnh, độ phổ biến...) có kind = tên tiếng Việt
// (VD "Lưu ý" — có dấu + khoảng trắng) → tự loại bằng isPosKind().
const POS_KINDS = new Set([
    "n",
    "v",
    "adj",
    "adv",
    "pron",
    "pro",
    "num",
    "numb",
    "part",
    "prep",
    "conj",
    "int",
    "interj",
    "ono",
    "aux",
    "clf",
    "m",
    "mw",
    "idm",
    "phr",
    "p",
    "pref",
    "suff",
    "det",
    "dem",
    "rel",
    "quant",
    "punc",
    "proverb",
    "abbr",
    "name",
]);
const NON_POS_KINDS = new Set([
    "note",
    "comment",
    "img",
    "image",
    "images",
    "popularity",
    "pop",
    "syn",
    "synonym",
    "anto",
    "antonym",
    "feedback",
    "contribute",
    "reading",
    "pronunciation",
    "usage",
]);

// Mã từ loại → tên tiếng Việt (fallback khi DOM không lấy được .box-title — tránh trả
// code thô như "intj" thay vì "Thán từ").
const POS_LABELS = {
    n: "Danh từ",
    v: "Động từ",
    adj: "Tính từ",
    adv: "Phó từ",
    pron: "Đại từ",
    pro: "Đại từ",
    num: "Số từ",
    numb: "Số từ",
    part: "Trợ từ",
    prep: "Giới từ",
    conj: "Liên từ",
    int: "Thán từ",
    interj: "Thán từ",
    intj: "Thán từ",
    ono: "Từ tượng thanh",
    aux: "Trợ động từ",
    clf: "Lượng từ",
    m: "Lượng từ",
    mw: "Lượng từ",
    idm: "Thành ngữ",
    phr: "Cụm từ",
    p: "Tiểu từ",
    pref: "Tiền tố",
    suff: "Hậu tố",
    det: "Định từ",
    dem: "Đại từ chỉ định",
    rel: "Đại từ quan hệ",
    quant: "Từ chỉ lượng",
    punc: "Dấu câu",
    proverb: "Tục ngữ",
    abbr: "Viết tắt",
    name: "Danh từ riêng",
};
function posLabel(kind) {
    const k = String(kind ?? "").trim();
    if (!k) return "";
    // Multi-POS: Hanzii gộp nhiều từ loại vào 1 kind (VD "n, intj" = Danh từ + Thán từ)
    // → map từng token rồi nối ", ". (2026-08-21)
    const tokens = k.split(/[\s,/、]+/).filter(Boolean);
    if (tokens.length > 1) return tokens.map((tk) => POS_LABELS[tk.toLowerCase()] || tk).join(", ");
    return POS_LABELS[k.toLowerCase()] || "";
}

/**
 * Nhóm có phải TỪ LOẠI không — POS code = token ASCII lowercase đơn (n, adv, numb...).
 * Hỗ trợ kind GỘP nhiều từ loại (VD "n, intj" = Danh từ + Thán từ) — mỗi token đều
 * phải là POS hợp lệ, và không token nào thuộc NON_POS. (2026-08-21)
 */
function isPosKind(kind) {
    const k = String(kind ?? "").trim();
    if (!k) return false;
    if (POS_KINDS.has(k)) return true;
    if (NON_POS_KINDS.has(k)) return false;
    const tokens = k.split(/[\s,/、]+/).filter(Boolean);
    if (tokens.length > 1) {
        return tokens.every((tk) => {
            if (NON_POS_KINDS.has(tk)) return false;
            if (POS_KINDS.has(tk)) return true;
            return /^[a-z]+$/.test(tk);
        });
    }
    // Heuristic: mã POS thuần ASCII (không dấu, không space) → coi là từ loại.
    // Nhóm không phải POS (VD "Lưu ý", "góp ý", "hình ảnh") có dấu tiếng Việt / space → loại.
    return /^[a-z]+$/.test(k);
}

/** Chuyển "yi1" → "yī" (tone số → thanh điệu) để khớp với pinyin của Hanzii. */
function toneNumberToMark(s) {
    const marks = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", ü: "ǖǘǚǜ" };
    const tone = Number(String(s ?? "").match(/[1-5]/)?.[0]) || 0;
    if (!tone) return String(s ?? "").toLowerCase();
    let result = String(s ?? "").replace(/[1-5]/g, "");
    const v = result.match(/[aoeiuvü]/i)?.[0];
    if (v && marks[v.toLowerCase()]) {
        result = result.replace(v, marks[v.toLowerCase()][tone - 1] || v);
    }
    return result.toLowerCase();
}

/** Bỏ dấu thanh điệu khỏi pinyin — "gè" → "ge", "yǚ" → "yu". */
function stripToneMarks(s) {
    return String(s ?? "")
        .replace(/[āáǎà]/g, "a")
        .replace(/[ēéěè]/g, "e")
        .replace(/[īíǐì]/g, "i")
        .replace(/[ōóǒò]/g, "o")
        .replace(/[ūúǔù]/g, "u")
        .replace(/[ǖǘǚǜ]/g, "ü");
}

// Lazy cache 2 set âm tiết pinyin (build từ backend/data/_hanviet-pinyin.csv — Unihan kHanyuPinyin).
let pinyinSyllablesCache = null;
function getPinyinSyllables() {
    if (pinyinSyllablesCache) return pinyinSyllablesCache;
    const marked = new Set();
    const base = new Set();
    const text = readFileSync(resolve(DATA_DIR, "_hanviet-pinyin.csv"), "utf-8");
    const lines = text.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const py = line.split(",").pop(); // cột cuối = pinyin (tone number, VD shang3)
        if (!py) continue;
        for (const p of py.split(/[\s,/、]+/).filter(Boolean)) {
            const markedForm = toneNumberToMark(p);
            marked.add(markedForm);
            base.add(stripToneMarks(markedForm));
        }
    }
    // ⚠️ Bổ sung âm tiết thiếu trong CSV (Unihan kHanyuPinyin không liệt kê hết) — VD 嗲=diǎ.
    // Thiếu → splitPinyinSyllables greedy match sai ("diǎ" → "di ǎ"). (2026-08-21)
    const EXTRA = ["dia", "dia3", "dia1", "dia2", "dia4", "diu", "diu1", "diu2", "diu3", "diu4", "diu5"];
    for (const p of EXTRA) {
        const markedForm = toneNumberToMark(p);
        marked.add(markedForm);
        base.add(stripToneMarks(markedForm));
    }
    pinyinSyllablesCache = { marked, base };
    return pinyinSyllablesCache;
}

/**
 * Tách pinyin merged thành từng âm tiết cách nhau space — VD "gègè" → "gè gè",
 * "péngyou" → "péng you", "wénhuà" → "wén huà". Tìm phân đoạn PHỦ HẾT token bằng các
 * âm tiết hợp lệ với SỐ PHẦN TỬ ÍT NHẤT (DP, tie-break longest-first), fallback greedy
 * longest-match khi không cover được toàn bộ token (giữ thanh nhẹ qua base set).
 *
 * Vì sao KHÔNG greedy thuần: "fǎngōng" (返工 = fǎn gōng) greedy longest-match khớp "fǎng"
 * (âm tiết hợp lệ) trước → sai thành "fǎng ō n g". DP ít phần tử nhất → "fǎn gōng". (2026-08-21)
 * Giữ đúng thanh điệu Hanzii cung cấp.
 */
function segmentPinyinToken(token, marked, base) {
    const n = token.length;
    const memo = new Map(); // pos → best segmentation (array) | null
    const isSyllable = (cand) => marked.has(cand) || base.has(stripToneMarks(cand));
    function rec(pos) {
        if (pos === n) return [];
        if (memo.has(pos)) return memo.get(pos);
        let best = null;
        let bestParts = Infinity;
        // Duyệt j từ dài → ngắn: trong các phân đoạn cùng số phần tử, ưu âm tiết đầu dài hơn.
        for (let j = Math.min(6, n - pos); j >= 1; j--) {
            const cand = token.slice(pos, pos + j);
            if (!isSyllable(cand)) continue;
            const rest = rec(pos + j);
            if (rest === null) continue;
            const parts = 1 + rest.length;
            if (parts < bestParts) {
                bestParts = parts;
                best = [cand, ...rest];
            }
        }
        memo.set(pos, best);
        return best;
    }
    return rec(0);
}

/** Greedy longest-match cũ — fallback khi không phân đoạn phủ hết được (ký tự lẻ). */
function greedySegmentPinyinToken(token, marked, base) {
    const parts = [];
    let i = 0;
    while (i < token.length) {
        let matched = null;
        for (let j = Math.min(6, token.length - i); j >= 1; j--) {
            const cand = token.slice(i, i + j);
            if (marked.has(cand) || base.has(stripToneMarks(cand))) {
                matched = cand;
                break;
            }
        }
        if (!matched) matched = token[i]; // fallback: ký tự lẻ (rất hiếm)
        parts.push(matched);
        i += matched.length;
    }
    return parts;
}

function splitPinyinSyllables(pinyin) {
    const { marked, base } = getPinyinSyllables();
    const out = [];
    for (const raw of String(pinyin ?? "")
        .split(/[\s,/、'’]+/)
        .filter(Boolean)) {
        // Tách dấu câu cuối để giữ dính vào âm tiết cuối (VD "wénhuà." → "wén huà.").
        const pm = raw.match(/^(.*?)([.,!?。！？;；:：…]+)$/);
        // ⚠️ LUÔN lowercase token trước khi greedy match — set âm tiết (marked/base) chỉ chứa
        // lowercase. Hanzii capitalize chữ đầu câu ("Xué xiào...") → nếu không lowercase, "Xué"
        // không khớp marked/base → fallback từng ký tự → sai "X u é xiào..." (lỗi pinyin split).
        const token = (pm ? pm[1] : raw).toLowerCase();
        const tail = pm ? pm[2] : "";
        let parts = segmentPinyinToken(token, marked, base);
        if (!parts) parts = greedySegmentPinyinToken(token, marked, base);
        if (tail && parts.length) parts[parts.length - 1] += tail;
        out.push(parts.join(" "));
    }
    return out.join(" ");
}

/**
 * Parse Angular TransferState (`<script id="ng-state" type="application/json">`).
 * Chứa TOÀN BỘ dữ liệu từ dạng JSON thuần — kể cả tất cả ví dụ của phần "Xem thêm"
 * (DOM SSR chỉ render 1 ví dụ/meaning).
 *
 * `detailWord.content` = array các nhóm TỪ LOẠI (VD 一: numb=Số từ, adv=Phó từ,
 * n=Danh từ, part=Trợ từ, v=Động từ, adj=Tính từ...). Nhóm không phải từ loại
 * (góp ý, hình ảnh, độ phổ biến...) KHÔNG nằm trong content → tự loại.
 * Mỗi nhóm: { kind, means: [{ mean (nghĩa Việt), explain (gloss zh), lv_hsk,
 *   examples: [{ e (giản), p (pinyin), m (nghĩa Việt), ... }] }], structs }.
 */
/** Chuyển 1 entry (detailWord hoặc 1 phần tử searchResult) thành groups [{kind, meanings}]. */
async function groupsFromDw(dw) {
    if (!dw?.content?.length) return null;
    const groups = [];
    for (const content of dw.content) {
        // Nhóm KHÔNG phải từ loại (Lưu ý, góp ý, hình ảnh...) → bỏ. Nhưng nếu kind rỗng/null
        // MÀ vẫn có `means` hợp lệ (Hanzii để kind null cho 1 số từ, VD 一千 → mean "một nghìn")
        // thì VẪN lấy — vì nhóm không phải POS (Lưu ý/góp ý...) nằm ở structs, không phải means.
        if (content.kind && !isPosKind(content.kind)) continue;
        if (!content?.means?.length) continue; // bỏ nhóm không có format meaning (structs...)
        const meanings = [];
        for (const mn of content.means ?? []) {
            const vi = String(mn?.mean ?? "").trim();
            const zh = String(mn?.explain ?? "").trim();
            const examples = [];
            for (const ex of mn?.examples ?? []) {
                const e = String(ex?.e ?? "").trim();
                const p = String(ex?.p ?? "").trim();
                const m = String(ex?.m ?? "").trim();
                if (!e && !p && !m) continue;
                // ⚠️ Pinyin của VÍ DỤ dùng pinyin-pro convert từ hanzi giản thể (không tin
                // pinyin Hanzii — hay lỗi split, VD "Xué" → "X u é"). Giữ dấu câu cuối.
                examples.push({ zh: await withTraditional(e), pinyin: hanToPinyin(e), vi: m });
            }
            if (vi || zh || examples.length) meanings.push({ vi, zh, examples });
        }
        if (meanings.length) groups.push({ kind: content.kind ?? "", meanings });
    }
    return groups.length ? groups : null;
}

/**
 * Trích từ ghép / đồng nghĩa / trái nghĩa từ 1 entry ng-state (detailWord/searchResult).
 * - compound: string "校长;成长;..." (hoặc cvCompound array)
 * - snym.syno / snym.anto: array từ đồng nghĩa / trái nghĩa (2026-08-22)
 * ⚠️ 2026-08-22: CHỈ lấy hanzi (string) — KHÔNG kèm sino. Sino tự lấy từ data app khi hiển thị.
 */
function relatedFromDw(dw) {
    if (!dw) return undefined;
    const split = (v) => {
        if (Array.isArray(v)) return v.map((s) => String(s ?? "").trim()).filter(Boolean);
        return String(v ?? "")
            .split(/[;；,，、]/)
            .map((s) => s.trim())
            .filter(Boolean);
    };
    const compound = split(dw.compound ?? dw.cvCompound);
    const synonyms = Array.isArray(dw.snym?.syno)
        ? dw.snym.syno.map((s) => String(s ?? "").trim()).filter(Boolean)
        : [];
    const antonyms = Array.isArray(dw.snym?.anto)
        ? dw.snym.anto.map((s) => String(s ?? "").trim()).filter(Boolean)
        : [];
    if (!compound.length && !synonyms.length && !antonyms.length) return undefined;
    return { compound, synonyms, antonyms };
}

async function extractFromState(state, pinyin) {
    const key = Object.keys(state).find((k) => k.includes("word_search_") && state[k]?.detailWord);
    const root = key ? state[key] : null;
    if (!root?.detailWord) return null;

    // KHÔNG truyền pinyin → trả TOÀN BỘ tone trong searchResult (mỗi tone có meanings
    // RIÊNG — VD 一: [0]=yī đầy đủ, [1]=yì, [2]=yí). Để frontend fill phiên âm còn thiếu.
    if (!pinyin && Array.isArray(root.searchResult)) {
        const tones = [];
        for (const it of root.searchResult) {
            const p = String(it?.pinyin ?? "").trim();
            if (!p) continue;
            const groups = await groupsFromDw(it);
            if (!groups) continue;
            // Pinyin tone merged theo từ (VD "gègè") → split từng âm tiết ("gè gè").
            // ⚠️ Hán-Việt + HSK RIÊNG theo từng tone từ Hanzii (cn_vi / lv_hsk_new) — VD 長:
            // zhǎng→TRƯỞNG/HSK 6, cháng→TRƯỜNG/HSK 2. (2026-08-22)
            tones.push({
                pinyin: splitPinyinSyllables(p),
                sinoVietnamese: normalizeSinoVietnameseValue(it?.cn_vi) || undefined,
                hskLevel: hskLevelFrom(it?.lv_hsk_new),
                related: relatedFromDw(it),
                groups,
            });
        }
        return tones.length ? { tones, related: relatedFromDw(root.detailWord) } : null;
    }

    // Có pinyin → chọn 1 entry theo phiên âm (fallback detailWord mặc định).
    let dw = root.detailWord;
    if (pinyin && Array.isArray(root.searchResult)) {
        const req = normPinyin(toneNumberToMark(pinyin));
        const match = root.searchResult.find((it) => it?.pinyin && normPinyin(it.pinyin) === req);
        if (match) dw = match;
    }
    const groups = await groupsFromDw(dw);
    if (!groups) return null;
    return {
        groups,
        // Hán-Việt + HSK của tone được chọn (VD 長 với pinyin=cháng → TRƯỜNG / HSK 2).
        sinoVietnamese: normalizeSinoVietnameseValue(dw?.cn_vi) || undefined,
        hskLevel: hskLevelFrom(dw?.lv_hsk_new),
        related: relatedFromDw(dw),
    };
}

/** Fallback DOM parse — mỗi nhóm từ loại chỉ 1 ví dụ/meaning (khi không có ng-state). */
function parseDom($) {
    const groups = [];
    $("div[id^='kind_']").each((_, el) => {
        const $kind = $(el);
        // Lấy mã kind từ id (VD "kind_n" → "n", "kind_Lưu ý" → "Lưu ý") để lọc POS.
        const kind = ($kind.attr("id") || "").replace(/^kind_/, "");
        if (!isPosKind(kind)) return; // bỏ nhóm không phải từ loại
        const title = $kind.find(".box-title").first().text().trim() || posLabel(kind) || kind;
        const meanings = [];
        $kind.find("div.content-item").each((_, itemEl) => {
            const $item = $(itemEl);
            const vi = $item.find(".txt-mean").first().text().replace(/\s+/g, " ").trim();
            const zh = $item.find(".txt-mean-explain").first().text().replace(/\s+/g, " ").trim();
            const examples = [];
            $item.find("example").each((_, exEl) => {
                const $ex = $(exEl);
                const exZh = $ex.find(".simple-tradition-wrap").first().text().replace(/\s+/g, " ").trim();
                const pinyin = $ex.find(".txt-pinyin").first().text().replace(/\s+/g, " ").trim();
                const exVi = $ex.find(".font-16.fw-400.cl-pr-sm").first().text().replace(/\s+/g, " ").trim();
                if (exZh || pinyin || exVi) examples.push({ zh: exZh, pinyin, vi: exVi });
            });
            if (vi || zh || examples.length) meanings.push({ vi, zh, examples });
        });
        if (meanings.length) groups.push({ title, meanings });
    });
    // Cấp độ HSK từ DOM (VD badge "HSK 6" trong .word-level/.level-kind) — fallback DOM. (2026-08-22)
    const hskText =
        $(".word-level .tags.tag-red").first().text().trim() || $(".level-kind .tags").first().text().trim();
    return groups.length ? { groups, hskLevel: hskLevelFrom(hskText) } : null;
}

/**
 * Fetch Hanzii với retry cho lỗi tạm thời (5xx / network) — Hanzii hay trả 502/429
 * (Cloudflare rate-limit) khi scrape liên tục. 4xx không retry.
 */
async function fetchHanzii(url, headers, retries = 2) {
    for (let attempt = 0; ; attempt++) {
        let res;
        try {
            res = await fetch(url, { headers });
        } catch (err) {
            if (attempt >= retries - 1) throw err;
            await new Promise((r) => setTimeout(r, 800));
            continue;
        }
        if (res.ok) return res;
        if (res.status < 500 || attempt >= retries - 1) {
            throw new Error(`Hanzii HTTP ${res.status}`);
        }
        await new Promise((r) => setTimeout(r, 800));
    }
}

/**
 * Scrape nghĩa từ vựng từ Hanzii — TẤT CẢ nhóm TỪ LOẠI (Danh từ, Động từ, Tính từ,
 * Trợ từ, Phó từ, Số từ...). Bỏ nhóm không phải từ loại / không có format meaning.
 *
 * Ưu tiên đọc Angular TransferState (script#ng-state) → có TOÀN BỘ meanings +
 * tất cả ví dụ (kể cả phần "Xem thêm"). Tên từng nhóm lấy từ DOM .box-title theo kind.
 */
export async function fetchHanziiMeanings(query, { hl = "vi", pinyin } = {}) {
    const word = String(query ?? "").trim();
    if (!word) return null;

    const url = `https://hanzii.net/search/word/${encodeURIComponent(word)}?hl=${encodeURIComponent(hl)}`;
    const res = await fetchHanzii(url, { "User-Agent": UA, "Accept-Language": hl });
    const html = await res.text();

    // Map kind code → tên nhóm hiển thị từ DOM (VD kind_adv → "Phó từ").
    const $ = cheerio.load(html);
    const titleByKind = {};
    $("div[id^='kind_']").each((_, el) => {
        const code = ($(el).attr("id") || "").replace(/^kind_/, "");
        titleByKind[code] = $(el).find(".box-title").first().text().trim();
    });

    // Dữ liệu đầy đủ từ ng-state (ưu tiên).
    const ng = html.match(/<script[^>]*id="ng-state"[^>]*>([\s\S]*?)<\/script>/);
    if (ng) {
        try {
            const data = await extractFromState(JSON.parse(ng[1]), pinyin);
            // Toàn bộ tone (KHÔNG truyền pinyin).
            if (data?.tones?.length) {
                const tones = data.tones.map((t) => ({
                    pinyin: t.pinyin,
                    sinoVietnamese: t.sinoVietnamese,
                    hskLevel: t.hskLevel,
                    // Related RIÊNG theo từng tone (ng-state ĐẦY ĐỦ — kể cả phần "Xem thêm"/"Mở khóa").
                    // CHỈ hanzi (string) — sino tự lấy từ data app khi hiển thị. (2026-08-22)
                    related: t.related,
                    groups: t.groups.map((g) => ({
                        title: titleByKind[g.kind] || posLabel(g.kind) || g.kind,
                        meanings: g.meanings,
                    })),
                }));
                // Map related theo pinyin → đổi reading (romanization) là đổi từ ghép/đồng nghĩa/trái nghĩa.
                const relatedByTone = {};
                for (const t of tones) {
                    if (t.pinyin && t.related) relatedByTone[t.pinyin] = t.related;
                }
                return {
                    word,
                    sinoVietnamese: wholeWordSino($, word),
                    relatedWords: Object.keys(relatedByTone).length ? relatedByTone : data.related,
                    tones,
                };
            }
            // 1 tone (có pinyin).
            if (data?.groups?.length) {
                const groups = data.groups.map((g) => ({
                    title: titleByKind[g.kind] || posLabel(g.kind) || g.kind,
                    meanings: g.meanings,
                }));
                return {
                    word,
                    sinoVietnamese: data.sinoVietnamese || wholeWordSino($, word),
                    hskLevel: data.hskLevel,
                    relatedWords: data.related,
                    groups,
                };
            }
        } catch (err) {
            console.error("hanzii ng-state parse error:", err.message);
        }
    }

    // Fallback DOM (1 ví dụ/meaning).
    const dom = parseDom($);
    if (!dom?.groups?.length) {
        // Hanzii không có entry cho từ này trong SSR (VD phrase 我係 — SSR không include,
        // chỉ load client-side qua API mã hóa) → fallback tự derive Hán-Việt từ map per-char
        // (sino-vietnamese.json) để frontend vẫn fill được sino. (2026-08-22)
        const derived = wordSinoVietnamese(word);
        return derived ? { word, sinoVietnamese: derived } : null;
    }
    return { word, sinoVietnamese: wholeWordSino($, word), hskLevel: dom.hskLevel, groups: dom.groups };
}
