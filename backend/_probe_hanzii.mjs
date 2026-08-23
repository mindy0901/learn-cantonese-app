const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const url = "https://hanzii.net/search/word/" + encodeURIComponent("長") + "?hl=vi";
fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "vi" } })
    .then((r) => r.text())
    .then((html) => {
        const m = html.match(/<script[^>]*id="ng-state"[^>]*>([\s\S]*?)<\/script>/);
        const state = JSON.parse(m[1]);
        const key = Object.keys(state).find((k) => k.includes("word_search_"));
        const root = state[key];
        const dw = root?.detailWord;
        console.log("=== detailWord compound ===");
        console.log(JSON.stringify(dw?.compound, null, 2).slice(0, 1500));
        console.log("=== detailWord snym (synonyms) ===");
        console.log(JSON.stringify(dw?.snym, null, 2).slice(0, 1500));
        console.log("=== detailWord compare (antonyms?) ===");
        console.log(JSON.stringify(dw?.compare, null, 2).slice(0, 1500));
        console.log("=== cvCompound ===");
        console.log(JSON.stringify(dw?.cvCompound, null, 2).slice(0, 800));
        console.log("=== show flags ===", dw?.showCompound, dw?.showSyno, dw?.showAnto);
    })
    .catch((e) => console.log("ERR", e.message));
