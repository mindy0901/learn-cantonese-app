import { create } from "zustand";
import { persist } from "zustand/middleware";

// Tùy chọn hiển thị chi tiết từ vựng — persist localStorage (frontend-only, không ghi DB).
export const useDisplaySettings = create(
    persist(
        (set) => ({
            // Nghĩa phụ trong khối meaning: Eng + gloss (zh/yue)
            showMeaningEn: true,
            showMeaningGloss: true,
            // Nghĩa phụ Eng trong ví dụ
            showExampleEn: true,
            // Ví dụ mở sẵn mặc định (false = gấp gọn như cũ)
            examplesDefaultOpen: false,
            // View mode 2 cột: hiện/ẩn cột Mandarin (khi từ Cantonese có data Mandarin) (2026-08-28)
            showMandarinCol: true,
            toggleMeaningEn: () => set((s) => ({ showMeaningEn: !s.showMeaningEn })),
            toggleMeaningGloss: () => set((s) => ({ showMeaningGloss: !s.showMeaningGloss })),
            toggleExampleEn: () => set((s) => ({ showExampleEn: !s.showExampleEn })),
            toggleExamplesDefaultOpen: () => set((s) => ({ examplesDefaultOpen: !s.examplesDefaultOpen })),
            toggleMandarinCol: () => set((s) => ({ showMandarinCol: !s.showMandarinCol })),
        }),
        { name: "display-settings" },
    ),
);
