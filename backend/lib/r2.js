/**
 * Helper Cloudflare R2 (S3-compatible, AWS SigV4 tự ký) — PUT/HEAD/DELETE/LIST.
 * Đọc credentials từ backend/.env.r2 (đã gitignore).
 * Dùng cho TTS: sinh MP3 → upload R2 → trả public URL; xóa file khi sửa/xóa.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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

export const R2_CONFIGURED = Boolean(ACCOUNT_ID && AKID && SECRET);
export const R2_PUBLIC_BASE = PUBLIC_BASE;

const ENDPOINT_HOST = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

function sign(method, rpath, headers, body) {
    // rpath có thể chứa query string (LIST) — tách path + query để sign đúng chuẩn SigV4.
    const qIdx = rpath.indexOf("?");
    const rawPath = qIdx >= 0 ? rpath.slice(0, qIdx) : rpath;
    const rawQuery = qIdx >= 0 ? rpath.slice(qIdx + 1) : "";
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
    // Query phải URI-encode từng key/value, sắp xếp, và encode "/" thành %2F.
    const canonicalQuery = rawQuery
        .split("&")
        .filter(Boolean)
        .map((kv) => {
            const [k, v] = kv.split("=");
            return `${encodeURIComponent(decodeURIComponent(k))}=${encodeURIComponent(decodeURIComponent(v ?? ""))}`;
        })
        .sort()
        .join("&");
    const canonicalRequest = [method, rawPath, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
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

/** HEAD — kiểm tra object tồn tại. */
export async function r2Head(key) {
    if (!R2_CONFIGURED) return null;
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

/** PUT — upload buffer, trả public URL (hoặc null nếu chưa có PUBLIC_BASE). */
export async function uploadBufferToR2(key, buffer, contentType = "audio/mpeg") {
    if (!R2_CONFIGURED) {
        console.warn("[r2] R2 chưa cấu hình — bỏ qua upload");
        return null;
    }
    const rpath = `/${BUCKET}/${encodeURI(key)}`;
    const { authorization, amzDate, payloadHash } = sign("PUT", rpath, { "content-type": contentType }, buffer);
    const res = await fetch(`https://${ENDPOINT_HOST}${rpath}`, {
        method: "PUT",
        headers: {
            host: ENDPOINT_HOST,
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": amzDate,
            "content-type": contentType,
            Authorization: authorization,
        },
        body: buffer,
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`R2 PUT ${key} -> ${res.status} ${body.slice(0, 200)}`);
    }
    return PUBLIC_BASE ? `${PUBLIC_BASE}/${key}` : null;
}

/** DELETE — xóa object. Trả true nếu đã xóa / 404. */
export async function deleteR2Object(key) {
    if (!R2_CONFIGURED) return false;
    const rpath = `/${BUCKET}/${encodeURI(key)}`;
    const { authorization, amzDate, payloadHash } = sign("DELETE", rpath, {}, null);
    const res = await fetch(`https://${ENDPOINT_HOST}${rpath}`, {
        method: "DELETE",
        headers: {
            host: ENDPOINT_HOST,
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": amzDate,
            Authorization: authorization,
        },
    });
    return res.ok || res.status === 404;
}

/**
 * COPY — sao chép object trong cùng bucket (dùng cho migrate prefix).
 * R2 hỗ trợ CopyObject (x-amz-copy-source) — copy server-side, không tải data qua client.
 */
export async function copyR2Object(sourceKey, destKey) {
    if (!R2_CONFIGURED) return false;
    const rpath = `/${BUCKET}/${encodeURI(destKey)}`;
    const copySource = `/${BUCKET}/${encodeURIComponent(sourceKey)}`;
    const { authorization, amzDate, payloadHash } = sign("PUT", rpath, { "x-amz-copy-source": copySource }, null);
    const res = await fetch(`https://${ENDPOINT_HOST}${rpath}`, {
        method: "PUT",
        headers: {
            host: ENDPOINT_HOST,
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": amzDate,
            "x-amz-copy-source": copySource,
            Authorization: authorization,
        },
    });
    return res.ok;
}

/**
 * LIST — liệt kê object theo prefix. R2 trả tối đa 1000/trang; loop qua nextContinuationToken.
 * @returns {Promise<string[]>} danh sách key
 */
export async function listR2Objects(prefix = "", maxKeys = 1000) {
    if (!R2_CONFIGURED) return [];
    const keys = [];
    let token = "";
    for (;;) {
        const query = new URLSearchParams({ "list-type": "2" });
        if (prefix) query.set("prefix", prefix);
        query.set("max-keys", String(maxKeys));
        if (token) query.set("continuation-token", token);
        const qs = query.toString();
        const rpath = `/${BUCKET}?${qs}`;
        const { authorization, amzDate, payloadHash } = sign("GET", rpath, {}, null);
        const res = await fetch(`https://${ENDPOINT_HOST}${rpath}`, {
            method: "GET",
            headers: {
                host: ENDPOINT_HOST,
                "x-amz-content-sha256": payloadHash,
                "x-amz-date": amzDate,
                Authorization: authorization,
            },
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`R2 LIST ${prefix} -> ${res.status} ${body.slice(0, 200)}`);
        }
        const xml = await res.text();
        const keysMatch = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
        keys.push(...keysMatch);
        const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
        if (!next) break;
        token = next[1];
    }
    return keys;
}

/** Chuyển public URL → key (đảo ngược PUBLIC_BASE + "/"). */
export function urlToKey(url) {
    const s = String(url ?? "");
    if (!PUBLIC_BASE || !s.startsWith(PUBLIC_BASE)) return null;
    return s.slice(PUBLIC_BASE.length + 1);
}
