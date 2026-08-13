/**
 * Bảng âm tiết Jyutping — thanh mẫu × vận mẫu.
 * Nguồn: DATABASE của app (bảng vocabularies, cột jyutping — 620 âm tiết thực tế xuất hiện trong từ).
 * Chỉ giữ các âm tiết trong 54 vần chuẩn (theo tiengtrung.vn) + m/ng; bỏ vần hiếm et/oei/um/oet.
 * Tự sinh bởi scripts/build-jyutping-table.mjs — KHÔNG sửa tay.
 */

/** Danh sách thanh mẫu (Ø đứng đầu) */
export const JYUTPING_SYL_INITIALS = ["Ø", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "ng", "h", "gw", "kw", "w", "z", "c", "s", "j"];

/** Danh sách vận mẫu (54 vần chuẩn theo tiengtrung.vn + m/ng) */
export const JYUTPING_SYL_FINALS = ["aa", "aai", "aau", "aam", "aan", "aang", "aap", "aat", "aak", "ai", "au", "am", "an", "ang", "ap", "at", "ak", "e", "ei", "eu", "em", "eng", "ep", "ek", "eoi", "eon", "eot", "oe", "oeng", "oek", "i", "iu", "im", "in", "ing", "ip", "it", "ik", "o", "oi", "ou", "on", "ong", "ot", "ok", "u", "ui", "un", "ung", "ut", "uk", "yu", "yun", "yut", "m", "ng"];

