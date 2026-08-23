import { fetchHanziiMeanings } from "../lib/hanziiScrape.js";

export async function hanziiRoutes(fastify) {
    /**
     * POST /hanzii/meanings
     * Body: { query: string, hl?: string, pinyin?: string }
     * Scrape TẤT CẢ nhóm TỪ LOẠI (Danh từ, Động từ, Tính từ, Trợ từ, Phó từ, Số từ...)
     * của Hanzii cho 1 từ tiếng Trung.
     * - Có `pinyin` → trả { word, groups: [{ title, meanings: [{ vi, zh, examples }] }] } cho 1 phiên âm.
     * - KHÔNG có `pinyin` → trả { word, tones: [{ pinyin, groups: [...] }] } cho TOÀN BỘ thanh điệu.
     */
    fastify.post("/hanzii/meanings", async (request, reply) => {
        const { query, hl = "vi", pinyin } = request.body ?? {};
        if (!query || !String(query).trim()) {
            return reply.status(400).send({ error: "Missing query" });
        }

        try {
            const data = await fetchHanziiMeanings(String(query).trim(), {
                hl: String(hl),
                pinyin: pinyin ? String(pinyin) : undefined,
            });
            // Cho phép trả 200 kể cả khi chỉ có sinoVietnamese (Hanzii không có entry trong SSR
            // — derive từ map per-char) — để frontend vẫn fill được Hán-Việt. (2026-08-22)
            if (!data || (!data.groups?.length && !data.tones?.length && !data.sinoVietnamese)) {
                return reply.status(404).send({ error: "Không tìm thấy nghĩa trên Hanzii" });
            }
            return data;
        } catch (err) {
            console.error("hanzii scrape error:", err.message);
            return reply.status(502).send({ error: err.message });
        }
    });
}
