import { normalizeSearchText } from "./searchNormalize.js";

/**
 * Extract unique CJK characters from a string.
 */
function extractChars(text) {
    if (!text) return [];
    const chars = new Set();
    for (const ch of text) {
        if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(ch)) chars.add(ch);
    }
    return [...chars];
}

/**
 * Build word-han_character relationships for a given word.
 * Finds all han_characters whose hanSimplified or hanTraditional
 * matches any character in the word's hanTraditional or hanSimplified fields.
 */
export async function syncWordHanRelations(db, userId, word) {
    const trad = (word.hanTraditional ?? "").trim();
    const simp = (word.hanSimplified ?? "").trim();
    const allChars = [...new Set([...extractChars(trad), ...extractChars(simp)])];
    if (allChars.length === 0) return { added: 0, removed: 0 };

    // Find matching han_characters
    const { data: hanChars } = await db
        .from("han_characters")
        .select("id, han_simplified, han_traditional")
        .eq("user_id", userId)
        .in("han_simplified", allChars);

    // Also check han_traditional column for matches
    const foundIds = new Set(hanChars?.map((h) => h.id) ?? []);
    const { data: tradMatches } = await db
        .from("han_characters")
        .select("id, han_traditional")
        .eq("user_id", userId)
        .in("han_traditional", allChars)
        .not("han_traditional", "is", null);

    for (const m of tradMatches ?? []) {
        foundIds.add(m.id);
    }

    const hanCharIds = [...foundIds];

    // Delete existing relations for this word
    await db.from("word_han_characters").delete().eq("word_id", word.id);

    // Insert new relations
    if (hanCharIds.length > 0) {
        const rows = hanCharIds.map((hid) => ({
            word_id: word.id,
            han_character_id: hid,
        }));
        await db.from("word_han_characters").insert(rows);
    }

    return { added: hanCharIds.length, removed: 0 };
}

/**
 * Backfill all existing word-han relationships.
 */
export async function backfillWordHanRelations(db, userId) {
    // Fetch all words
    const allWords = [];
    let from = 0;
    while (true) {
        const { data } = await db
            .from("words")
            .select("id, han_traditional, han_simplified, user_id")
            .eq("user_id", userId)
            .range(from, from + 999);
        if (!data?.length) break;
        allWords.push(...data);
        from += 1000;
    }

    let added = 0;
    for (const word of allWords) {
        const result = await syncWordHanRelations(db, userId, word);
        added += result.added;
    }

    return { total: allWords.length, added };
}

/**
 * Get all han characters related to a word.
 */
export async function getHanCharsForWord(db, userId, wordId) {
    const { data, error } = await db
        .from("word_han_characters")
        .select("han_character_id, han_characters(*)")
        .eq("word_id", wordId)
        .eq("han_characters.user_id", userId);

    if (error) {
        const msg = String(error?.message ?? "");
        if (/relation.*does not exist|PGRST205/i.test(msg)) return [];
        throw error;
    }

    return (data ?? []).map((r) => r.han_characters).filter(Boolean);
}

/**
 * Get all words containing a given han character.
 */
export async function getWordsForHanChar(db, userId, hanCharId) {
    const { data, error } = await db
        .from("word_han_characters")
        .select("word_id, words(*)")
        .eq("han_character_id", hanCharId)
        .eq("words.user_id", userId);

    if (error) {
        const msg = String(error?.message ?? "");
        if (/relation.*does not exist|PGRST205/i.test(msg)) return [];
        throw error;
    }

    return (data ?? []).map((r) => r.words).filter(Boolean);
}