/** Grid thanh mẫu × vận mẫu — ô = âm tiết thực tế trong DB hoặc "" */
export const JYUTPING_SYL_ROWS = [
    { initial: "Ø", cells: ["aa", "aai", "aau", "", "aan", "", "aap", "aat", "aak", "ai", "au", "am", "", "ang", "", "", "ak", "", "ei", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "o", "oi", "ou", "on", "ong", "", "ok", "", "", "", "ung", "", "uk", "", "", "", "m", "ng"] },
    { initial: "b", cells: ["baa", "baai", "baau", "", "baan", "baang", "", "baat", "baak", "bai", "", "bam", "ban", "bang", "", "bat", "bak", "be", "bei", "", "", "beng", "", "", "", "", "", "", "", "", "", "biu", "", "bin", "bing", "", "bit", "bik", "bo", "", "bou", "", "bong", "", "bok", "", "bui", "bun", "bung", "but", "buk", "", "", "", "", ""] },
    { initial: "p", cells: ["paa", "paai", "paau", "", "paan", "paang", "", "", "paak", "pai", "", "", "pan", "pang", "", "pat", "", "pe", "pei", "", "", "peng", "", "pek", "", "", "", "", "", "", "", "piu", "", "pin", "ping", "", "pit", "pik", "po", "", "pou", "", "pong", "", "pok", "", "pui", "pun", "pung", "put", "puk", "", "", "", "", ""] },
    { initial: "m", cells: ["maa", "maai", "maau", "", "maan", "maang", "", "maat", "", "mai", "mau", "", "man", "mang", "", "mat", "mak", "me", "mei", "meu", "", "meng", "", "", "", "", "", "", "", "", "mi", "miu", "", "min", "ming", "", "mit", "mik", "mo", "", "mou", "mon", "mong", "", "mok", "", "mui", "mun", "mung", "mut", "muk", "", "", "", "", ""] },
    { initial: "f", cells: ["faa", "faai", "", "", "faan", "", "", "faat", "faak", "fai", "fau", "", "fan", "", "", "fat", "", "fe", "fei", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "fo", "", "", "", "fong", "", "fok", "fu", "fui", "fun", "fung", "fut", "fuk", "", "", "", "", ""] },
    { initial: "d", cells: ["daa", "daai", "", "daam", "daan", "", "daap", "daat", "", "dai", "dau", "dam", "dan", "dang", "dap", "dat", "dak", "de", "dei", "deu", "", "deng", "", "dek", "deoi", "deon", "", "doe", "", "doek", "di", "diu", "dim", "din", "ding", "dip", "dit", "dik", "do", "doi", "dou", "", "dong", "", "dok", "", "", "", "dung", "dut", "duk", "", "dyun", "dyut", "", ""] },
    { initial: "t", cells: ["taa", "taai", "", "taam", "taan", "", "taap", "taat", "taak", "tai", "tau", "tam", "tan", "tang", "", "", "", "", "", "", "", "teng", "", "tek", "teoi", "teon", "", "toe", "", "", "", "tiu", "tim", "tin", "ting", "tip", "tit", "tik", "to", "toi", "tou", "", "tong", "", "tok", "tu", "", "", "tung", "", "tuk", "", "tyun", "tyut", "", ""] },
    { initial: "n", cells: ["naa", "naai", "naau", "naam", "naan", "", "naap", "naat", "", "nai", "nau", "nam", "nan", "nang", "nap", "", "", "ne", "nei", "", "", "", "", "", "neoi", "", "", "", "noeng", "", "ni", "niu", "nim", "nin", "ning", "nip", "", "nik", "no", "noi", "nou", "", "nong", "", "nok", "", "", "", "nung", "", "", "", "nyun", "", "", ""] },
    { initial: "l", cells: ["laa", "laai", "laau", "laam", "laan", "laang", "laap", "laat", "laak", "lai", "lau", "lam", "lan", "", "lap", "lat", "lak", "le", "lei", "", "", "leng", "", "", "leoi", "leon", "leot", "", "loeng", "loek", "", "liu", "lim", "lin", "ling", "lip", "lit", "lik", "lo", "loi", "lou", "", "long", "", "lok", "", "", "", "lung", "", "luk", "", "lyun", "lyut", "", ""] },
    { initial: "g", cells: ["gaa", "gaai", "gaau", "gaam", "gaan", "gaang", "gaap", "", "gaak", "gai", "gau", "gam", "gan", "gang", "gap", "gat", "", "ge", "gei", "", "", "geng", "gep", "", "geoi", "", "", "goe", "goeng", "goek", "", "giu", "gim", "gin", "ging", "gip", "git", "gik", "go", "goi", "gou", "gon", "gong", "got", "gok", "gu", "gui", "gun", "gung", "", "guk", "", "gyun", "", "", ""] },
    { initial: "k", cells: ["kaa", "kaai", "kaau", "", "kaan", "", "", "kaat", "kaak", "kai", "kau", "kam", "kan", "kang", "kap", "kat", "kak", "ke", "kei", "", "", "", "", "kek", "keoi", "", "", "", "koeng", "koek", "", "kiu", "kim", "kin", "king", "", "kit", "kik", "", "koi", "", "", "kong", "", "kok", "", "kui", "", "kung", "kut", "kuk", "", "kyun", "kyut", "", ""] },
    { initial: "ng", cells: ["ngaa", "ngaai", "ngaau", "ngaam", "ngaan", "ngaang", "", "", "ngaak", "ngai", "ngau", "ngam", "ngan", "", "ngap", "ngat", "ngak", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "ngo", "ngoi", "ngou", "ngon", "ngong", "", "ngok", "", "", "", "ngung", "", "", "", "", "", "", ""] },
    { initial: "h", cells: ["haa", "haai", "haau", "haam", "haan", "haang", "haap", "haat", "haak", "hai", "hau", "ham", "han", "hang", "hap", "hat", "hak", "", "hei", "", "", "heng", "", "hek", "heoi", "", "", "hoe", "hoeng", "", "hi", "hiu", "him", "hin", "hing", "hip", "hit", "", "ho", "hoi", "hou", "hon", "hong", "hot", "hok", "", "", "", "hung", "", "huk", "", "hyun", "hyut", "hm", "hng"] },
    { initial: "gw", cells: ["gwaa", "gwaai", "", "", "gwaan", "", "", "gwaat", "", "gwai", "", "", "gwan", "gwang", "", "gwat", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "gwing", "", "", "", "gwo", "", "", "", "gwong", "", "gwok", "", "", "gwun", "", "", "", "", "", "", "", ""] },
    { initial: "kw", cells: ["kwaa", "kwaai", "", "", "", "kwaang", "", "", "kwaak", "kwai", "", "", "kwan", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "kwik", "", "", "", "", "kwong", "", "kwok", "", "", "", "", "", "", "", "", "", "", ""] },
    { initial: "w", cells: ["waa", "waai", "", "", "waan", "waang", "", "waat", "waak", "wai", "", "", "wan", "wang", "", "wat", "", "", "wei", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "wing", "", "", "wik", "wo", "", "", "", "wong", "", "wok", "wu", "wui", "wun", "", "wut", "", "", "", "", "", ""] },
    { initial: "z", cells: ["zaa", "zaai", "zaau", "zaam", "zaan", "zaang", "zaap", "zaat", "zaak", "zai", "zau", "zam", "zan", "zang", "zap", "zat", "zak", "ze", "", "", "", "zeng", "", "zek", "zeoi", "zeon", "zeot", "", "zoeng", "zoek", "zi", "ziu", "zim", "zin", "zing", "zip", "zit", "zik", "zo", "zoi", "zou", "", "zong", "", "zok", "", "", "", "zung", "", "zuk", "zyu", "zyun", "zyut", "", ""] },
    { initial: "c", cells: ["caa", "caai", "caau", "caam", "caan", "caang", "caap", "caat", "caak", "cai", "cau", "cam", "can", "cang", "cap", "cat", "cak", "ce", "", "", "", "ceng", "", "cek", "ceoi", "ceon", "ceot", "", "coeng", "coek", "ci", "ciu", "cim", "cin", "cing", "", "cit", "cik", "co", "coi", "cou", "", "cong", "", "cok", "", "", "", "cung", "", "cuk", "cyu", "cyun", "cyut", "", ""] },
    { initial: "s", cells: ["saa", "saai", "saau", "saam", "saan", "saang", "saap", "saat", "saak", "sai", "sau", "sam", "san", "sang", "sap", "sat", "sak", "se", "sei", "", "", "seng", "", "sek", "seoi", "seon", "seot", "", "soeng", "soek", "si", "siu", "sim", "sin", "sing", "sip", "sit", "sik", "so", "", "sou", "", "song", "", "sok", "", "", "", "sung", "", "suk", "syu", "syun", "syut", "", ""] },
    { initial: "j", cells: ["jaa", "jaai", "", "", "", "", "", "", "jaak", "jai", "jau", "jam", "jan", "", "jap", "jat", "", "je", "", "", "", "jeng", "", "", "jeoi", "jeon", "", "", "joeng", "joek", "ji", "jiu", "jim", "jin", "jing", "jip", "jit", "jik", "jo", "", "", "", "", "", "", "", "", "", "jung", "", "juk", "jyu", "jyun", "jyut", "", ""] },
];

/** Tổng âm tiết trong bảng */
export const JYUTPING_SYL_TOTAL = 620;

/** Số phụ âm đầu (19, không tính Ø) */
export const JYUTPING_SYL_INITIAL_COUNT = 19;

/** Số vần chuẩn (54, không tính m/ng) */
export const JYUTPING_SYL_FINAL_COUNT = 54;

/** Số thanh điệu (6) */
export const JYUTPING_SYL_TONE_COUNT = 6;
