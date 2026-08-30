import { useEffect, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { cn } from "../lib/cn.js";
import { api } from "../lib/api.js";
import { speakCantonese, speak } from "../lib/speech.js";
import { Button } from "./shadcn/button.jsx";

// Singleton — chỉ phát 1 audio tại 1 thời điểm (bấm nút khác sẽ dừng nút trước),
// đồng bộ với behavior của các bảng phiên âm (Pinyin/Jyutping dialog).
let activeAudio = null;
export function playAudioUrl(url) {
    if (!url) return;
    if (activeAudio) {
        activeAudio.pause();
        activeAudio = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
    const audio = new Audio(url);
    activeAudio = audio;
    const release = () => {
        if (activeAudio === audio) activeAudio = null;
    };
    audio.onended = release;
    audio.onerror = release;
    audio.play().catch(release);
}

/**
 * Nút phát audio cho hán tự.
 * - `cantoneseText` → gTTS yue (server, cache R2) → fallback giọng Windows zh-HK (Tracy).
 * - `mandarinText` → gTTS zh-CN (server, cache R2) → fallback giọng Windows Mandarin (zh-CN).
 * - Không có 2 prop trên → phát `url` như cũ (nút audio thường, ví dụ tiếng Anh).
 * - KHÔNG render gì khi cả `url` và 2 prop đều trống.
 * @param {{url?: string|null, cantoneseText?: string|null, mandarinText?: string|null, title?: string, className?: string, size?: "xs2"|"xs"|"lg"}} props
 */
export function AudioPlayButton({ url, cantoneseText, mandarinText, title, className, size = "xs" }) {
    const [loading, setLoading] = useState(false);
    // Dừng audio nếu button bị unmount (đóng trang/đổi từ) giữa chừng.
    useEffect(() => {
        return () => {
            if (activeAudio) {
                activeAudio.pause();
                activeAudio = null;
            }
        };
    }, []);

    const handleClick = () => {
        const cText = String(cantoneseText ?? "").trim();
        const mText = String(mandarinText ?? "").trim();
        if (cText) {
            // 1) gTTS yue (server, cache R2) → 2) fallback giọng Windows Tracy.
            setLoading(true);
            api.tts(cText, "yue")
                .then((res) => {
                    if (res?.url) playAudioUrl(res.url);
                    else speakCantonese(cText);
                })
                .catch(() => speakCantonese(cText))
                .finally(() => setLoading(false));
            return;
        }
        if (mText) {
            // 1) gTTS zh-CN (server, cache R2) → 2) fallback giọng Windows Mandarin.
            setLoading(true);
            api.tts(mText, "zh-CN")
                .then((res) => {
                    if (res?.url) playAudioUrl(res.url);
                    else speak(mText);
                })
                .catch(() => speak(mText))
                .finally(() => setLoading(false));
            return;
        }
        if (url) playAudioUrl(url);
    };

    if (!url && !cantoneseText && !mandarinText) return null;
    // "lg" = GẤP ĐÔI (48px nút / 24px icon) — hero hán tự.
    // "xs2" = 20px nút / 12px icon — example/nghĩa: không ép hàng cao hơn text (20px).
    const sizeClass =
        size === "lg"
            ? "size-12! [&_svg:not([class*='size-'])]:size-6!"
            : size === "xs2"
              ? "size-5! [&_svg:not([class*='size-'])]:size-3!"
              : null;
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn("shrink-0 text-foreground hover:bg-primary/10 hover:text-foreground", sizeClass, className)}
            onClick={handleClick}
            disabled={loading}
            aria-label={title}
            title={title}
        >
            {loading ? <Loader2 className="animate-spin" /> : <Volume2 />}
        </Button>
    );
}
