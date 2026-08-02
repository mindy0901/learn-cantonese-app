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
        return {
            ...result,
            items: result.items.map(rowToVocabulary),
        };
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
            return { ...result, items: result.items.map(rowToVocabulary) };
        }
        const data = await fetchAllData(userId);
        return data.words;
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

    // ── Backfill pinyin for all vocabulary ──
    fastify.post("/data/backfill-pinyin", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const { prisma } = await import("../lib/prisma.js");
        const { pinyin } = await import("pinyin-pro");

        // Only fill rows that have null or empty pinyin — never overwrite existing data
        const vocabs = await prisma.vocabulary.findMany({
            where: {
                OR: [{ pinyin: null }, { pinyin: "" }],
            },
            select: { id: true, hanTraditional: true, hanSimplified: true },
        });

        let updated = 0;
        const skipped = [];
        for (const v of vocabs) {
            const source = (v.hanSimplified || v.hanTraditional || "").trim();
            if (!source) {
                skipped.push(v.hanTraditional);
                continue;
            }

            const py = pinyin(source, { toneType: "symbol", type: "array" })
                .map((s) => String(s ?? "").trim())
                .filter(Boolean)
                .join(" ");
            if (!py || /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(py)) {
                skipped.push(v.hanTraditional);
                continue;
            }

            await prisma.vocabulary.update({
                where: { id: v.id },
                data: { pinyin: py },
            });
            updated++;
        }

        return { updated, total: vocabs.length, skipped };
    });

    // ── Backfill jyutping for all vocabulary ──
    fastify.post("/data/backfill-jyutping", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const { prisma } = await import("../lib/prisma.js");
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);

        const PYTHON_BIN = "/opt/pycantonese-venv/bin/python3";
        const JYUTPING_SCRIPT = "/app/scripts/jyutping.py";

        const toJyutping = async (text) => {
            try {
                const { stdout } = await execFileAsync(PYTHON_BIN, [JYUTPING_SCRIPT, text], {
                    timeout: 10000,
                });
                return stdout.trim();
            } catch (err) {
                console.error("pycantonese error:", err.message);
                return "";
            }
        };

        // Only fill rows that have null or empty jyutping — never overwrite existing data
        const vocabs = await prisma.vocabulary.findMany({
            where: { OR: [{ jyutping: null }, { jyutping: "" }] },
            select: { id: true, hanTraditional: true },
        });

        let updated = 0;
        const skipped = [];
        for (const v of vocabs) {
            const source = (v.hanTraditional ?? "").trim();
            if (!source) {
                skipped.push(v.hanTraditional);
                continue;
            }

            const jp = await toJyutping(source);
            if (!jp) {
                skipped.push(v.hanTraditional);
                continue;
            }

            await prisma.vocabulary.update({
                where: { id: v.id },
                data: { jyutping: jp },
            });
            updated++;
        }

        return { updated, total: vocabs.length, skipped };
    });

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
}
