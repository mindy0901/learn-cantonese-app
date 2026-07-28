import { isLatinSearchQuery, searchCedictByEnglish } from "../lib/cedictSearch.js";

export async function cedictRoutes(fastify) {
  fastify.get("/search", async (request) => {
    const q = String(request.query.q ?? "").trim();
    if (!q) {
      return { items: [] };
    }
    if (!isLatinSearchQuery(q)) {
      return { items: [] };
    }

    const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 30));
    const items = await searchCedictByEnglish(q, { limit });
    return { items, query: q };
  });
}
