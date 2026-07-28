import {
    fetchAppData,
    fetchAllData,
    fetchSentencePatternRows,
    grammarToRow,
    hanCharacterToRow,
    lessonToRow,
    replacePartialData,
    rowToGrammar,
    rowToHanCharacter,
    rowToLesson,
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
    createLesson,
    updateLesson,
    deleteLesson,
    createHanChar,
    updateHanChar,
    patchHanCharFlags,
    deleteHanChar,
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
            types = ["words", "grammar", "lessons"],
            words = [],
            grammarBank = [],
            lessons = [],
            sentencePatterns = [],
        } = request.body ?? {};
        if (!Array.isArray(types) || types.length === 0) {
            throw Object.assign(new Error("Select at least one data type"), { statusCode: 400 });
        }
        const counts = await replacePartialData(getUserId(request), {
            types,
            words,
            grammarBank,
            lessons,
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

    // ── Lessons CRUD ──
    fastify.get("/lessons", async (request) => {
        const userId = await resolveReadUserId(request.session);
        const data = await fetchAllData(userId);
        return data.lessons;
    });

    fastify.post("/lessons", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const lesson = await createLesson(getUserId(request), request.body);
        return reply.code(201).send(lesson);
    });

    fastify.put("/lessons/:id", { preHandler: [requireAuth] }, async (request, reply) => {
        const lesson = await updateLesson(getUserId(request), request.params.id, request.body);
        return lesson;
    });

    fastify.delete("/lessons/:id", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        await deleteLesson(getUserId(request), request.params.id);
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

    // ── Sync han characters from vocabularies ──
    fastify.post("/han-characters/sync", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const { prisma } = await import("../lib/prisma.js");
        const { randomUUID } = await import("crypto");

        // Get all vocabularies — include sinoVietnamese
        const vocabs = await prisma.vocabulary.findMany({
            select: { hanTraditional: true, pinyin: true, jyutping: true, hskLevel: true, sinoVietnamese: true },
        });

        // Extract unique Chinese characters with their readings
        const charMap = new Map();
        const HAN = /\p{Script=Han}/u;

        for (const v of vocabs) {
            const text = v.hanTraditional ?? "";
            const chars = [...text].filter((ch) => HAN.test(ch));
            const charCount = chars.length;

            // Split pinyin/jyutping/sinoVietnamese by spaces to match characters
            const pyParts = (v.pinyin ?? "").split(/[\s,/、]+/).filter(Boolean);
            const jpParts = (v.jyutping ?? "").split(/\s+/).filter(Boolean);
            const svPartsRaw = (v.sinoVietnamese ?? "").split(/\s+/).filter(Boolean);
            const svParts = svPartsRaw.filter((t) => t !== "|" && t !== "/" && t !== "—" && t !== "·" && t !== "•");
            // Only use SV when tokens align cleanly:
            // - Single-char word: exactly 1 SV token (avoid incomplete hanTraditional)
            // - Multi-char word: SV token count is a multiple of char count
            const svAligned =
                svParts.length > 0 &&
                ((charCount === 1 && svParts.length === 1) || (charCount > 1 && svParts.length % charCount === 0));

            for (let i = 0; i < chars.length; i++) {
                const ch = chars[i];
                if (!charMap.has(ch)) {
                    charMap.set(ch, {
                        pinyin: new Set(),
                        jyutping: new Set(),
                        hskLevels: new Set(),
                        sinoVietnamese: new Set(),
                    });
                }
                const entry = charMap.get(ch);
                if (pyParts[i]) entry.pinyin.add(pyParts[i]);
                if (jpParts[i]) entry.jyutping.add(jpParts[i]);

                // Collect sinoVietnamese for this character position across all variants
                if (svAligned) {
                    for (let v = i; v < svParts.length; v += charCount) {
                        entry.sinoVietnamese.add(svParts[v]);
                    }
                }

                if (v.hskLevel) entry.hskLevels.add(v.hskLevel);
            }
        }

        // Get existing han characters
        const existing = await prisma.hanCharacter.findMany({
            select: {
                hanSimplified: true,
                hanTraditional: true,
                id: true,
                pinyin: true,
                jyutping: true,
                hskLevel: true,
                sinoVietnamese: true,
            },
        });
        const existingBySimp = new Map();
        const existingByTrad = new Map();
        for (const h of existing) {
            if (h.hanSimplified) existingBySimp.set(h.hanSimplified, h);
            if (h.hanTraditional) existingByTrad.set(h.hanTraditional, h);
        }

        let created = 0;
        let updated = 0;
        let svUpdated = 0;

        for (const [ch, readings] of charMap) {
            const existingChar = existingBySimp.get(ch) || existingByTrad.get(ch);

            const pyArr = [...readings.pinyin].sort();
            const jpArr = [...readings.jyutping].sort();
            const svArr = [...readings.sinoVietnamese].sort();
            const hsk = [...readings.hskLevels].sort().join(" ") || undefined;

            if (existingChar) {
                // Merge readings — including sinoVietnamese
                const existingSv = Array.isArray(existingChar.sinoVietnamese)
                    ? existingChar.sinoVietnamese
                    : existingChar.sinoVietnamese
                      ? [existingChar.sinoVietnamese]
                      : [];
                const mergedSv = [...new Set([...existingSv, ...svArr])].sort();

                const mergedPy = [
                    ...new Set([...(Array.isArray(existingChar.pinyin) ? existingChar.pinyin : []), ...pyArr]),
                ].sort();
                const mergedJp = [
                    ...new Set([...(Array.isArray(existingChar.jyutping) ? existingChar.jyutping : []), ...jpArr]),
                ].sort();
                const mergedHsk = existingChar.hskLevel || hsk;

                const hasNewPy = mergedPy.length > (existingChar.pinyin?.length || 0);
                const hasNewJp = mergedJp.length > (existingChar.jyutping?.length || 0);
                const hasNewSv = mergedSv.length > existingSv.length;
                const hasNewHsk = !existingChar.hskLevel && hsk;

                if (hasNewPy || hasNewJp || hasNewSv || hasNewHsk) {
                    await prisma.hanCharacter.update({
                        where: { id: existingChar.id },
                        data: {
                            pinyin: mergedPy,
                            jyutping: mergedJp,
                            hskLevel: mergedHsk,
                            sinoVietnamese: mergedSv,
                        },
                    });
                    updated++;
                    if (hasNewSv) svUpdated++;
                }
            } else {
                await prisma.hanCharacter.create({
                    data: {
                        id: randomUUID(),
                        hanSimplified: ch,
                        hanTraditional: ch,
                        pinyin: pyArr,
                        jyutping: jpArr,
                        hskLevel: hsk,
                        sinoVietnamese: svArr,
                    },
                });
                created++;
            }
        }

        return { created, updated, svUpdated, total: charMap.size };
    });

    // ── Backfill han character Sino-Vietnamese from HSK data ──
    fastify.post(
        "/data/backfill-han-char-sinovietnamese",
        { preHandler: [requireAuth, requireAppAdmin] },
        async (request, reply) => {
            const { prisma } = await import("../lib/prisma.js");
            const { readFileSync } = await import("fs");
            const { resolve, dirname } = await import("path");
            const { fileURLToPath } = await import("url");

            const __dirname = dirname(fileURLToPath(import.meta.url));
            const hskPath = resolve(__dirname, "..", "hsk_full.json");
            const raw = readFileSync(hskPath, "utf-8");
            const hskEntries = JSON.parse(raw);

            // Build map: character → sino_vietnamese readings
            const svMap = new Map();
            for (const entry of hskEntries) {
                const chars = [...(entry.character || "")];
                if (chars.length !== 1) continue;
                const ch = chars[0];
                const prons = entry.pronunciations || [];
                const svReadings = prons.map((p) => (p.sino_vietnamese || "").trim()).filter(Boolean);
                if (svReadings.length > 0) {
                    // Also map traditional/simplified variants
                    const trad = (entry.forms?.traditional || "").trim();
                    const simp = (entry.forms?.simplified || "").trim();
                    const keys = [ch];
                    if (trad && trad !== ch) keys.push(trad);
                    if (simp && simp !== ch && simp !== trad) keys.push(simp);

                    for (const key of keys) {
                        if (!svMap.has(key)) {
                            svMap.set(key, svReadings);
                        }
                    }
                }
            }

            // Get all han characters with empty sinoVietnamese
            const chars = await prisma.hanCharacter.findMany({
                where: { sinoVietnamese: { isEmpty: true } },
                select: { id: true, hanSimplified: true, hanTraditional: true },
            });

            let updated = 0;
            let skipped = 0;

            for (const ch of chars) {
                const lookupKey = ch.hanSimplified || ch.hanTraditional || "";
                const sv = svMap.get(lookupKey);
                if (sv && sv.length > 0) {
                    await prisma.hanCharacter.update({
                        where: { id: ch.id },
                        data: { sinoVietnamese: sv },
                    });
                    updated++;
                } else {
                    skipped++;
                }
            }

            return { updated, skipped, total: chars.length };
        },
    );

    // ── Backfill pinyin for all vocabulary ──
    fastify.post("/data/backfill-pinyin", { preHandler: [requireAuth, requireAppAdmin] }, async (request, reply) => {
        const { prisma } = await import("../lib/prisma.js");
        const { pinyin } = await import("pinyin-pro");
        const { ensureHanVariants } = await import("../lib/opencc.js");

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
            const { hanSimplified } = ensureHanVariants({
                hanTraditional: v.hanTraditional,
                hanSimplified: v.hanSimplified,
            });
            const source = hanSimplified.trim();
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
        const { toJyutping } = await import("../lib/jyutping.js");

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

            const jp = toJyutping(source);
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
}
