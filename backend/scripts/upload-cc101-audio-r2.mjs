/**
 * Upload toàn bộ audio CC101 (từ backend/data/cc101_core_2000.json) lên Cloudflare R2.
 * ⚠️ Đọc credentials từ backend/.env.r2 (đã gitignore) — điền TRƯỚC khi chạy.
 *
 * Cơ chế:
 *   - Gộp danh sách URL audio duy nhất (word + english + từng ví dụ).
 *   - Với mỗi URL: download MP3 từ CDN CC101 → PUT lên R2 (S3-compatible, AWS SigV4 tự ký).
 *   - Object key = tên file MP3 (VD 274295.mp3). Public URL = <R2_PUBLIC_BASE>/<id>.mp3.
 *   - Concurrency 8 + retry; bỏ qua file đã có trên R2 (HEAD) để resume.
 *
 * Chạy (trong container): docker compose -f docker-compose.dev.yml exec -T backend node /app/upload-cc101-audio-r2.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// ── Load .env.r2 ──
function loadEnv(file) {
    const out = {};
    try {
        for (const line of fs.readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
            if (m && !m[1].startsWith("#")) out[m[1]] = m[2];
        }
    } catch {}
    return out;
}
const env = { ...loadEnv(path.join(import.meta.dirname, "..", ".env.r2")), ...process.env };
const ACCOUNT_ID = env.R2_ACCOUNT_ID?.trim();
const AKID = env.R2_ACCESS_KEY_ID?.trim();
const SECRET = env.R2_SECRET_ACCESS_KEY?.trim();
const BUCKET = (env.R2_BUCKET || "cantonese-audio").trim();
const PUBLIC_BASE = env.R2_PUBLIC_BASE?.trim() || "";
if (!ACCOUNT_ID || !AKID || !SECRET) {
    console.error(
        "❌ Thiếu R2 credentials — điền backend/.env.r2 (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).",
    );
    process.exit(1);
}

const ENDPOINT_HOST = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;

// ── AWS SigV4 ──
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

function sign(method, path, headers, body) {
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const region = "auto";
    const payloadHash = body == null ? sha256("") : sha256(body);
    const allHeaders = {
        host: ENDPOINT_HOST,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        ...headers,
    };
    const keys = Object.keys(allHeaders).sort();
    const signedHeaders = keys.map((h) => h.toLowerCase()).join(";");
    const canonicalHeaders = keys.map((h) => `${h.toLowerCase()}:${String(allHeaders[h]).trim()}\n`).join("");
    const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${date}/${region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
    const kDate = hmac("AWS4" + SECRET, date);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${AKID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { authorization, amzDate, payloadHash };
}

async function r2Head(key) {
    const rpath = `/${BUCKET}/${encodeURI(key)}`;
    const { authorization, amzDate, payloadHash } = sign("HEAD", rpath, {}, null);
    return fetch(`https://${ENDPOINT_HOST}${rpath}`, {
        method: "HEAD",
        headers: {
            host: ENDPOINT_HOST,
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": amzDate,
            Authorization: authorization,
        },
    });
}

async function r2Put(key, body) {
    const rpath = `/${BUCKET}/${encodeURI(key)}`;
    const { authorization, amzDate, payloadHash } = sign("PUT", rpath, { "content-type": "audio/mpeg" }, body);
    return fetch(`https://${ENDPOINT_HOST}${rpath}`, {
        method: "PUT",
        headers: {
            host: ENDPOINT_HOST,
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": amzDate,
            "content-type": "audio/mpeg",
            Authorization: authorization,
        },
        body,
    });
}

async function download(url) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`download ${url} -> ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

// ── Thu thập URL audio duy nhất ──
const data = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "data", "cc101_core_2000.json"), "utf8"));
const urlToId = new Map();
for (const x of data) {
    for (const u of [
        x.hanziAudio,
        x.englishAudio,
        ...(x.examples || []).flatMap((e) => [e.hanziAudio, e.englishAudio]),
    ]) {
        if (!u) continue;
        const id = String(u).split("/").pop();
        if (id) urlToId.set(String(u), id);
    }
}
const urls = [...urlToId.keys()];
console.log(`Tổng từ: ${data.length} | Audio duy nhất: ${urls.length}`);

const CONCURRENCY = 8;
const RETRIES = 3;
let done = 0,
    uploaded = 0,
    skipped = 0,
    failed = 0;
const failedList = [];

async function processUrl(url) {
    const id = urlToId.get(url);
    try {
        // HEAD skip nếu đã có trên R2
        for (let attempt = 0; ; attempt++) {
            const head = await r2Head(id);
            if (head.status === 200) {
                skipped += 1;
                return;
            }
            if (head.status !== 404 && attempt >= RETRIES - 1) throw new Error(`HEAD ${head.status}`);
            if (head.status !== 404) continue;
            break; // 404 → cần upload
        }
        // Download với backoff (CC101 hay rate-limit sau khi tải nhiều file liên tục).
        let mp3 = null;
        for (let attempt = 0; attempt < RETRIES; attempt++) {
            try {
                mp3 = await download(url);
                break;
            } catch (err) {
                if (attempt >= RETRIES - 1) throw err;
                await new Promise((r) => setTimeout(r, 4000 * (attempt + 1))); // 4s, 8s
            }
        }
        for (let attempt = 0; ; attempt++) {
            const put = await r2Put(id, mp3);
            if (put.status === 200) break;
            if (attempt >= RETRIES - 1) throw new Error(`PUT ${put.status}`);
            await new Promise((r) => setTimeout(r, 800));
        }
        uploaded += 1;
    } catch (err) {
        failed += 1;
        failedList.push(`${id}: ${err.message}`);
    } finally {
        done += 1;
        if (done % 50 === 0 || done === urls.length) {
            console.log(`  ${done}/${urls.length} | up=${uploaded} skip=${skipped} fail=${failed}`);
        }
    }
}

(async () => {
    console.log(`Uploading to R2 bucket "${BUCKET}"...`);
    let idx = 0;
    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
            while (idx < urls.length) {
                const url = urls[idx++];
                await processUrl(url);
            }
        }),
    );
    console.log(`\nXong: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed.`);
    if (failedList.length) {
        console.log("Failed:");
        failedList.slice(0, 30).forEach((f) => console.log("  -", f));
    }
    if (PUBLIC_BASE) console.log(`\nPublic base: ${PUBLIC_BASE}`);
    process.exit(failed ? 1 : 0);
})();
