import { describe, expect, it } from "vitest";
import { exceedsMagicLinkLimit } from "./magic-link-limit";

const MIN = 60 * 1000;

describe("exceedsMagicLinkLimit", () => {
  it("allows the 1st request (no prior sends)", () => {
    expect(exceedsMagicLinkLimit([], new Date())).toBe(false);
  });

  it("allows the 3rd request (2 prior sends within the window)", () => {
    const now = new Date();
    const sentAt = [
      new Date(now.getTime() - 1 * MIN),
      new Date(now.getTime() - 5 * MIN),
    ];
    expect(exceedsMagicLinkLimit(sentAt, now)).toBe(false);
  });

  it("forbids the 4th request within 10 minutes", () => {
    const now = new Date();
    const sentAt = [
      new Date(now.getTime() - 1 * MIN),
      new Date(now.getTime() - 5 * MIN),
      new Date(now.getTime() - 9 * MIN),
    ];
    expect(exceedsMagicLinkLimit(sentAt, now)).toBe(true);
  });

  it("ignores sends older than 10 minutes", () => {
    const now = new Date();
    const sentAt = [
      new Date(now.getTime() - 11 * MIN),
      new Date(now.getTime() - 20 * MIN),
      new Date(now.getTime() - 30 * MIN),
    ];
    expect(exceedsMagicLinkLimit(sentAt, now)).toBe(false);
  });
});
