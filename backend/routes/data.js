/**
 * Routes TÁCH MANDARIN / CANTONESE (2026-08-17).
 * Vocabulary được tách 2 kho độc lập: /mandarin-vocabularies + /cantonese-vocabularies.
 * Grammar / Han-character / Radicals không tách (dùng chung).
 * Flashcard deck + Vocabulary set dùng chung, link table tách theo ngôn ngữ.
 */
import {
    fetchAppData,
    fetchBootstrapData,
    computeDataSignature,
    computeBootstrapSignature,
    rowToGrammar,
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
    // favorite / disliked vocabularies (cặp ❤️ / 🚫 theo user)
    getFavoriteVocabularyIds,
    setVocabularyFavorite,
    getDislikedVocabularyIds,
    setVocabularyDisliked,
    // tags (dùng chung, admin quản lý) — 2026-09-27
    getTags,
    createTag,
    updateTag,
    deleteTag,
    getVocabularyTagIds,
    setVocabularyTag,
    // vocabulary mastery (progress 0-100%)
    getVocabularyMastery,
    setVocabularyMastery,
    isLanguage,
    findSimplifiedSuggestion,
} from "../lib/prismaServiceSplit.js";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { requireAppAdmin } from "../middleware/appAdmin.js";

function langParam(q) {
    const lang = String(q?.lang ?? q?.language ?? "cantonese");
    return isLanguage(lang) ? lang : "cantonese";
}

