import { createHash } from "crypto";

/** stable UUID cho 1 romanization object: MD5(normPinyin|normJyutping) → uuid */
export function romanizationId(pinyin, jyutping) {
    const normPy = String(pinyin ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
    const normJp = String(jyutping ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
    return createHash("md5")
        .update(`${normPy}|${normJp}`)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}
