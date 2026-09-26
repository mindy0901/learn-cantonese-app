/**
 * Copy text vào clipboard — dùng chung cho flashcard (icon copy hán tự) và trang detail.
 * Ưu tiên Clipboard API; fallback `execCommand("copy")` cho non-secure context / trình duyệt cũ.
 * Trả về Promise<boolean> (true = đã copy thành công) — KHÔNG throw.
 */
export async function copyToClipboard(text) {
    const value = String(text ?? "");
    if (!value) return false;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch {
        // Rơi xuống fallback bên dưới.
    }

    try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}
