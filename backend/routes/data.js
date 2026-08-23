/**
 * Routes TÁCH MANDARIN / CANTONESE (2026-08-17).
 * Vocabulary được tách 2 kho độc lập: /mandarin-vocabularies + /cantonese-vocabularies.
 * Grammar / Han-character / Radicals không tách (dùng chung).
 * Flashcard deck + Vocabulary set dùng chung, link table tách theo ngôn ngữ.
 */
import {
    fetchAppData,
    rowToGrammar,
    rowToHanCharacter,
    queryVocabularies,
    fetchVocabulariesByIds,
    findVocabularyByHan,
    resolveReadUserId,
    // CRUD vocab (per language)
    createVocabulary,
    updateVocabulary,
    deleteVocabulary,
    // grammar
    createGrammar,
    updateGrammar,
    deleteGrammar,
    // han char
    createHanChar,
    updateHanChar,
    deleteHanChar,
    // flashcard
    getFlashcardDecks,
    getFlashcardDeck,
    createFlashcardDeck,
    updateFlashcardDeck,
    deleteFlashcardDeck,
    addVocabularyToDeck,
    removeVocabularyFromDeck,
    // sets
    getVocabularySets,
    createVocabularySet,
    updateVocabularySet,
    deleteVocabularySet,
    addVocabularyToSet,
    removeVocabularyFromSet,
    isLanguage,
    findSimplifiedSuggestion,
    buildHkSuggestionMap,
} from "../lib/prismaServiceSplit.js";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { requireAppAdmin } from "../middleware/appAdmin.js";

function langParam(q) {
    const lang = String(q?.lang ?? q?.language ?? "cantonese");
    return isLanguage(lang) ? lang : "cantonese";
}

