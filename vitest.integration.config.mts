import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Testy przypadków użycia na prawdziwej bazie (lokalny Supabase: `npm run db:start`). */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` rzuca poza środowiskiem serwera Next; w testach node jest zbędny.
      "server-only": fileURLToPath(new URL("./src/shared/testing/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
