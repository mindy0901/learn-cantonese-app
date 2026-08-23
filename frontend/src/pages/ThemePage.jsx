import { useEffect, useState } from "react";
import { Button } from "../components/shadcn/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/shadcn/card.jsx";
import { Badge } from "../components/shadcn/badge.jsx";
import { cn } from "../lib/cn.js";

/**
 * Trang tổng hợp màu sắc của app (theme reference).
 * Mọi màu đều là semantic token từ `globals.css` — tự đổi theo light/dark.
 * Không hardcode giá trị; dùng đúng class Tailwind sinh từ token.
 */

const surfaceColors = [
    {
        label: "Background",
        cls: "bg-background",
        text: "text-foreground",
        varName: "--background",
        desc: "Nền trang chính",
    },
    { label: "Foreground", cls: "bg-foreground", varName: "--foreground", desc: "Chữ chính / nội dung" },
    { label: "Card", cls: "bg-card", text: "text-foreground", varName: "--card", desc: "Nền thẻ (card) & bảng" },
    { label: "Card foreground", cls: "bg-card-foreground", varName: "--card-foreground", desc: "Chữ trên thẻ" },
    {
        label: "Popover",
        cls: "bg-popover",
        text: "text-foreground",
        varName: "--popover",
        desc: "Nền popup / dialog / dropdown",
    },
    {
        label: "Popover foreground",
        cls: "bg-popover-foreground",
        varName: "--popover-foreground",
        desc: "Chữ trên popup",
    },
    {
        label: "Secondary",
        cls: "bg-secondary",
        text: "text-secondary-foreground",
        varName: "--secondary",
        desc: "Nền phụ",
    },
    {
        label: "Secondary foreground",
        cls: "bg-secondary-foreground",
        varName: "--secondary-foreground",
        desc: "Chữ nền phụ",
    },
    { label: "Muted", cls: "bg-muted", text: "text-muted-foreground", varName: "--muted", desc: "Nền mờ / hover" },
    { label: "Muted foreground", cls: "bg-muted-foreground", varName: "--muted-foreground", desc: "Chữ phụ / ghi chú" },
    {
        label: "Accent",
        cls: "bg-accent",
        text: "text-accent-foreground",
        varName: "--accent",
        desc: "Điểm nhấn (map = primary)",
    },
    { label: "Accent foreground", cls: "bg-accent-foreground", varName: "--accent-foreground", desc: "Chữ điểm nhấn" },
    { label: "Border", cls: "bg-border", varName: "--border", desc: "Đường viền" },
    { label: "Input", cls: "bg-input", varName: "--input", desc: "Viền / nền ô nhập liệu" },
    { label: "Ring", cls: "bg-ring", varName: "--ring", desc: "Vòng focus" },
];

const actionColors = [
    {
        label: "Primary",
        cls: "bg-primary",
        text: "text-primary-foreground",
        varName: "--primary",
        desc: "Nút chính / chip / icon nền",
    },
    {
        label: "Primary foreground",
        cls: "bg-primary-foreground",
        varName: "--primary-foreground",
        desc: "Chữ trên primary",
    },
    {
        label: "Destructive",
        cls: "bg-destructive",
        text: "text-destructive-foreground",
        varName: "--destructive",
        desc: "Xóa / hủy / lỗi",
    },
    {
        label: "Destructive foreground",
        cls: "bg-destructive-foreground",
        varName: "--destructive-foreground",
        desc: "Chữ trên destructive",
    },
    { label: "Success", cls: "bg-success", text: "text-white", varName: "--success", desc: "Thành công / nút xanh lá" },
    { label: "Sidebar", cls: "bg-sidebar", varName: "--sidebar", desc: "Nền sidebar" },
    { label: "Sidebar foreground", cls: "bg-sidebar-foreground", varName: "--sidebar-foreground", desc: "Chữ sidebar" },
    {
        label: "Sidebar primary",
        cls: "bg-sidebar-primary",
        text: "text-sidebar-primary-foreground",
        varName: "--sidebar-primary",
        desc: "Nút chính sidebar",
    },
    {
        label: "Sidebar accent",
        cls: "bg-sidebar-accent",
        text: "text-sidebar-accent-foreground",
        varName: "--sidebar-accent",
        desc: "Hover sidebar",
    },
    { label: "Chart 1", cls: "bg-chart-1", varName: "--chart-1", desc: "Biểu đồ #1" },
    { label: "Chart 2", cls: "bg-chart-2", varName: "--chart-2", desc: "Biểu đồ #2" },
    { label: "Chart 3", cls: "bg-chart-3", varName: "--chart-3", desc: "Biểu đồ #3" },
    { label: "Chart 4", cls: "bg-chart-4", varName: "--chart-4", desc: "Biểu đồ #4" },
    { label: "Chart 5", cls: "bg-chart-5", varName: "--chart-5", desc: "Biểu đồ #5" },
];

