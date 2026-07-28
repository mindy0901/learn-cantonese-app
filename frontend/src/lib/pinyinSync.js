import { resolvePinyin, pinyinSourceHan } from "./pinyin.js";
import { normVocabularyField } from "./wordNormalize.js";

/** Preview pinyin updates for all vocabulary (OpenCC simplified → pinyin-pro). */
export function previewPinyinSync(vocabularies) {
    const updates = [];

    for (const vocab of vocabularies ?? []) {
        const sourceHan = pinyinSourceHan(vocab);
        if (!sourceHan) continue;

        const nextPinyin = resolvePinyin(vocab);
        if (!nextPinyin) continue;

        const prevPinyin = String(vocab.pinyin ?? "").trim();
        if (normVocabularyField(prevPinyin) === normVocabularyField(nextPinyin)) continue;

        updates.push({
            id: vocab.id,
            hanTraditional: String(vocab.hanTraditional ?? vocab.hanTrad ?? vocab.han ?? "").trim(),
            hanSimplified: sourceHan,
            prevPinyin,
            nextPinyin,
            popularity: vocab.popularity,
        });
    }

    return { updates, vocabCount: vocabularies?.length ?? 0 };
}

export function formatPinyin(value) {
    const text = String(value ?? "").trim();
    return text || "—";
}
