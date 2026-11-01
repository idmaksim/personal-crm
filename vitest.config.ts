import { defineConfig, configDefaults } from "vitest/config";

// Unit tests (Vitest). Added by TDD alongside the code they cover; there are
// none yet, so `passWithNoTests` keeps the CI job green until the first one
// lands. End-to-end tests live in `e2e/` and run under Playwright, not Vitest.
export default defineConfig({
  test: {
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
