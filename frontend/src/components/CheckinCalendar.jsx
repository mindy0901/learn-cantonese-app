import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useIsSignedIn, useAuthUser } from "../store/authStore.js";
import { api } from "../lib/api.js";
import { Calendar } from "./shadcn/calendar.jsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./shadcn/card.jsx";
import { Skeleton } from "./shadcn/skeleton.jsx";

/** YYYY-MM-DD theo giờ local. */
function localDate(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** Chuỗi ngày liên tiếp hiện tại (hôm nay — hoặc từ hôm qua nếu hôm nay chưa check-in). */
function currentStreak(dateStrs) {
    const set = new Set(dateStrs);
    let streak = 0;
    const d = new Date();
    if (!set.has(localDate(d))) d.setDate(d.getDate() - 1);
    while (set.has(localDate(d))) {
        streak += 1;
        d.setDate(d.getDate() - 1);
    }
    return streak;
}

/**
 * Lịch check-in (trang home) — hiện các ngày user đã đăng nhập (auto check-in).
 * Chỉ hiện khi đã đăng nhập. (2026-08-24)
 */
export function CheckinCalendar({ className }) {
    const { t } = useLocale();
    const isSignedIn = useIsSignedIn();
    const user = useAuthUser();
    const [dates, setDates] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        if (!isSignedIn) {
            setDates([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        api.fetchCheckins()
            .then((res) => {
                if (alive) setDates(Array.isArray(res?.dates) ? res.dates : []);
            })
            .catch(() => {
                /* bỏ qua */
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [isSignedIn, user?.id]);

    const checkedDates = useMemo(() => dates.map((d) => new Date(`${d}T00:00:00`)), [dates]);
    const streak = useMemo(() => currentStreak(dates), [dates]);

    if (!isSignedIn) return null;

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="text-sm">{t.home?.checkinTitle ?? "Check-in"}</CardTitle>
                <CardDescription>{t.home?.checkinSubtitle ?? "Các ngày bạn đã đăng nhập vào app"}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
                {loading ? (
                    <div className="flex w-full flex-col items-center gap-2">
                        <Skeleton className="h-64 w-full max-w-72 rounded-xl" />
                    </div>
                ) : (
                    <Calendar
                        mode="multiple"
                        selected={checkedDates}
                        onSelect={() => {}}
                        showOutsideDays
                        className="mx-auto"
                    />
                )}
                <div className="flex items-center justify-center gap-6 text-sm">
                    <div className="flex flex-col items-center">
                        <span className="text-xl font-semibold text-foreground">{streak}</span>
                        <span className="text-xs text-muted-foreground">
                            {t.home?.checkinStreak ?? "Ngày liên tiếp"}
                        </span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-xl font-semibold text-foreground">{dates.length}</span>
                        <span className="text-xs text-muted-foreground">{t.home?.checkinTotal ?? "Tổng check-in"}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
