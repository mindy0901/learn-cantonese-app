import { Router } from "express";
import { isLatinSearchQuery, searchCedictByEnglish } from "../lib/cedictSearch.js";

export const cedictRouter = Router();

cedictRouter.get("/search", async (req, res, next) => {
    try {
        const q = String(req.query.q ?? "").trim();
        if (!q) {
            res.json({ items: [] });
            return;
        }
        if (!isLatinSearchQuery(q)) {
            res.json({ items: [] });
            return;
        }

        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
        const items = await searchCedictByEnglish(q, { limit });
        res.json({ items, query: q });
    } catch (err) {
        next(err);
    }
});