// Màu nội dung (app riêng) — dùng cho chữ, giữ nguyên 2 theme.
// pinyin/jyutping = trắng (--pinyin-color/--jyutping-color) → hiện trên chip nền foreground.
const contentColors = [
    {
        label: "Cantonese",
        text: "text-han-trad",
        sample: "學",
        varName: "--han-trad-color",
        desc: "Hán tự Cantonese (phồn thể) — đỏ",
    },
    {
        label: "Mandarin simplified",
        text: "text-han-simp",
        sample: "学",
        varName: "--han-simp-color",
        desc: "Hán tự Mandarin (giản thể) — xanh dương",
    },
    {
        label: "Mandarin traditional",
        text: "text-han-mtrad",
        sample: "過",
        varName: "--han-mtrad-color",
        desc: "Hán tự Mandarin (phồn thể) — tím (purple-400)",
    },
    {
        label: "Pinyin",
        text: "text-pinyin",
        sample: "xué",
        varName: "--pinyin-color",
        desc: "Phiên âm Pinyin — mist-50 (cùng text-foreground)",
    },
    {
        label: "Jyutping",
        text: "text-jyutping",
        sample: "hok6",
        varName: "--jyutping-color",
        desc: "Phiên âm Jyutping — mist-50 (cùng text-foreground)",
    },
    {
        label: "Vietnamese meaning",
        text: "text-viet",
        sample: "Học",
        varName: "--viet-color",
        desc: "Nghĩa tiếng Việt — mist-50 (cùng text-foreground)",
    },
    {
        label: "English meaning",
        text: "text-foreground",
        sample: "Student",
        varName: "--foreground",
        desc: "Nghĩa tiếng Anh — mist-50 (text-foreground)",
    },
    {
        label: "Muted foreground (chữ phụ)",
        text: "text-muted-foreground",
        sample: "ghi chú…",
        varName: "--muted-foreground",
        desc: "Chữ phụ / ghi chú / fallback '-'",
    },
    {
        label: "Yellow (★ quan trọng)",
        text: "text-yellow-500",
        sample: "★",
        varName: "text-yellow-500",
        desc: "★ Quan trọng",
    },
    {
        label: "Amber (highlight ví dụ)",
        text: "text-amber-600 dark:text-amber-300",
        sample: "學",
        varName: "text-amber-600 dark:text-amber-300",
        desc: "Highlight ký tự hán trong ví dụ",
    },
    {
        label: "Purple (title nhóm)",
        text: "text-purple",
        sample: "I. Trợ từ",
        varName: "--purple-color",
        desc: "Title nhóm nghĩa / chữ tím",
    },
];

