import { Router } from "express";
import { getHanVietCognatesStats, listHanVietCognates, lookupHanVietCognate } from "../lib/hanVietCognates.js";
import { getHanVietPhienamStats, getHanVietPhienamMap, lookupHanVietPhienamChar } from "../lib/hanVietPhienam.js";

export const hanvietRouter = Router();

hanvietRouter.get("/lookup", (req, res, next) => {
    try {
        const q = String(req.query.q ?? "").trim();
        if (!q) {
            res.json({ match: null });
            return;
        }
        const match = lookupHanVietCognate(q);
        res.json({ match, query: q });
    } catch (err) {
        next(err);
    }
});

hanvietRouter.get("/cognates", (_req, res, next) => {
    try {
        const items = listHanVietCognates();
        const stats = getHanVietCognatesStats();
        res.json({ items, ...stats });
    } catch (err) {
        next(err);
    }
});

hanvietRouter.get("/phienam", (_req, res, next) => {
    try {
        const map = getHanVietPhienamMap();
        const stats = getHanVietPhienamStats();
        res.json({ charMap: Object.fromEntries(map), ...stats });
    } catch (err) {
        next(err);
    }
});

hanvietRouter.get("/phienam/lookup", (req, res, next) => {
    try {
        const ch = String(req.query.char ?? req.query.q ?? "").trim();
        if (!ch) {
            res.json({ match: null });
            return;
        }
        const match = lookupHanVietPhienamChar(ch);
        res.json({ match, char: ch });
    } catch (err) {
        next(err);
    }
});
