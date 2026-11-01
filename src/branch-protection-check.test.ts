import { expect, test } from "vitest";

// Deliberately failing test to prove branch protection blocks a red PR.
// This file is temporary and its PR is meant to be closed, not merged.
test("this test fails on purpose", () => {
  expect(1 + 1).toBe(3);
});