// Text colors sẵn có của theme shadcn — swatch trên nền card để thấy màu chữ.
const themeTextColors = [
    {
        label: "Foreground",
        cls: "bg-card",
        text: "text-foreground",
        sample: "Aa",
        varName: "--foreground",
        desc: "Chữ chính / nội dung",
    },
    {
        label: "Muted foreground",
        cls: "bg-card",
        text: "text-muted-foreground",
        sample: "Aa",
        varName: "--muted-foreground",
        desc: "Chữ phụ / ghi chú / fallback '-'",
    },
    {
        label: "Card foreground",
        cls: "bg-card",
        text: "text-card-foreground",
        sample: "Aa",
        varName: "--card-foreground",
        desc: "Chữ trên thẻ (card)",
    },
    {
        label: "Popover foreground",
        cls: "bg-card",
        text: "text-popover-foreground",
        sample: "Aa",
        varName: "--popover-foreground",
        desc: "Chữ trên popup / dialog / dropdown",
    },
    {
        label: "Primary foreground",
        cls: "bg-card",
        text: "text-primary-foreground",
        sample: "Aa",
        varName: "--primary-foreground",
        desc: "Chữ trên nút primary",
    },
    {
        label: "Secondary foreground",
        cls: "bg-card",
        text: "text-secondary-foreground",
        sample: "Aa",
        varName: "--secondary-foreground",
        desc: "Chữ trên nền secondary",
    },
    {
        label: "Accent foreground",
        cls: "bg-card",
        text: "text-accent-foreground",
        sample: "Aa",
        varName: "--accent-foreground",
        desc: "Chữ trên accent",
    },
    {
        label: "Destructive foreground",
        cls: "bg-card",
        text: "text-destructive-foreground",
        sample: "Aa",
        varName: "--destructive-foreground",
        desc: "Chữ trên destructive",
    },
    {
        label: "Sidebar foreground",
        cls: "bg-card",
        text: "text-sidebar-foreground",
        sample: "Aa",
        varName: "--sidebar-foreground",
        desc: "Chữ sidebar",
    },
    {
        label: "Sidebar primary foreground",
        cls: "bg-card",
        text: "text-sidebar-primary-foreground",
        sample: "Aa",
        varName: "--sidebar-primary-foreground",
        desc: "Chữ trên sidebar primary",
    },
    {
        label: "Sidebar accent foreground",
        cls: "bg-card",
        text: "text-sidebar-accent-foreground",
        sample: "Aa",
        varName: "--sidebar-accent-foreground",
        desc: "Chữ trên sidebar accent",
    },
];

/** Map token → tên màu Tailwind đơn giản `[light, dark]` (theo base color MIST — 2026-08-20). */
const TAILWIND_MAP = {
    "--background": ["white", "mist-950"],
    "--foreground": ["mist-950", "mist-50"],
    "--card": ["white", "mist-900"],
    "--card-foreground": ["mist-950", "mist-50"],
    "--popover": ["white", "mist-900"],
    "--popover-foreground": ["mist-950", "mist-50"],
    "--secondary": ["mist-100", "mist-800"],
    "--secondary-foreground": ["mist-900", "mist-50"],
    "--muted": ["mist-100", "mist-800"],
    "--muted-foreground": ["mist-500", "mist-400"],
    "--accent": ["mist-100", "mist-800"],
    "--accent-foreground": ["mist-900", "mist-50"],
    "--border": ["mist-200", "white/10"],
    "--input": ["mist-200", "white/15"],
    "--ring": ["mist-400", "mist-500"],
    "--primary": ["mist-900", "mist-200"],
    "--primary-foreground": ["mist-50", "mist-900"],
    "--destructive": ["red-600", "red-400"],
    "--destructive-foreground": ["white", "white"],
    "--success": ["emerald-600", "emerald-500"],
    "--sidebar": ["mist-50", "mist-900"],
    "--sidebar-foreground": ["mist-950", "mist-50"],
    "--sidebar-primary": ["mist-900", "blue-700"],
    "--sidebar-primary-foreground": ["mist-50", "mist-50"],
    "--sidebar-accent": ["mist-100", "mist-800"],
    "--chart-1": ["mist-300", "mist-300"],
    "--chart-2": ["mist-500", "mist-500"],
    "--chart-3": ["mist-600", "mist-600"],
    "--chart-4": ["mist-700", "mist-700"],
    "--chart-5": ["mist-800", "mist-800"],
    "--han-trad-color": ["red-400", "red-400"],
    "--han-simp-color": ["blue-400", "blue-400"],
    "--han-mtrad-color": ["purple-400", "purple-400"],
    "--pinyin-color": ["mist-950", "mist-50"],
    "--jyutping-color": ["mist-950", "mist-50"],
    "--viet-color": ["mist-950", "mist-50"],
    "--purple-color": ["purple-600", "purple-400"],
    "text-yellow-500": ["yellow-600", "yellow-400"],
    "text-amber-600 dark:text-amber-300": ["amber-600", "amber-300"],
};

