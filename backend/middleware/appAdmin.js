import { isAppAdmin } from "../lib/appAdmin.js";
import { log, logWarn } from "../lib/actionLog.js";

export async function requireAppAdmin(request, reply) {
    log("Checking admin");
    const email = request.session?.email;

    // Admin theo env (ADMIN_EMAILS)
    if (isAppAdmin(email)) return;

    // Fallback: user có cờ isAdmin trong DB (nhất quán với login/sessionUser)
    try {
        const { prisma } = await import("../lib/prisma.js");
        const user = await prisma.user.findUnique({
            where: { id: request.session?.userId },
            select: { isAdmin: true },
        });
        if (user?.isAdmin) return;
    } catch {
        // bỏ qua và từ chối bên dưới
    }

    logWarn("Admin required", email?.split("@")[0] ?? "guest");
    return reply.code(403).send({ error: "Admin only" });
}
