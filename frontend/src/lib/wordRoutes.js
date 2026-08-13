export function vocabularyDetailPath(han) {
    return `/vocabulary/${encodeURIComponent(String(han ?? ""))}`;
}
