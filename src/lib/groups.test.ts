import { describe, expect, it } from "vitest";
import {
  normalizeGroupName,
  computeGroupOptions,
  parseGroupIds,
} from "./groups";

describe("normalizeGroupName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeGroupName("  Друзья  ")).toBe("друзья");
  });

  it("is case-insensitive", () => {
    expect(normalizeGroupName("Теннис")).toBe(normalizeGroupName("теннис"));
  });

  it("folds ё into е", () => {
    expect(normalizeGroupName("Тённис")).toBe(normalizeGroupName("Теннис"));
  });

  it("keeps inner spaces (only edges are trimmed)", () => {
    expect(normalizeGroupName("  Старые  друзья ")).toBe("старые  друзья");
  });

  it("maps an empty or whitespace-only name to an empty string", () => {
    expect(normalizeGroupName("")).toBe("");
    expect(normalizeGroupName("   ")).toBe("");
  });
});

describe("computeGroupOptions", () => {
  const options = ["Семья", "Теннис", "Друзья"];

  it("suggests all non-excluded groups when nothing is typed", () => {
    const { suggestions, showCreate, alreadyChosen } = computeGroupOptions({
      options,
      exclude: [],
      value: "",
    });
    expect(suggestions).toEqual(["Семья", "Теннис", "Друзья"]);
    // Nothing typed yet, so there is nothing to create.
    expect(showCreate).toBe(false);
    expect(alreadyChosen).toBe(false);
  });

  it("suggests matching existing groups as the owner types", () => {
    const { suggestions } = computeGroupOptions({
      options,
      exclude: [],
      value: "тен",
    });
    expect(suggestions).toEqual(["Теннис"]);
  });

  it("matches case- and ё-insensitively", () => {
    const { suggestions } = computeGroupOptions({
      options: ["Фёдоровы"],
      exclude: [],
      value: "федор",
    });
    expect(suggestions).toEqual(["Фёдоровы"]);
  });

  it("offers to create a brand-new name that does not exist yet", () => {
    const { showCreate, suggestions } = computeGroupOptions({
      options,
      exclude: [],
      value: "Аналитики",
    });
    expect(showCreate).toBe(true);
    expect(suggestions).toEqual([]);
  });

  it("does not offer to create a name that already exists (any case or ё)", () => {
    expect(
      computeGroupOptions({ options, exclude: [], value: "теннис" }).showCreate,
    ).toBe(false);
    expect(
      computeGroupOptions({ options: ["Тённис"], exclude: [], value: "Теннис" })
        .showCreate,
    ).toBe(false);
  });

  it("hides already-assigned groups from the suggestions", () => {
    const { suggestions } = computeGroupOptions({
      options,
      exclude: ["Теннис"],
      value: "",
    });
    expect(suggestions).toEqual(["Семья", "Друзья"]);
  });

  it("reports an already-chosen name instead of offering to create it", () => {
    const { alreadyChosen, showCreate } = computeGroupOptions({
      options,
      exclude: ["Друзья"],
      value: "друзья",
    });
    expect(alreadyChosen).toBe(true);
    expect(showCreate).toBe(false);
  });
});

describe("parseGroupIds", () => {
  it("returns an empty list when nothing is passed", () => {
    expect(parseGroupIds(undefined)).toEqual([]);
  });

  it("reads a single value", () => {
    expect(parseGroupIds("3")).toEqual([3]);
  });

  it("reads several values", () => {
    expect(parseGroupIds(["1", "2", "5"])).toEqual([1, 2, 5]);
  });

  it("drops anything that is not a valid integer", () => {
    expect(parseGroupIds(["1", "abc", "", "2.5"])).toEqual([1]);
  });
});