export async function dataRoutes(fastify) {
    // ── Full snapshot (2 kho từ + grammars + han characters) ──
    fastify.get("/data", async (request) => {
        await resolveReadUserId(request.session);
        return await fetchAppData();
    });

    // ── Vocabulary bank browse + CRUD (per language) ──
    for (const lang of ["mandarin", "cantonese"]) {
        // Browse
        fastify.get(`/${lang}-vocabularies`, async (request) => {
            if (request.query.page || request.query.pageSize) {
                return await queryVocabularies(lang, {
                    page: request.query.page,
                    pageSize: request.query.pageSize,
                    sortKey: request.query.sortKey,
                    sortDir: request.query.sortDir,
                    search: request.query.q ?? request.query.search,
                    hskLevel: lang === "mandarin" ? request.query.hskLevel || null : undefined,
                    pureCantonese: lang === "cantonese" ? (request.query.pureCantonese ?? null) : undefined,
                });
            }
            const data = await fetchAppData();
            return lang === "mandarin" ? data.mandarinVocabularies : data.cantoneseVocabularies;
        });

        // By IDs
        fastify.get(`/${lang}-vocabularies/by-ids`, async (request) => {
            const ids = String(request.query.ids ?? "")
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean);
            return await fetchVocabulariesByIds(lang, ids);
        });

        // Exists-by-han (dedupe khi tạo từ mới)
        fastify.get(`/${lang}-vocabularies/find-by-han`, async (request) => {
            const han = String(request.query.han ?? request.query.q ?? "").trim();
            if (!han) return { items: [] };
            return await findVocabularyByHan(lang, han);
        });

        // CRUD
        fastify.post(
            `/${lang}-vocabularies`,
            { preHandler: [requireAuth, requireAppAdmin] },
            async (request, reply) => {
                const vocab = await createVocabulary(lang, request.body);
                return reply.code(201).send(vocab);
            },
        );

        fastify.put(`/${lang}-vocabularies/:id`, { preHandler: [requireAuth] }, async (request) => {
            return await updateVocabulary(lang, request.params.id, request.body);
        });

        fastify.delete(`/${lang}-vocabularies/:id`, { preHandler: [requireAuth, requireAppAdmin] }, async (request) => {
            await deleteVocabulary(lang, request.params.id);
            return { ok: true };
        });
    }

    // Gợi ý giản thể cho form HK (hero Cantonese — cột phải). HK → giản thể qua hk2s,
    // CHỈ trả khi tìm thấy trong kho Mandarin.
    fastify.get("/hanzi/simplified-suggestion", async (request) => {
        const hk = String(request.query.hk ?? "").trim();
        return await findSimplifiedSuggestion(hk);
    });

    // Toàn bộ map HK → gợi ý mandarin (precompute khi load — frontend tra map, không gọi
    // /hanzi/simplified-suggestion từng từ khi click vocab → hết giật). (2026-08-21)
    fastify.get("/hanzi/hk-suggestion-map", async () => {
        return await buildHkSuggestionMap();
    });

    // ── Grammar CRUD ──
    fastify.get("/grammar", async (request) => {
        const data = await fetchAppData();
        return data.grammars;
    });

    fastify.post("/grammar", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const grammar = await createGrammar(getUserId(request), request.body);
        return reply.code(201).send(grammar);
    });

    fastify.put("/grammar/:id", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const grammar = await updateGrammar(getUserId(request), request.params.id, request.body);
        return grammar;
    });

    fastify.delete("/grammar/:id", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        await deleteGrammar(getUserId(request), request.params.id);
        return { ok: true };
    });

    // ── Han Characters CRUD ──
    fastify.get("/han-characters", async (request) => {
        if (request.query.page || request.query.pageSize) {
            const pageSize = Math.min(50, Math.max(1, Number(request.query.pageSize) || 20));
            const page = Math.max(1, Number(request.query.page) || 1);
            const search = String(request.query.q ?? request.query.search ?? "").trim();
            const { prisma } = await import("../lib/prisma.js");
            const where = {};
            if (search) {
                where.OR = [
                    { hanSimplified: { contains: search, mode: "insensitive" } },
                    { hanTraditional: { contains: search, mode: "insensitive" } },
                ];
            }
            const [items, total] = await Promise.all([
                prisma.hanziCharacter.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                }),
                prisma.hanziCharacter.count({ where }),
            ]);
            return { items: items.map(rowToHanCharacter), total, page, pageSize };
        }
        const data = await fetchAppData();
        return data.hanCharacters;
    });

    fastify.post("/han-characters", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const char = await createHanChar(getUserId(request), request.body);
        return reply.code(201).send(char);
    });

    fastify.put("/han-characters/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const char = await updateHanChar(getUserId(request), request.params.id, request.body);
        return char;
    });

    fastify.delete("/han-characters/:id", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        await deleteHanChar(getUserId(request), request.params.id);
        return { ok: true };
    });

    // ── Radicals (214 bộ thủ) — model HanziRadical ──
    fastify.get("/radicals", async () => {
        const { prisma } = await import("../lib/prisma.js");
        const radicals = await prisma.hanziRadical.findMany({ orderBy: { number: "asc" } });
        const groups = [];
        for (const r of radicals) {
            let g = groups.find((x) => x.strokes === r.strokeCount);
            if (!g) {
                g = { strokes: r.strokeCount, radicals: [] };
                groups.push(g);
            }
            g.radicals.push({
                no: r.number,
                char: r.char,
                name: r.name,
                desc: r.desc,
                pinyin: r.pinyin,
                variants: r.variants,
            });
        }
        return { total: radicals.length, groups };
    });

    // ── Sync han characters (preview + job + progress) — cập nhật theo 2 ngôn ngữ ──
    fastify.post(
        "/data/sync-han-characters/preview",
        { preHandler: [requireAuth, requireAppAdmin] },
        async (request) => {
            const { previewVocabularyHanCharacters } = await import("../lib/hanCharacterBreakdown.js");
            const mode = request.body?.mode === "full" ? "full" : "fast";
            const result = await previewVocabularyHanCharacters(mode);
            return { ok: true, mode, ...result };
        },
    );

    fastify.post("/data/sync-han-characters", { preHandler: [requireAuth, requireAppAdmin] }, async (request) => {
        const { createSyncJob, runSyncJob } = await import("../lib/hanCharSyncJob.js");
        const mode = request.body?.mode === "full" ? "full" : "fast";
        const job = createSyncJob();
        runSyncJob(job.id, mode); // fire-and-forget
        return { ok: true, jobId: job.id, mode };
    });

    fastify.get(
        "/data/sync-han-characters/progress/:jobId",
        { preHandler: [requireAuth, requireAppAdmin] },
        async (request) => {
            const { getSyncJob } = await import("../lib/hanCharSyncJob.js");
            const job = getSyncJob(request.params.jobId);
            if (!job) return { ok: true, job: null };
            return { ok: true, job };
        },
    );

    // ── Sync stroke count ──
    fastify.post(
        "/data/sync-han-char-strokes/preview",
        { preHandler: [requireAuth, requireAppAdmin] },
        async (request) => {
            const { previewHanCharStrokes } = await import("../lib/hanCharStrokeSync.js");
            const mode = request.body?.mode === "full" ? "full" : "fast";
            const result = await previewHanCharStrokes(mode);
            return { ok: true, mode, ...result };
        },
    );

    fastify.post("/data/sync-han-char-strokes", { preHandler: [requireAuth, requireAppAdmin] }, async (request) => {
        const { createStrokeJob, runStrokeJob } = await import("../lib/hanCharStrokeJob.js");
        const mode = request.body?.mode === "full" ? "full" : "fast";
        const job = createStrokeJob();
        runStrokeJob(job.id, mode); // fire-and-forget
        return { ok: true, jobId: job.id, mode };
    });

    fastify.get(
        "/data/sync-han-char-strokes/progress/:jobId",
        { preHandler: [requireAuth, requireAppAdmin] },
        async (request) => {
            const { getStrokeJob } = await import("../lib/hanCharStrokeJob.js");
            const job = getStrokeJob(request.params.jobId);
            if (!job) return { ok: true, job: null };
            return { ok: true, job };
        },
    );

    // ── Flashcard Decks ──
    fastify.get("/flashcard-decks", { preHandler: [requireAuth] }, async (request) => {
        return getFlashcardDecks(getUserId(request));
    });

    fastify.get("/flashcard-decks/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const deck = await getFlashcardDeck(getUserId(request), request.params.id);
        if (!deck) return reply.code(404).send({ error: "Deck not found" });
        return deck;
    });

    fastify.post("/flashcard-decks", { preHandler: [requireAuth] }, async (request, reply) => {
        const deck = await createFlashcardDeck(getUserId(request), request.body ?? {});
        return reply.code(201).send(deck);
    });

    fastify.put("/flashcard-decks/:id", { preHandler: [requireAuth] }, async (request) => {
        return updateFlashcardDeck(getUserId(request), request.params.id, request.body ?? {});
    });

    fastify.delete("/flashcard-decks/:id", { preHandler: [requireAuth] }, async (request) => {
        await deleteFlashcardDeck(getUserId(request), request.params.id);
        return { ok: true };
    });

    fastify.post("/flashcard-decks/:id/vocabularies", { preHandler: [requireAuth] }, async (request, reply) => {
        const { vocabularyId, lang } = request.body ?? {};
        if (!vocabularyId) return reply.code(400).send({ error: "vocabularyId is required" });
        try {
            const vocab = await addVocabularyToDeck(
                langParam({ lang }),
                getUserId(request),
                request.params.id,
                vocabularyId,
            );
            return reply.code(201).send(vocab);
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            if (err.statusCode === 409) return reply.code(409).send({ error: err.message });
            throw err;
        }
    });

    fastify.delete(
        "/flashcard-decks/:deckId/vocabularies/:vocabularyId",
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const lang = langParam(request.query);
            try {
                await removeVocabularyFromDeck(
                    lang,
                    getUserId(request),
                    request.params.deckId,
                    request.params.vocabularyId,
                );
                return { ok: true };
            } catch (err) {
                if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
                throw err;
            }
        },
    );

    // ── Vocabulary Sets ──
    fastify.get("/vocabulary-sets", { preHandler: [requireAuth] }, async (request) => {
        return getVocabularySets(getUserId(request));
    });

    fastify.post("/vocabulary-sets", { preHandler: [requireAuth] }, async (request, reply) => {
        const set = await createVocabularySet(getUserId(request), request.body ?? {});
        return reply.code(201).send(set);
    });

    fastify.put("/vocabulary-sets/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        try {
            return await updateVocabularySet(getUserId(request), request.params.id, request.body ?? {});
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            throw err;
        }
    });

    fastify.delete("/vocabulary-sets/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        try {
            await deleteVocabularySet(getUserId(request), request.params.id);
            return { ok: true };
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            throw err;
        }
    });

    fastify.post("/vocabulary-sets/:id/vocabularies", { preHandler: [requireAuth] }, async (request, reply) => {
        const { vocabularyId, lang } = request.body ?? {};
        if (!vocabularyId) return reply.code(400).send({ error: "vocabularyId is required" });
        try {
            const res = await addVocabularyToSet(
                langParam({ lang }),
                getUserId(request),
                request.params.id,
                vocabularyId,
            );
            return reply.code(201).send(res);
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            if (err.statusCode === 409) return reply.code(409).send({ error: err.message });
            throw err;
        }
    });

    fastify.delete(
        "/vocabulary-sets/:id/vocabularies/:vocabularyId",
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const lang = langParam(request.query);
            try {
                await removeVocabularyFromSet(lang, getUserId(request), request.params.id, request.params.vocabularyId);
                return { ok: true };
            } catch (err) {
                if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
                throw err;
            }
        },
    );
}
