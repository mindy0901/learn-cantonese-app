import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./shadcn/dialog.jsx";
import { ToggleGroup, ToggleGroupItem } from "./shadcn/toggle-group.jsx";
import {
    PINYIN_INITIAL_DESC,
    PINYIN_TONES,
    addTone,
    hasPinyinAudio,
    pinyinAudioUrl,
    pinyinCdnAudioUrl,
} from "../data/pinyinTones.js";
import { speak } from "../lib/speech.js";
import { useLocale } from "../store/localeStore.js";

export function PinyinSyllableDialog({ syllable, initial, final, onClose }) {
    const { t } = useLocale();
    const [tone, setTone] = useState(1);
    const audioRef = useRef(null);

    // Phát âm một thanh ngay lập tức (click-to-speech) — ngắt phát trước nếu đang chạy.
    // Thứ tự nguồn: local (đã tải về) → CDN Yabla → giọng đọc (speechSynthesis).
    const playTone = (tone) => {
        audioRef.current?.pause();
        window.speechSynthesis?.cancel();

        const urls = [pinyinAudioUrl(syllable, tone), pinyinCdnAudioUrl(syllable, tone)];
        const text = tone >= 1 && tone <= 4 ? addTone(syllable, tone) : syllable; // fallback voice
        let index = 0;
        let fallbackDone = false;
        const doFallback = () => {
            if (fallbackDone) return;
            fallbackDone = true;
            speak(text); // voice Google khi không có file MP3
        };

        const playNext = () => {
            const url = urls[index++];
            if (!url) return doFallback();
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => {
                fallbackDone = true;
            };
            audio.onerror = () => playNext();
            audio.play().catch(() => playNext());
        };
        playNext();
    };

    // Dừng âm thanh khi đóng popup
    useEffect(() => {
        return () => {
            audioRef.current?.pause();
            window.speechSynthesis?.cancel();
        };
    }, []);

    const desc = PINYIN_INITIAL_DESC[initial] ?? "";

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-center text-3xl font-bold">{syllable}</DialogTitle>
                    <DialogDescription className="text-center">
                        {t.pinyin.initialLabel}: {initial} · {t.pinyin.finalLabel}: {final}
                    </DialogDescription>
                </DialogHeader>

                {desc && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{desc}</p>}

                <ToggleGroup
                    value={String(tone)}
                    onValueChange={(value) => {
                        if (value != null) setTone(Number(value));
                    }}
                    className="w-full"
                >
                    {PINYIN_TONES.map((tn) => {
                        const hasAudio = hasPinyinAudio(syllable, tn);
                        return (
                            <ToggleGroupItem
                                key={tn}
                                value={String(tn)}
                                variant="outline"
                                className="h-auto flex-1 flex-col gap-0.5 px-1 py-2"
                                title={!hasAudio ? t.pinyin.noAudio : undefined}
                                onClick={() => playTone(tn)}
                            >
                                <span className="text-base font-semibold">{addTone(syllable, tn)}</span>
                                <span className="text-[0.6875rem] text-muted-foreground">
                                    {tn === 5 ? t.pinyin.neutralLabel : t.pinyin.tones[tn - 1]}
                                </span>
                            </ToggleGroupItem>
                        );
                    })}
                </ToggleGroup>
            </DialogContent>
        </Dialog>
    );
}