export async function dataRoutes(fastify) {
    // ── Bootstrap — 1 API trả HẾT data khi đăng nhập/load app (2026-09-02) ──
    // 2 bank từ + grammars + data theo user (favorite/disliked/mastery/sets — chỉ khi đã đăng nhập).
    // Thay cho 5 GET riêng: /data, /hanzi/hk-suggestion-map, /favorite-vocabularies,
    // /vocabulary-mastery, /vocabulary-sets.
    // ⚠️ 2026-09-02 (sửa): xóa /api/bootstrap-version — gộp chế độ freshness vào NGAY endpoint này
    // bằng ETag/304: frontend gửi If-None-Match = signature data hiện tại; không đổi → 304 (rỗng,
    // ~ms, KHÔNG tải 45MB); đổi → 200 full kèm ETag mới.
    fastify.get("/bootstrap", async (request, reply) => {
        const userId = await resolveReadUserId(request.session);
        // ⚠️ 2026-09-20: payload chứa data THEO USER (favorite/disliked/mastery/sets) nhưng ETag chỉ
        // theo nội dung 2 bank → browser HTTP cache có thể dùng lại body CŨ (đánh dấu ❤️/🚫 mới
        // không thấy sau F5) khi revalidate trả 304. ⇒ CẤM browser cache response này
        // (`private, no-store`); freshness do client tự quản bằng If-None-Match như cũ.
        reply.header("cache-control", "private, no-store");
        const clientEtag = String(request.headers["if-none-match"] ?? "");
        if (clientEtag) {
            const signature = await computeBootstrapSignature(userId);
            if (clientEtag === signature) {
                return reply.code(304).send();
            }
        }
        const data = await fetchBootstrapData(userId);
        // ⚠️ 2026-09-20: ETag = nội dung 2 bank + digest data THEO USER (favorite/disliked/mastery/sets)
        // → đánh dấu mới của user cũng làm signature đổi ⇒ client tải lại (không bị 304 giữ data cũ).
        reply.header("etag", await computeBootstrapSignature(userId));
        return data;
    });

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
                    // ⚠️ 2026-09-02: flashcard random bỏ từ đã mastered (progress >= 100)
                    excludeMastered: request.query.excludeMastered === "1" || request.query.excludeMastered === "true",
                    // ⚠️ 2026-09-20: flashcard random bỏ từ user đánh dấu "không muốn học" (🚫).
                    excludeDisliked: request.query.excludeDisliked === "1" || request.query.excludeDisliked === "true",
                    userId: request.session?.userId ?? null,
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

    // Gợi ý giản thể cho form HK (cột Mandarin / gợi ý khi click vocab). HK → giản thể qua
    // hk2s, CHỈ trả khi tìm thấy trong kho Mandarin. Tra ON-DEMAND theo từng từ (2026-09-02 —
    // xóa hkSuggestionMap precompute).
    fastify.get("/hanzi/simplified-suggestion", async (request) => {
        const hk = String(request.query.hk ?? "").trim();
        return await findSimplifiedSuggestion(hk);
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

    // ── Favorite / Disliked vocabularies (cặp ❤️ yêu thích / 🚫 không muốn học) — 2026-09-20 ──
    fastify.get("/favorite-vocabularies", { preHandler: [requireAuth] }, async (request) => {
        return getFavoriteVocabularyIds(getUserId(request));
    });

    fastify.put("/favorite-vocabularies/:lang/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const lang = isLanguage(request.params.lang) ? request.params.lang : "cantonese";
        const { favorite } = request.body ?? {};
        try {
            return await setVocabularyFavorite(getUserId(request), lang, request.params.id, Boolean(favorite));
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            throw err;
        }
    });

    fastify.get("/disliked-vocabularies", { preHandler: [requireAuth] }, async (request) => {
        return getDislikedVocabularyIds(getUserId(request));
    });

    fastify.put("/disliked-vocabularies/:lang/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const lang = isLanguage(request.params.lang) ? request.params.lang : "cantonese";
        const { disliked } = request.body ?? {};
        try {
            return await setVocabularyDisliked(getUserId(request), lang, request.params.id, Boolean(disliked));
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            throw err;
        }
    });

    // ── Tags (dùng chung toàn app — CHỈ admin tạo/đổi tên/xóa + gán cho từ) — 2026-09-27 ──
    // Đọc danh sách tag: công khai (không cần đăng nhập) để chip/tag hiển thị được cả guest.
    fastify.get("/tags", async () => await getTags());

    fastify.post("/tags", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        try {
            return await createTag(request.body ?? {});
        } catch (err) {
            if (err.statusCode === 409 || err.statusCode === 400) {
                return reply.code(err.statusCode).send({ error: err.message });
            }
            throw err;
        }
    });

    fastify.patch("/tags/:id", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        try {
            return await updateTag(request.params.id, request.body ?? {});
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 409 || err.statusCode === 400) {
                return reply.code(err.statusCode).send({ error: err.message });
            }
            throw err;
        }
    });

    fastify.delete("/tags/:id", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        try {
            await deleteTag(request.params.id);
            return { ok: true };
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            throw err;
        }
    });

    // Tag đang gán cho 1 từ (theo ngôn ngữ) — dùng cho picker ở header trang chi tiết.
    fastify.get("/vocabulary-tags", async (request) => {
        const lang = langParam(request.query);
        const vocabularyId = String(request.query.id ?? request.query.vocabularyId ?? "").trim();
        if (!vocabularyId) return { tagIds: [] };
        return { tagIds: await getVocabularyTagIds(lang, vocabularyId) };
    });

    // Gán / gỡ tag cho từ — CHỈ admin. Body: { lang, vocabularyId, tagId, tagged }.
    fastify.put("/vocabulary-tags", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const { lang, vocabularyId, tagId, tagged } = request.body ?? {};
        const validLang = isLanguage(lang) ? lang : "cantonese";
        if (!vocabularyId || !tagId) return reply.code(400).send({ error: "Missing vocabularyId/tagId" });
        try {
            return await setVocabularyTag(validLang, String(vocabularyId), String(tagId), Boolean(tagged));
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            throw err;
        }
    });

    // ── Vocabulary mastery (progress 0-100%) — mọi user đã đăng nhập (2026-09-02) ──
    fastify.get("/vocabulary-mastery", { preHandler: [requireAuth] }, async (request) => {
        return getVocabularyMastery(getUserId(request));
    });

    // Body: { progress: 0-100 }. Set progress trực tiếp (clamp 0-100, <=0 → xóa dòng).
    fastify.put("/vocabulary-mastery/:lang/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const lang = isLanguage(request.params.lang) ? request.params.lang : "cantonese";
        const { progress } = request.body ?? {};
        try {
            return await setVocabularyMastery(getUserId(request), lang, request.params.id, progress);
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            throw err;
        }
    });
}
