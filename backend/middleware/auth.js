import { log, logWarn } from "../lib/actionLog.js";

export function requireAuth(request, reply, done) {
  log("Checking auth");
  if (!request.session?.userId) {
    logWarn("Auth failed", "not signed in");
    reply.code(401).send({ error: "Not signed in" });
    return;
  }
  done();
}

export function getUserId(request) {
  return request.session.userId;
}
