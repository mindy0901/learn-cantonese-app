import fs from "fs";
const walk = (label, p) => {
    const s = Date.now();
    let n = 0;
    const w = (d) => {
        for (const e of fs.readdirSync(d)) {
            n++;
            const f = d + "/" + e;
            try {
                const st = fs.statSync(f);
                if (st.isDirectory() && !e.startsWith("node_modules") && !e.startsWith(".git")) w(f);
            } catch {}
        }
    };
    w(p);
    console.log(label, "->", n, "entries in", Date.now() - s, "ms");
};
walk("BIND /app", "/app");
walk("VOLUME /app/node_modules", "/app/node_modules");
