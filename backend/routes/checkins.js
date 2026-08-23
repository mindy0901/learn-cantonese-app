/**
 * Check-in routes — auto check-in ngày đăng nhập + lấy lịch sử check-in của user.
 * (2026-08-24)
 */
import { recordCheckin, listCheckins } from "../lib/prismaService.js";
import { requireAuth, getUserId } from "../middleware/auth.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function checkinRoutes(fastify) {
    // Ghi check-in cho user (idempotent — 1 user 1 ngày 1 dòng). date = "YYYY-MM-DD"
    // (local date của user). Không có date → lấy ngày UTC hiện tại của server.
    fastify.post("/checkins", { preHandler: [requireAuth] }, async (request) => {
        const userId = getUserId(request);
        const body = request.body ?? {};
        const date =
            typeof body.date === "string" && DATE_RE.test(body.date)
                ? body.date
                : new Date().toISOString().slice(0, 10);
        await recordCheckin(userId, date);
        return { ok: true, date };
    });

    // Danh sách ngày đã check-in của user (mảng "YYYY-MM-DD").
    fastify.get("/checkins", { preHandler: [requireAuth] }, async (request) => {
        const dates = await listCheckins(getUserId(request));
        return { dates };
    });
}
