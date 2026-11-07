import { describe, expect, it } from "vitest";
import { resolveLocale } from "./index";

describe("resolveLocale", () => {
  it("erkennt unterstützte Sprachen", () => {
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("de_DE")).toBe("de");
  });

  it("fällt auf Deutsch zurück", () => {
    expect(resolveLocale("fr")).toBe("de");
    expect(resolveLocale(undefined)).toBe("de");
  });
});
