import { isAppAdmin } from "../lib/appAdmin.js";
import { log, logWarn } from "../lib/actionLog.js";

export function requireAppAdmin(request, reply, done) {
  log("Checking admin");
  if (!isAppAdmin(request.session?.email)) {
    logWarn("Admin required", request.session?.email?.split("@")[0] ?? "guest");
    reply.code(403).send({ error: "Admin only" });
    return;
  }
  done();
}
