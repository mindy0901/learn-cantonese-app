import { useEffect } from "react";
import { Volume2 } from "lucide-react";
import { cn } from "../lib/cn.js";
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
 * Nút phát audio từ URL (R2/MP3). KHÔNG render gì khi không có `url` — chỉ hiện
 * icon audio cho từ/câu thật sự có audio.
 * @param {{url?: string|null, title?: string, className?: string, size?: "xs2"|"xs"|"lg"}} props
 */
export function AudioPlayButton({ url, title, className, size = "xs" }) {
    // Dừng audio nếu button bị unmount (đóng trang/đổi từ) giữa chừng.
    useEffect(() => {
        return () => {
            if (activeAudio) {
                activeAudio.pause();
                activeAudio = null;
            }
        };
    }, []);

    if (!url) return null;
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
            onClick={() => playAudioUrl(url)}
            aria-label={title}
            title={title}
        >
            <Volume2 />
        </Button>
    );
}
