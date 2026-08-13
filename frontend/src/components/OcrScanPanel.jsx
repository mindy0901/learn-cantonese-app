import { useRef, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { OcrScanSection } from "./OcrScanSection.jsx";
import { IconMonitor, IconScan } from "./NavIcons.jsx";
import { Button } from "./shadcn/button.jsx";
import { Spinner } from "./shadcn/spinner.jsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./shadcn/dialog.jsx";
import { cn } from "../lib/cn.js";

/**
 * Modal for OCR scanning ONLY (paste/upload image → suggested vocabulary).
 * Separate from the manual single-word add modal (AddWordPanel).
 */
export function OcrScanPanel({ onClose }) {
    const { t } = useLocale();
    const scanRef = useRef(null);
    const [hasImage, setHasImage] = useState(false);
    // OCR engine: "ocrspace" (cloud, PRIMARY — fallback RapidOCR) or "local" (RapidOCR only).
    const [engine, setEngine] = useState("ocrspace");
    const [scanning, setScanning] = useState(false);
    const [adding, setAdding] = useState(false);
    const ocr = t.addWord;

    const engineBtnClass = (active) =>
        cn(
            "inline-flex cursor-pointer items-center rounded-md px-2 py-1 text-sm font-medium transition-colors disabled:opacity-50",
            active ? "bg-amber-500 text-white" : "text-amber-700 hover:bg-amber-500/15 dark:text-amber-300",
        );

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-360 gap-0 overflow-hidden p-0 h-[min(75vh,75dvh)] sm:max-w-360">
                <DialogHeader className="relative shrink-0 border-b-2 border-slate-400 bg-card px-6 py-3 dark:border-slate-600">
                    <DialogTitle className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-base">
                        {ocr.ocrTitle}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                    <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-card px-4 py-4">
                        <OcrScanSection
                            ref={scanRef}
                            engine={engine}
                            onScanningChange={setScanning}
                            onAddingChange={setAdding}
                            onImageChange={setHasImage}
                        />
                    </section>
                </div>

                {/* Scan action bar — replaces the old footer buttons */}
                <DialogFooter className="relative flex shrink-0 items-center justify-between gap-2 border-t-2 border-slate-400 bg-card px-6 py-3 dark:border-slate-600 sm:flex-row sm:justify-between">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:border-amber-500 dark:text-amber-300"
                        onClick={() => scanRef.current?.chooseFile()}
                        disabled={scanning || adding}
                    >
                        <IconMonitor size={14} />
                        {ocr.ocrChooseFile}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        className="absolute left-1/2 -translate-x-1/2"
                        onClick={() => scanRef.current?.scan()}
                        disabled={!hasImage || scanning || adding}
                    >
                        {scanning ? <Spinner className="size-3.5" /> : <IconScan size={14} />}
                        {scanning ? ocr.ocrScanning : ocr.ocrScan}
                    </Button>
                    {/* OCR engine choice: local RapidOCR (default) vs OCR.space cloud */}
                    <div
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-1"
                        role="group"
                        aria-label={ocr.ocrEngine}
                    >
                        <button
                            type="button"
                            className={engineBtnClass(engine === "local")}
                            onClick={() => setEngine("local")}
                            disabled={scanning || adding}
                        >
                            {ocr.ocrEngineLocal}
                        </button>
                        <button
                            type="button"
                            className={engineBtnClass(engine === "ocrspace")}
                            onClick={() => setEngine("ocrspace")}
                            disabled={scanning || adding}
                            title={ocr.ocrEngineCloudHint}
                        >
                            {ocr.ocrEngineCloud}
                        </button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
