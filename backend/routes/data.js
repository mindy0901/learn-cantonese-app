import {
    fetchAppData,
    fetchAllData,
    fetchSentencePatternRows,
    grammarToRow,
    hanCharacterToRow,
    replacePartialData,
    rowToGrammar,
    rowToHanCharacter,
    rowToSentencePattern,
    rowToVocabulary,
    sentencePatternToRow,
    vocabularyToRow,
    queryVocabularies,
    fetchVocabulariesByIds,
    resolveReadUserId,
    ensureUser,
    // CRUD
    createVocabulary,
    updateVocabulary,
    patchVocabularyFlags,
    deleteVocabulary,
    createGrammar,
    updateGrammar,
    deleteGrammar,
    createSentence,
    updateSentence,
    deleteSentence,
    createHanChar,
    updateHanChar,
    patchHanCharFlags,
    deleteHanChar,
    // Flashcard Deck CRUD
    getFlashcardDecks,
    getFlashcardDeck,
    createFlashcardDeck,
    updateFlashcardDeck,
    deleteFlashcardDeck,
    addVocabularyToDeck,
    removeVocabularyFromDeck,
    getDeckVocabularies,
    // Vocabulary set CRUD
    getVocabularySets,
    createVocabularySet,
    updateVocabularySet,
    deleteVocabularySet,
    addVocabularyToSet,
    removeVocabularyFromSet,
} from "../lib/prismaService.js";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { requireAppAdmin } from "../middleware/appAdmin.js";
import { normalizePopularity } from "../lib/wordPopularity.js";

