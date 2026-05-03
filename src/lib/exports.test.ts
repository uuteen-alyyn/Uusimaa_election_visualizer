import { describe, expect, it } from "vitest";

import { inlineCssTokens, timestamp } from "./exports";

describe("timestamp", () => {
  it("formats ISO into a filename-safe slug", () => {
    const ts = timestamp(new Date("2026-05-03T21:03:45.123Z"));
    expect(ts).toBe("2026-05-03-21-03");
  });

  it("uses a clock when no date is supplied", () => {
    const ts = timestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/);
  });
});

describe("inlineCssTokens", () => {
  function fakeStyle(map: Record<string, string>): CSSStyleDeclaration {
    return {
      getPropertyValue: (k: string) => map[k] ?? "",
    } as unknown as CSSStyleDeclaration;
  }

  it("emits :root with all design tokens", () => {
    const css = inlineCssTokens(
      fakeStyle({
        "--ink": "#1a1a1a",
        "--paper": "#fbf9f4",
        "--p-kok": "#1f5a9c",
      }),
    );
    expect(css).toMatch(/:root\s*\{/);
    expect(css).toContain("--ink:#1a1a1a;");
    expect(css).toContain("--paper:#fbf9f4;");
    expect(css).toContain("--p-kok:#1f5a9c;");
  });

  it("includes the font fallback for label text", () => {
    const css = inlineCssTokens(fakeStyle({}));
    expect(css).toContain("text{font-family:'Architects Daughter'");
  });
});
