import * as cheerio from "cheerio";
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const url = "https://hanzii.net/search/word/" + encodeURIComponent("長") + "?hl=vi";
const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "vi" } });
const html = await res.text();
const m = html.match(/<script[^>]*id="ng-state"[^>]*>([\s\S]*?)<\/script>/);
const state = JSON.parse(m[1]);
const key = Object.keys(state).find((k) => k.includes("word_search_"));
const root = state[key];

console.log("===== ng-state PER-TONE compound/snym =====");
for (const it of root?.searchResult || []) {
    console.log("--- tone:", it?.pinyin);
    console.log("  compound:", JSON.stringify(it?.compound));
    console.log("  cvCompound len:", Array.isArray(it?.cvCompound) ? it.cvCompound.length : "n/a");
    console.log("  snym:", JSON.stringify(it?.snym));
}
console.log("  detailWord.compound:", JSON.stringify(root?.detailWord?.compound));

console.log("\n===== DOM related sections =====");
const $ = cheerio.load(html);
for (const id of ["syno", "anto", "compound"]) {
    const el = $(`#${id}`);
    const items = el.find(".txt-compound").length;
    // tìm nút "xem thêm" / toggle trong section
    const btns = el.find("button, .toggle-item, .view-more, app-toogle-item").length;
    console.log(`#${id}: txt-compound=${items}, toggles/buttons=${btns}`);
    // dump class của các phần tử đặc biệt
    el.find("*").each((_, n) => {
        const cls = $(n).attr("class") || "";
        if (/more|toggle|view|expand|collapse|show/i.test(cls)) {
            const txt = $(n).text().replace(/\s+/g, " ").trim().slice(0, 40);
            console.log(`  [${n.tagName}.${cls}] "${txt}"`);
        }
    });
}
