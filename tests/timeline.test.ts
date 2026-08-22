import { describe, expect, it } from "vitest";
import { naturalTimelineBuckets, timelineBucketIndex, timelineRangeStart } from "../src/timeline";

function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12);
}

function dateParts(timestamp: number): [number, number, number] {
  const date = new Date(timestamp);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

describe("natural Timeline buckets", () => {
  it("uses six exact five-day buckets for 30D", () => {
    const buckets = naturalTimelineBuckets("30d", localDate(2026, 1, 30));
    expect(buckets).toHaveLength(6);
    expect(buckets.map((bucket) => dateParts(bucket.start))).toEqual([
      [2026, 1, 1],
      [2026, 1, 6],
      [2026, 1, 11],
      [2026, 1, 16],
      [2026, 1, 21],
      [2026, 1, 26]
    ]);
    expect(dateParts(buckets[5].end)).toEqual([2026, 1, 31]);
  });

  it("uses calendar half-months for 3M, including leap day and NOW", () => {
    const buckets = naturalTimelineBuckets("3m", localDate(2024, 3, 20));
    expect(buckets).toHaveLength(6);
    expect(buckets.map((bucket) => `${bucket.label} ${bucket.detail}`)).toEqual([
      "JAN 1–15",
      "JAN 16–31",
      "FEB 1–15",
      "FEB 16–29",
      "MAR 1–15",
      "MAR 16–NOW"
    ]);
    expect(dateParts(buckets[3].end)).toEqual([2024, 3, 1]);
    expect(timelineBucketIndex(localDate(2024, 2, 29), buckets)).toBe(3);
    expect(timelineBucketIndex(new Date(2024, 2, 1), buckets)).toBe(4);
  });

  it("keeps six valid half-month buckets when today is in the first half", () => {
    const buckets = naturalTimelineBuckets("3m", localDate(2026, 3, 10));
    expect(buckets).toHaveLength(6);
    expect(buckets[4].detail).toBe("1–NOW");
    expect(buckets[5].detail).toBe("16–31");
    expect(buckets.every((bucket) => bucket.end > bucket.start)).toBe(true);
  });

  it("uses six natural months for 6M and six two-month periods for 1Y", () => {
    const now = localDate(2026, 8, 22);
    const sixMonths = naturalTimelineBuckets("6m", now);
    const oneYear = naturalTimelineBuckets("1y", now);
    expect(sixMonths).toHaveLength(6);
    expect(sixMonths.map((bucket) => bucket.label)).toEqual(["MAR", "APR", "MAY", "JUN", "JUL", "AUG"]);
    expect(dateParts(sixMonths[5].end)).toEqual([2026, 8, 23]);
    expect(oneYear).toHaveLength(6);
    expect(dateParts(oneYear[0].start)).toEqual([2025, 9, 1]);
    expect(oneYear.map((bucket) => bucket.label)).toEqual(["SEP–OCT", "NOV–DEC", "JAN–FEB", "MAR–APR", "MAY–JUN", "JUL–AUG"]);
  });

  it("adapts All to quarters, half-years, or compact year groups", () => {
    const now = localDate(2026, 8, 22);
    const quarters = naturalTimelineBuckets("all", now, localDate(2025, 1, 5));
    const halves = naturalTimelineBuckets("all", now, localDate(2022, 1, 5));
    const years = naturalTimelineBuckets("all", now, localDate(2000, 1, 5));
    expect(quarters[0]).toMatchObject({ label: "Q1", detail: "2025" });
    expect(halves[0]).toMatchObject({ label: "JAN–JUN", detail: "2022" });
    expect(years.length).toBeLessThanOrEqual(12);
    expect(years[0].label).toContain("2000");
  });

  it("maps exact boundaries and computes range starts without off-by-one days", () => {
    const now = localDate(2026, 8, 22);
    const buckets = naturalTimelineBuckets("6m", now);
    expect(timelineBucketIndex(new Date(2026, 3, 1), buckets)).toBe(1);
    expect(timelineBucketIndex(new Date(2026, 2, 31, 23, 59, 59), buckets)).toBe(0);
    expect(dateParts((timelineRangeStart("30d", now) as Date).getTime())).toEqual([2026, 7, 24]);
    expect(dateParts((timelineRangeStart("3m", now) as Date).getTime())).toEqual([2026, 6, 1]);
    expect(timelineRangeStart("all", now)).toBeNull();
  });
});
