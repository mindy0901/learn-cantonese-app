import fs from "fs";
import { readFile } from "fs/promises";
const t = (label, fn) => {
    const s = Date.now();
    fn();
    console.log(label, Date.now() - s, "ms");
};
t("read bind-mount index.html", () => readFile("/app/index.html", "utf8"));
t("read volume vite.js", () => readFile("/app/node_modules/vite/bin/vite.js", "utf8"));
t("stat volume node_modules/.pnpm", () => fs.promises.readdir("/app/node_modules/.pnpm"));
for (const p of ["/vite.svg", "/src/main.jsx", "/src/App.jsx", "/", "/src/main.jsx"]) {
    const s = Date.now();
    const r = await fetch("http://127.0.0.1:5173" + p);
    await r.text();
    console.log(p, "->", Date.now() - s, "ms", r.status);
}
