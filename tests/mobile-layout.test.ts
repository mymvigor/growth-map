import { describe, expect, it } from "vitest";
import { computeMobileBottomOffset } from "../src/mobile-layout";

describe("mobile bottom offset", () => {
  it("is always zero on desktop", () => {
    expect(computeMobileBottomOffset(false, 812, 34, [{ top: 742, bottom: 812 }])).toBe(0);
  });

  it("uses the visible native navbar height plus an eight pixel gap", () => {
    expect(computeMobileBottomOffset(true, 812, 34, [{ top: 742, bottom: 812 }])).toBe(78);
  });

  it("includes the safe-area gap below a floating mobile navbar", () => {
    expect(computeMobileBottomOffset(true, 812, 0, [{ top: 728, bottom: 780 }])).toBe(92);
  });

  it("falls back to the safe area when the native navbar is absent", () => {
    expect(computeMobileBottomOffset(true, 812, 34, [])).toBe(34);
  });

  it("ignores top toolbars and implausibly tall drawers", () => {
    expect(computeMobileBottomOffset(true, 812, 0, [
      { top: 0, bottom: 52 },
      { top: 200, bottom: 812 }
    ])).toBe(0);
  });
});
