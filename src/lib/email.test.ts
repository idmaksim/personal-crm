import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeEmail("  ivan@mail.ru  ")).toBe("ivan@mail.ru");
  });

  it("lower-cases the address", () => {
    expect(normalizeEmail("Ivan@Mail.ru")).toBe("ivan@mail.ru");
  });

  it("treats different casing and spacing as the same address", () => {
    expect(normalizeEmail("  Ivan@Mail.ru ")).toBe(
      normalizeEmail("ivan@mail.ru"),
    );
  });
});

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("ivan@mail.ru")).toBe(true);
  });

  it("rejects an address with no @", () => {
    expect(isValidEmail("ivan.mail.ru")).toBe(false);
  });

  it("rejects an address with no domain", () => {
    expect(isValidEmail("ivan@")).toBe(false);
  });

  it("rejects an address with no top-level domain", () => {
    expect(isValidEmail("ivan@mail")).toBe(false);
  });

  it("rejects an address with spaces", () => {
    expect(isValidEmail("ivan ivanov@mail.ru")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });
});
