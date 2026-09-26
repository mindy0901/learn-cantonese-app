import { useRef, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useLanguage } from "../store/appStore.js";
import { OcrScanSection } from "./OcrScanSection.jsx";
import { IconMonitor, IconScan } from "./NavIcons.jsx";
import { Button } from "./shadcn/button.jsx";
import { Spinner } from "./shadcn/spinner.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./shadcn/dialog.jsx";
import { Tabs, TabsList, TabsTrigger } from "./shadcn/tabs.jsx";

/**
 * Modal for OCR scanning ONLY (paste/upload image → suggested vocabulary).
 * Separate from the manual single-word add modal (AddVocabularyPanel).
 */
export function OcrScanPanel({ onClose }) {
    const { t } = useLocale();
    const scanRef = useRef(null);
    const [hasImage, setHasImage] = useState(false);
    // OCR engine: "ocrspace" (cloud, PRIMARY — fallback RapidOCR) or "local" (RapidOCR only).
    const [engine, setEngine] = useState("ocrspace");
    // ⚠️ 2026-09-02: ngôn ngữ quét OCR (cantonese/mandarin) — mặc định theo ngôn ngữ trang đang mở.
    const [lang, setLang] = useState(useLanguage());
    const [scanning, setScanning] = useState(false);
    const [adding, setAdding] = useState(false);
    // Số CỤM chưa có trong kho đang được chọn — do OcrScanSection báo lên (nút "Thêm" ở footer).
    const [selectedCount, setSelectedCount] = useState(0);
    const ocr = t.addWord;

    // ⚠️ 2026-09-02: nhóm switch dùng shadcn Tabs (segmented control chuẩn) — class cho
    // TabsTrigger, active màu theo data-active (Base UI tự set khi được chọn).
    // ⚠️ 2026-09-02: đồng nhất màu primary cho cả switch ngôn ngữ lẫn engine (bỏ amber).
    const switchTriggerClass =
        "px-2 text-xs data-active:!bg-primary data-active:!text-primary-foreground lg:px-3 lg:text-sm";

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-360 gap-0 overflow-hidden p-0 h-[min(75vh,75dvh)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-360">
                <DialogHeader className="h-16 justify-center border-b border-border px-6">
                    <DialogTitle className="text-lg">{ocr.ocrTitle}</DialogTitle>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                    <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-card px-4 py-4">
                        <OcrScanSection
                            ref={scanRef}
                            engine={engine}
                            lang={lang}
                            onScanningChange={setScanning}
                            onAddingChange={setAdding}
                            onImageChange={setHasImage}
                            onSelectionChange={setSelectedCount}
                        />
                    </section>
                </div>

                {/* Scan action bar — replaces the old footer buttons.
                    ⚠️ 2026-09-02: dùng div thường (KHÔNG dùng DialogFooter — base shadcn có
                    `flex-col-reverse sm:flex-row` xung đột layout). Không dùng absolute → mọi nút
                    ĐẨY NHAU. Thứ tự: Chọn ảnh · switch ngôn ngữ · switch engine · Quét (ngoài cùng phải).
                    Mobile xếp dọc (w-full), lg+ hàng ngang (Quét ml-auto về phải). */}
                <div className="relative flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-3 lg:h-16 lg:flex-nowrap lg:px-6 lg:py-0">
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="w-full lg:w-auto lg:flex-none"
                        onClick={() => scanRef.current?.chooseFile()}
                        disabled={scanning || adding}
                    >
                        <IconMonitor size={14} />
                        {ocr.ocrChooseFile}
                    </Button>

                    {/* ⚠️ 2026-09-02: chọn ngôn ngữ quét OCR — cantonese/mandarin (màu + phiên âm theo
                        ngôn ngữ). Dùng shadcn Tabs (segmented switch chuẩn). */}
                    <Tabs value={lang} onValueChange={setLang} className="inline-flex">
                        <TabsList className="rounded-lg border border-primary/40 bg-primary/10 p-1">
                            <TabsTrigger value="cantonese" className={switchTriggerClass} disabled={scanning || adding}>
                                {t.nav.cantoneseGroup}
                            </TabsTrigger>
                            <TabsTrigger value="mandarin" className={switchTriggerClass} disabled={scanning || adding}>
                                {t.nav.mandarinGroup}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {/* OCR engine choice: local RapidOCR (default) vs OCR.space cloud */}
                    <Tabs value={engine} onValueChange={setEngine} className="inline-flex">
                        <TabsList className="rounded-lg border border-primary/40 bg-primary/10 p-1">
                            <TabsTrigger value="local" className={switchTriggerClass} disabled={scanning || adding}>
                                {ocr.ocrEngineLocal}
                            </TabsTrigger>
                            <TabsTrigger
                                value="ocrspace"
                                className={switchTriggerClass}
                                disabled={scanning || adding}
                                title={ocr.ocrEngineCloudHint}
                            >
                                {ocr.ocrEngineCloud}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {/* ⚠️ 2026-09-27: "Thêm N từ vựng" dời từ vùng kết quả XUỐNG footer (cạnh nút Quét).
                        Style = GIỐNG các nút add trong app (`variant="default"` size sm + tiền tố "+",
                        xem VocabularyBankBrowseTable / GrammarBankPage). */}
                    <Button
                        type="button"
                        size="sm"
                        className="w-full lg:ml-auto lg:w-auto lg:flex-none"
                        onClick={() => scanRef.current?.addSelected()}
                        disabled={scanning || adding || selectedCount === 0}
                    >
                        {adding && <Spinner className="size-3.5" data-icon="inline-start" />}
                        {adding ? ocr.ocrAdding : `+ ${ocr.ocrAddSelected.replace("{count}", String(selectedCount))}`}
                    </Button>

                    <Button
                        type="button"
                        size="sm"
                        className="w-full lg:w-auto lg:flex-none"
                        onClick={() => scanRef.current?.scan()}
                        disabled={!hasImage || scanning || adding}
                    >
                        {scanning ? <Spinner className="size-3.5" /> : <IconScan size={14} />}
                        {scanning ? ocr.ocrScanning : ocr.ocrScan}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
