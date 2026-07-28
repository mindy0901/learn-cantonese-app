import { defineConfig } from "prisma/config";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });

export default defineConfig({
    schema: "prisma/schema.prisma",
    datasource: {
        url: process.env["DATABASE_URL"]!,
    },
    migrations: {
        path: "prisma/migrations",
        seed: "tsx prisma/seed.ts",
    },
});