/** Hiện tên màu Tailwind đơn giản của token (tự đổi theo theme light/dark). */
function TailwindName({ varName }) {
    const [dark, setDark] = useState(false);
    useEffect(() => {
        const read = () => setDark(document.documentElement.classList.contains("dark"));
        read();
        const mo = new MutationObserver(read);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => mo.disconnect();
    }, []);
    const pair = TAILWIND_MAP[varName];
    if (!pair) return null;
    return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] leading-none text-foreground">
            {pair[dark ? 1 : 0]}
        </code>
    );
}

function SwatchCard({ label, cls, text, sample, varName, desc }) {
    return (
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className={cn("flex h-20 w-full items-center justify-center border-b border-border", cls)}>
                {sample && text && <span className={cn("text-lg font-semibold", text)}>{sample}</span>}
            </div>
            <div className="flex flex-col gap-1.5 p-4">
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <code className="text-xs text-muted-foreground">
                    {varName === (cls || text) ? cls || text : `${varName} · ${cls || text}`}
                </code>
                <TailwindName varName={varName} />
                <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
        </div>
    );
}

function SectionTitle({ title, sub }) {
    return (
        <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
            {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        </div>
    );
}

export function ThemePage() {
    return (
        <main className="mx-auto flex-1 w-full max-w-280 px-4 py-8 pb-12">
            <div className="mb-8 flex flex-col items-center gap-2 text-center">
                <Badge variant="secondary" className="mb-1">
                    Theme reference
                </Badge>
                <h1 className="text-2xl font-bold tracking-tight">Bảng màu ứng dụng</h1>
                <p className="max-w-xl text-sm text-muted-foreground">
                    Tổng hợp toàn bộ màu semantic của app (từ <code>globals.css</code>) — tự đổi theo chế độ sáng/tối.
                    Dùng đúng class Tailwind, không hardcode giá trị màu.
                </p>
            </div>

            <div className="flex flex-col gap-8">
                {/* Nền & bề mặt */}
                <section className="flex flex-col gap-4">
                    <SectionTitle
                        title="1. Nền & bề mặt (Surface)"
                        sub="bg-background, bg-card, bg-muted… — nền của trang, thẻ, vùng mờ."
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {surfaceColors.map((c) => (
                            <SwatchCard key={c.varName} {...c} />
                        ))}
                    </div>
                </section>

                {/* Màu hành động */}
                <section className="flex flex-col gap-4">
                    <SectionTitle
                        title="2. Màu hành động (Action)"
                        sub="bg-primary, bg-destructive, bg-success… — nút, cảnh báo, biểu đồ."
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {actionColors.map((c) => (
                            <SwatchCard key={c.varName} {...c} />
                        ))}
                    </div>
                </section>

                {/* Màu nội dung */}
                <section className="flex flex-col gap-4">
                    <SectionTitle
                        title="3. Màu nội dung (Content)"
                        sub="text-han-trad, text-han-simp, text-pinyin, text-jyutping, text-viet, text-purple… — màu chữ nội dung, giữ nguyên 2 theme."
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {contentColors.map((c) => (
                            <SwatchCard key={c.varName} {...c} />
                        ))}
                    </div>
                </section>

                {/* Màu chữ của theme shadcn */}
                <section className="flex flex-col gap-4">
                    <SectionTitle
                        title="4. Màu chữ (Text colors)"
                        sub="text-foreground, text-muted-foreground, text-primary-foreground… — các màu chữ sẵn có của theme shadcn (hiện trên nền card)."
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {themeTextColors.map((c) => (
                            <SwatchCard key={c.varName} {...c} />
                        ))}
                    </div>
                </section>

                {/* Button variants */}
                <section className="flex flex-col gap-4">
                    <SectionTitle
                        title="5. Nút bấm (Button variants)"
                        sub="6 variant có sẵn của shadcn + 2 kiểu custom đang dùng trong app (xanh lá success, vàng amber)."
                    />
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold text-foreground">Ví dụ màu</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button>Default</Button>
                                <Button variant="outline">Outline</Button>
                                <Button variant="secondary">Secondary</Button>
                                <Button variant="ghost">Ghost</Button>
                                <Button variant="destructive">Destructive</Button>
                                <Button className="bg-amber-500 text-white hover:bg-amber-600 border-amber-600">
                                    Amber (vàng)
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Ví dụ tổng hợp */}
                <section className="flex flex-col gap-4">
                    <SectionTitle
                        title="6. Ví dụ tổng hợp"
                        sub="Mô phỏng một block chi tiết từ — minh họa cách các màu nội dung phối hợp."
                    />
                    <Card>
                        <CardContent className="flex flex-col gap-4 p-6">
                            {/* Hán tự + phiên âm (như block đầu trang) */}
                            <div className="flex items-start justify-center gap-4">
                                {[
                                    {
                                        sino: "HỌC",
                                        han: "學",
                                        roman: "hok6",
                                        hanCls: "text-han-trad",
                                        sinoCls: "text-foreground",
                                    },
                                    {
                                        sino: "SANH",
                                        han: "生",
                                        roman: "saang1",
                                        hanCls: "text-han-trad",
                                        sinoCls: "text-foreground",
                                    },
                                ].map((col, i) => (
                                    <span key={i} className="flex flex-col items-center gap-1">
                                        <span className={cn("text-sm font-semibold leading-none", col.sinoCls)}>
                                            {col.sino}
                                        </span>
                                        <span className={cn("text-3xl font-semibold leading-none", col.hanCls)}>
                                            {col.han}
                                        </span>
                                        <span className="text-sm font-semibold leading-none text-foreground">
                                            {col.roman}
                                        </span>
                                    </span>
                                ))}
                            </div>

                            {/* Nhóm nghĩa — title tím */}
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-semibold text-purple">I. 粵典–words.hk</span>
                                    <span className="text-sm text-muted-foreground">(3)</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <p className="text-base font-semibold text-foreground">學生</p>
                                    <p className="text-base font-semibold text-viet">Học sinh</p>
                                    <p className="text-base font-semibold text-foreground">Student</p>
                                </div>
                            </div>

                            {/* Ví dụ — cột dọc theo hán tự */}
                            <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                                <p className="mb-2 text-sm font-semibold text-han-simp">Ví dụ (1)</p>
                                <div className="flex flex-wrap items-start justify-start gap-3">
                                    {[
                                        { han: "大", roman: "daai6" },
                                        { han: "學", roman: "hok6", amber: true },
                                        { han: "生", roman: "saang1", amber: true },
                                    ].map((col, i) => (
                                        <span key={i} className="flex flex-col items-center gap-1">
                                            <span
                                                className={cn(
                                                    "text-xl font-semibold leading-none text-foreground",
                                                    col.amber && "font-semibold text-amber-600 dark:text-amber-300",
                                                )}
                                            >
                                                {col.han}
                                            </span>
                                            <span className="text-sm font-semibold leading-none text-foreground">
                                                {col.roman}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-2 flex flex-col gap-0.5 border-t border-border/60 pt-2">
                                    <p className="text-sm font-semibold text-viet">Sinh viên đại học</p>
                                    <p className="text-sm text-muted-foreground">University student</p>
                                </div>
                            </div>

                            {/* Trạng thái */}
                            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
                                Đã đồng bộ nghĩa/ví dụ
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </main>
    );
}