export async function dataRoutes(fastify) {
    // ── Full snapshot ──
    fastify.get("/data", async (request) => {
        const userId = await resolveReadUserId(request.session);
        return await fetchAppData(userId);
    });

    // ── Vocabulary bank browse ──
    fastify.get("/vocabulary/browse", async (request) => {
        const userId = await resolveReadUserId(request.session);
        const result = await queryVocabularies(userId, {
            page: request.query.page,
            pageSize: request.query.pageSize,
            sortKey: request.query.sortKey,
            sortDir: request.query.sortDir,
            filter: request.query.filter,
            search: request.query.q ?? request.query.search,
            importantFirst: request.query.importantFirst === "true" || request.query.importantFirst === "1",
            studyDue: request.query.studyDue === "true" || request.query.studyDue === "1",
            maxProgress: request.query.maxProgress,
            hskLevel: request.query.hskLevel || null,
        });
        return result;
    });

    // ── Vocabulary by IDs ──
    fastify.get("/vocabulary/by-ids", async (request) => {
        const ids = String(request.query.ids ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        const userId = await resolveReadUserId(request.session);
        const rows = await fetchVocabulariesByIds(userId, ids);
        return rows.map(rowToVocabulary);
    });

    // ── Replace cloud data ──
    fastify.put("/data", { preHandler: [requireAuth, requireAppAdmin] }, async (request) => {
        const {
            types = ["words", "grammar"],
            words = [],
            grammarBank = [],
            sentencePatterns = [],
        } = request.body ?? {};
        if (!Array.isArray(types) || types.length === 0) {
            throw Object.assign(new Error("Select at least one data type"), { statusCode: 400 });
        }
        const counts = await replacePartialData(getUserId(request), {
            types,
            words,
            grammarBank,
            sentencePatterns,
        });
        return { ok: true, ...counts };
    });

    // ── Vocabulary CRUD ──
    fastify.get("/vocabulary", async (request) => {
        const userId = await resolveReadUserId(request.session);
        if (request.query.page || request.query.pageSize) {
            const result = await queryVocabularies(userId, {
                page: request.query.page,
                pageSize: request.query.pageSize,
                sortKey: request.query.sortKey,
                sortDir: request.query.sortDir,
                filter: request.query.filter,
                search: request.query.q ?? request.query.search,
                importantFirst: request.query.importantFirst === "true",
            });
            return result;
        }
        const data = await fetchAllData(userId);
        return data.vocabularies;
    });

    fastify.post("/vocabulary", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const vocab = await createVocabulary(getUserId(request), request.body);
        return reply.code(201).send(vocab);
    });

    fastify.put("/vocabulary/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = getUserId(request);
        const vocab = await updateVocabulary(userId, request.params.id, request.body);
        return vocab;
    });

    fastify.patch("/vocabulary/:id/flags", { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = getUserId(request);
        const vocab = await patchVocabularyFlags(userId, request.params.id, request.body ?? {});
        return vocab;
    });

    fastify.delete("/vocabulary/:id", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        await deleteVocabulary(getUserId(request), request.params.id);
        return { ok: true };
    });

    // ── Grammar CRUD ──
    fastify.get("/grammar", async (request) => {
        const userId = await resolveReadUserId(request.session);
        const data = await fetchAllData(userId);
        return data.grammarBank;
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

    // ── Sentence patterns CRUD ──
    fastify.get("/sentence-patterns", async (request) => {
        const userId = await resolveReadUserId(request.session);
        const data = await fetchAllData(userId);
        return data.sentencePatterns;
    });

    fastify.post("/sentence-patterns", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const sentence = await createSentence(getUserId(request), request.body);
        return reply.code(201).send(sentence);
    });

    fastify.put("/sentence-patterns/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const sentence = await updateSentence(getUserId(request), request.params.id, request.body);
        return sentence;
    });

    fastify.delete("/sentence-patterns/:id", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        await deleteSentence(getUserId(request), request.params.id);
        return { ok: true };
    });

    // ── Han Characters CRUD ──
    fastify.get("/han-characters", async (request) => {
        const userId = await resolveReadUserId(request.session);
        if (request.query.page || request.query.pageSize) {
            // Simple paginated search via Prisma
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
                prisma.hanCharacter.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                }),
                prisma.hanCharacter.count({ where }),
            ]);
            return { items: items.map(rowToHanCharacter), total, page, pageSize };
        }
        const data = await fetchAllData(userId);
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

    fastify.patch("/han-characters/:id/flags", { preHandler: [requireAuth] }, async (request, reply) => {
        const char = await patchHanCharFlags(getUserId(request), request.params.id, request.body ?? {});
        return char;
    });

    fastify.delete("/han-characters/:id", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        await deleteHanChar(getUserId(request), request.params.id);
        return { ok: true };
    });

    // ── Radicals (214 bộ thủ) ──
    fastify.get("/radicals", async () => {
        const { prisma } = await import("../lib/prisma.js");
        const radicals = await prisma.radical.findMany({ orderBy: { number: "asc" } });
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

    // ── Backfill Traditional/Simplified variants using OpenCC + vocabulary pairs ──
    fastify.post(
        "/data/backfill-han-char-variants",
        { preHandler: [requireAuth, requireAppAdmin] },
        async (request, reply) => {
            const { prisma } = await import("../lib/prisma.js");
            const { randomUUID } = await import("crypto");
            const OpenCC = await import("opencc-js");

            const toSimp = OpenCC.Converter({ from: "hk", to: "cn" });
            const toTrad = OpenCC.Converter({ from: "cn", to: "hk" });

            // Step 1: Build variant map from vocabularies
            const vocabs = await prisma.vocabulary.findMany({
                select: { hanTraditional: true, hanSimplified: true },
            });
            const HAN = /\p{Script=Han}/u;
            const vocabVariantMap = new Map(); // char → { trad, simp }

            for (const v of vocabs) {
                const tc = [...(v.hanTraditional ?? "")];
                const sc = [...(v.hanSimplified ?? "")];
                if (tc.length === sc.length && tc.length > 0) {
                    for (let i = 0; i < tc.length; i++) {
                        if (!HAN.test(tc[i]) && !HAN.test(sc[i])) continue;
                        if (tc[i] === sc[i]) continue;
                        // Both directions
                        if (!vocabVariantMap.has(tc[i])) vocabVariantMap.set(tc[i], { trad: tc[i], simp: sc[i] });
                        if (!vocabVariantMap.has(sc[i])) vocabVariantMap.set(sc[i], { trad: tc[i], simp: sc[i] });
                    }
                }
            }

            // Step 2: Get all han characters
            const allChars = await prisma.hanCharacter.findMany({
                select: {
                    id: true,
                    hanSimplified: true,
                    hanTraditional: true,
                    pinyin: true,
                    jyutping: true,
                    sinoVietnamese: true,
                    hskLevel: true,
                    searchKey: true,
                },
            });

            // Step 3: Determine correct trad/simp for each character
            // Use OpenCC as canonical source for traditional form
            const canonicalMap = new Map(); // canonicalTrad → [chars]

            for (const ch of allChars) {
                const key = ch.hanSimplified || ch.hanTraditional || "";
                if (!key) continue;

                let trad = ch.hanTraditional || key;
                // Không ép simp = key — single-form (không có simplified riêng) giữ undefined
                let simp = ch.hanSimplified || undefined;

                // Use OpenCC to get canonical traditional from simplified
                const ccTrad = simp ? toTrad(simp) : null;
                if (ccTrad && ccTrad !== simp) {
                    trad = ccTrad;
                }
                // Don't use toSimp(trad) — it can return wrong results for variant chars like隂

                // Vocabulary map can provide the pair if OpenCC didn't help
                const vocabVar = vocabVariantMap.get(key);
                if (vocabVar) {
                    if (trad === key || trad === simp || !trad) trad = vocabVar.trad;
                    if (!simp) simp = vocabVar.simp;
                }

                // Group by traditional form
                if (!canonicalMap.has(trad)) canonicalMap.set(trad, []);
                canonicalMap.get(trad).push({ ...ch, resolvedTrad: trad, resolvedSimp: simp });
            }

            // Step 4: Merge duplicates and update variants
            let updated = 0;
            let merged = 0;
            let same = 0;
            let skipped = 0;
            const mergedDetails = [];
            const updatedDetails = [];

            for (const [trad, group] of canonicalMap) {
                if (group.length > 1) {
                    // Duplicates found — merge into the one with most data
                    const score = (h) => {
                        let s = 0;
                        const py = Array.isArray(h.pinyin) ? h.pinyin.length : h.pinyin ? 1 : 0;
                        const jp = Array.isArray(h.jyutping) ? h.jyutping.length : h.jyutping ? 1 : 0;
                        const sv = Array.isArray(h.sinoVietnamese) ? h.sinoVietnamese.length : h.sinoVietnamese ? 1 : 0;
                        s += py + jp + sv;
                        if (h.hanTraditional) s += 2;
                        if (h.hskLevel) s += 1;
                        return s;
                    };

                    group.sort((a, b) => score(b) - score(a));
                    const keeper = group[0];
                    const dupes = group.slice(1);

                    // Merge readings from duplicates into keeper
                    const allPy = new Set(Array.isArray(keeper.pinyin) ? keeper.pinyin : []);
                    const allJp = new Set(Array.isArray(keeper.jyutping) ? keeper.jyutping : []);
                    const allSv = new Set(Array.isArray(keeper.sinoVietnamese) ? keeper.sinoVietnamese : []);

                    for (const d of dupes) {
                        const dPy = Array.isArray(d.pinyin) ? d.pinyin : d.pinyin ? [d.pinyin] : [];
                        const dJp = Array.isArray(d.jyutping) ? d.jyutping : d.jyutping ? [d.jyutping] : [];
                        const dSv = Array.isArray(d.sinoVietnamese)
                            ? d.sinoVietnamese
                            : d.sinoVietnamese
                              ? [d.sinoVietnamese]
                              : [];
                        for (const p of dPy) allPy.add(p);
                        for (const j of dJp) allJp.add(j);
                        for (const s of dSv) allSv.add(s);
                    }

                    // Update keeper
                    const simp = keeper.resolvedSimp;
                    await prisma.hanCharacter.update({
                        where: { id: keeper.id },
                        data: {
                            hanTraditional: trad,
                            hanSimplified: simp,
                            pinyin: [...allPy].sort(),
                            jyutping: [...allJp].sort(),
                            sinoVietnamese: [...allSv].sort(),
                        },
                    });

                    // Delete duplicates
                    for (const d of dupes) {
                        // Re-link vocabulary_characters to keeper before deleting
                        await prisma.vocabularyCharacter.updateMany({
                            where: { hanCharacterId: d.id },
                            data: { hanCharacterId: keeper.id },
                        });
                        await prisma.hanCharacter.delete({ where: { id: d.id } });
                    }

                    merged += dupes.length;
                    mergedDetails.push(`${trad}/${simp} (${dupes.length} dupes merged)`);
                } else {
                    // Single character — just update variant
                    const ch = group[0];
                    const simp = ch.resolvedSimp;
                    const needsUpdate = ch.hanTraditional !== trad || (ch.hanSimplified ?? null) !== (simp ?? null);

                    if (needsUpdate) {
                        await prisma.hanCharacter.update({
                            where: { id: ch.id },
                            data: { hanTraditional: trad, hanSimplified: simp },
                        });
                        if (trad !== simp) {
                            updated++;
                            updatedDetails.push(`${trad}/${simp}`);
                        } else {
                            same++;
                        }
                    } else {
                        skipped++;
                    }
                }
            }

            return {
                updated,
                merged,
                same,
                skipped,
                total: allChars.length,
                mergedSample: mergedDetails.slice(0, 20),
                updatedSample: updatedDetails.slice(0, 20),
            };
        },
    );

    // ── Sync all han characters + their details into han_characters ──
    // Preview: tính trước những hán tự sẽ tạo mới / cập nhật (không ghi DB).
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

    // Bắt đầu job sync (trả jobId ngay, chạy background).
    fastify.post("/data/sync-han-characters", { preHandler: [requireAuth, requireAppAdmin] }, async (request) => {
        const { createSyncJob, runSyncJob } = await import("../lib/hanCharSyncJob.js");
        const mode = request.body?.mode === "full" ? "full" : "fast";
        const job = createSyncJob();
        runSyncJob(job.id, mode); // fire-and-forget
        return { ok: true, jobId: job.id, mode };
    });

    // Poll tiến trình job sync.
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

    // ── Sync stroke count (HanCharacter.strokeCount) ──
    // Preview: tính trước những ký tự sẽ fill / đổi (không ghi DB).
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

    // Bắt đầu job sync stroke count (trả jobId ngay, chạy background).
    fastify.post("/data/sync-han-char-strokes", { preHandler: [requireAuth, requireAppAdmin] }, async (request) => {
        const { createStrokeJob, runStrokeJob } = await import("../lib/hanCharStrokeJob.js");
        const mode = request.body?.mode === "full" ? "full" : "fast";
        const job = createStrokeJob();
        runStrokeJob(job.id, mode); // fire-and-forget
        return { ok: true, jobId: job.id, mode };
    });

    // Poll tiến trình job sync stroke count.
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
        const userId = getUserId(request);
        const decks = await getFlashcardDecks(userId);
        return decks;
    });

    fastify.get("/flashcard-decks/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = getUserId(request);
        const deck = await getFlashcardDeck(userId, request.params.id);
        if (!deck) return reply.code(404).send({ error: "Deck not found" });
        return deck;
    });

    fastify.post("/flashcard-decks", { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = getUserId(request);
        const deck = await createFlashcardDeck(userId, request.body ?? {});
        return reply.code(201).send(deck);
    });

    fastify.put("/flashcard-decks/:id", { preHandler: [requireAuth] }, async (request) => {
        const userId = getUserId(request);
        const deck = await updateFlashcardDeck(userId, request.params.id, request.body ?? {});
        return deck;
    });

    fastify.delete("/flashcard-decks/:id", { preHandler: [requireAuth] }, async (request) => {
        const userId = getUserId(request);
        await deleteFlashcardDeck(userId, request.params.id);
        return { ok: true };
    });

    fastify.get("/flashcard-decks/:id/vocabularies", { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = getUserId(request);
        try {
            const vocabs = await getDeckVocabularies(userId, request.params.id);
            return vocabs;
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            throw err;
        }
    });

    fastify.post("/flashcard-decks/:id/vocabularies", { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = getUserId(request);
        const { vocabularyId } = request.body ?? {};
        if (!vocabularyId) return reply.code(400).send({ error: "vocabularyId is required" });
        try {
            const vocab = await addVocabularyToDeck(userId, request.params.id, vocabularyId);
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
            const userId = getUserId(request);
            try {
                await removeVocabularyFromDeck(userId, request.params.deckId, request.params.vocabularyId);
                return { ok: true };
            } catch (err) {
                if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
                throw err;
            }
        },
    );

    // ── Vocabulary Sets (custom user groups) ──

    fastify.get("/vocabulary-sets", { preHandler: [requireAuth] }, async (request) => {
        const userId = getUserId(request);
        return getVocabularySets(userId);
    });

    fastify.post("/vocabulary-sets", { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = getUserId(request);
        const set = await createVocabularySet(userId, request.body ?? {});
        return reply.code(201).send(set);
    });

    fastify.put("/vocabulary-sets/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = getUserId(request);
        try {
            const set = await updateVocabularySet(userId, request.params.id, request.body ?? {});
            return set;
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            throw err;
        }
    });

    fastify.delete("/vocabulary-sets/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = getUserId(request);
        try {
            await deleteVocabularySet(userId, request.params.id);
            return { ok: true };
        } catch (err) {
            if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
            throw err;
        }
    });

    fastify.post("/vocabulary-sets/:id/vocabularies", { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = getUserId(request);
        const { vocabularyId } = request.body ?? {};
        if (!vocabularyId) return reply.code(400).send({ error: "vocabularyId is required" });
        try {
            const res = await addVocabularyToSet(userId, request.params.id, vocabularyId);
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
            const userId = getUserId(request);
            try {
                await removeVocabularyFromSet(userId, request.params.id, request.params.vocabularyId);
                return { ok: true };
            } catch (err) {
                if (err.statusCode === 404) return reply.code(404).send({ error: err.message });
                throw err;
            }
        },
    );
}
