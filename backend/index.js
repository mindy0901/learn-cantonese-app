import { log } from "./lib/actionLog.js";
import { warmCedictIndex } from "./lib/cedictSearch.js";
import { buildApp } from "./app.js";

const BACKEND_PORT = Number(process.env.BACKEND_PORT ?? process.env.PORT) || 3001;
const BACKEND_HOST = process.env.BACKEND_HOST ?? process.env.HOST ?? "127.0.0.1";

const app = await buildApp({ logger: false });

await app.listen({ port: BACKEND_PORT, host: BACKEND_HOST });
log(`Server running on ${BACKEND_HOST}:${BACKEND_PORT}`);
warmCedictIndex();
