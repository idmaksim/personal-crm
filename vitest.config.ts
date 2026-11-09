import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

// Unit tests (Vitest). Added by TDD alongside the code they cover; there are
// none yet, so `passWithNoTests` keeps the CI job green until the first one
// lands. End-to-end tests live in `e2e/` and run under Playwright, not Vitest.
export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "@/*" -> "./src/*" path in tsconfig.json, which Vitest
      // does not read on its own.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Outside Next's webpack build, the real "server-only" package always
      // throws (it relies on Next aliasing it away for server-layer code).
      // Vitest isn't Next's bundler, so alias it to the same empty module Next
      // uses on the server side, letting server-only code under test import it
      // like it would in the real app.
      "server-only": fileURLToPath(
        new URL(
          "./node_modules/next/dist/compiled/server-only/empty.js",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
