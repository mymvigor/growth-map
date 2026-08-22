import type { TimeRange } from "./types";

export interface TimelineBucket {
  start: number;
  end: number;
  label: string;
  detail?: string;
}

const DAY = 86400000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function monthName(date: Date): string {
  return date.toLocaleDateString("en", { month: "short" }).toUpperCase();
}

function dayRangeLabel(start: Date, endExclusive: Date): { label: string; detail: string } {
  const end = addDays(endExclusive, -1);
  if (start.getMonth() === end.getMonth()) return { label: monthName(start), detail: `${start.getDate()}–${end.getDate()}` };
  return { label: `${monthName(start)}–${monthName(end)}`, detail: `${start.getDate()}–${end.getDate()}` };
}

export function timelineRangeStart(range: TimeRange, now = new Date()): Date | null {
  const tomorrow = addDays(startOfDay(now), 1);
  if (range === "all") return null;
  if (range === "30d") return addDays(tomorrow, -30);
  if (range === "3m") return startOfMonth(now.getFullYear(), now.getMonth() - 2);
  if (range === "6m") return startOfMonth(now.getFullYear(), now.getMonth() - 5);
  return startOfMonth(now.getFullYear(), now.getMonth() - 11);
}

export function naturalTimelineBuckets(range: TimeRange, now = new Date(), earliest?: Date | null): TimelineBucket[] {
  const tomorrow = addDays(startOfDay(now), 1);
  if (range === "30d") {
    const start = addDays(tomorrow, -30);
    return Array.from({ length: 6 }, (_, index) => {
      const bucketStart = addDays(start, index * 5);
      const bucketEnd = addDays(bucketStart, 5);
      return { start: bucketStart.getTime(), end: bucketEnd.getTime(), ...dayRangeLabel(bucketStart, bucketEnd) };
    });
  }
  if (range === "3m") {
    const first = startOfMonth(now.getFullYear(), now.getMonth() - 2);
    const buckets: TimelineBucket[] = [];
    for (let month = 0; month < 3; month += 1) {
      const monthStart = startOfMonth(first.getFullYear(), first.getMonth() + month);
      const secondHalf = new Date(monthStart.getFullYear(), monthStart.getMonth(), 16);
      const monthEnd = startOfMonth(monthStart.getFullYear(), monthStart.getMonth() + 1);
      const isCurrent = monthStart.getFullYear() === now.getFullYear() && monthStart.getMonth() === now.getMonth();
      const currentFirstHalf = isCurrent && now.getDate() < 16;
      buckets.push({
        start: monthStart.getTime(),
        end: (currentFirstHalf ? tomorrow : secondHalf).getTime(),
        label: monthName(monthStart),
        detail: currentFirstHalf ? "1–NOW" : "1–15"
      });
      buckets.push({
        start: secondHalf.getTime(),
        end: (isCurrent && !currentFirstHalf ? tomorrow : monthEnd).getTime(),
        label: monthName(monthStart),
        detail: isCurrent && !currentFirstHalf ? "16–NOW" : `16–${addDays(monthEnd, -1).getDate()}`
      });
    }
    return buckets;
  }
  if (range === "6m") {
    const first = startOfMonth(now.getFullYear(), now.getMonth() - 5);
    return Array.from({ length: 6 }, (_, index) => {
      const bucketStart = startOfMonth(first.getFullYear(), first.getMonth() + index);
      const next = startOfMonth(bucketStart.getFullYear(), bucketStart.getMonth() + 1);
      const isCurrent = bucketStart.getFullYear() === now.getFullYear() && bucketStart.getMonth() === now.getMonth();
      return { start: bucketStart.getTime(), end: (isCurrent ? tomorrow : next).getTime(), label: monthName(bucketStart) };
    });
  }
  if (range === "1y") {
    const first = startOfMonth(now.getFullYear(), now.getMonth() - 11);
    return Array.from({ length: 6 }, (_, index) => {
      const bucketStart = startOfMonth(first.getFullYear(), first.getMonth() + index * 2);
      const next = startOfMonth(bucketStart.getFullYear(), bucketStart.getMonth() + 2);
      const end = next > tomorrow ? tomorrow : next;
      const lastMonth = startOfMonth(end.getFullYear(), end.getMonth() - (end.getDate() === 1 ? 1 : 0));
      return { start: bucketStart.getTime(), end: end.getTime(), label: `${monthName(bucketStart)}–${monthName(lastMonth)}` };
    });
  }
  return allBuckets(earliest ?? now, now, tomorrow);
}

function allBuckets(earliest: Date, now: Date, tomorrow: Date): TimelineBucket[] {
  const first = startOfDay(earliest);
  const spanYears = Math.max(0, (now.getTime() - first.getTime()) / (365.2425 * DAY));
  const buckets: TimelineBucket[] = [];
  if (spanYears <= 2) {
    let cursor = new Date(first.getFullYear(), Math.floor(first.getMonth() / 3) * 3, 1);
    while (cursor <= now) {
      const next = startOfMonth(cursor.getFullYear(), cursor.getMonth() + 3);
      buckets.push({ start: cursor.getTime(), end: (next > tomorrow ? tomorrow : next).getTime(), label: `Q${Math.floor(cursor.getMonth() / 3) + 1}`, detail: String(cursor.getFullYear()) });
      cursor = next;
    }
    return buckets;
  }
  if (spanYears <= 5) {
    let cursor = new Date(first.getFullYear(), first.getMonth() < 6 ? 0 : 6, 1);
    while (cursor <= now) {
      const next = startOfMonth(cursor.getFullYear(), cursor.getMonth() + 6);
      buckets.push({ start: cursor.getTime(), end: (next > tomorrow ? tomorrow : next).getTime(), label: cursor.getMonth() === 0 ? "JAN–JUN" : "JUL–DEC", detail: String(cursor.getFullYear()) });
      cursor = next;
    }
    return buckets;
  }
  const firstYear = first.getFullYear();
  const yearCount = now.getFullYear() - firstYear + 1;
  const step = Math.max(1, Math.ceil(yearCount / 12));
  for (let year = firstYear; year <= now.getFullYear(); year += step) {
    const start = new Date(year, 0, 1);
    const next = new Date(year + step, 0, 1);
    const endYear = Math.min(year + step - 1, now.getFullYear());
    buckets.push({ start: start.getTime(), end: (next > tomorrow ? tomorrow : next).getTime(), label: step === 1 ? String(year) : `${year}–${endYear}` });
  }
  return buckets;
}

export function timelineBucketIndex(timestamp: string | number | Date, buckets: TimelineBucket[]): number {
  const time = timestamp instanceof Date ? timestamp.getTime() : typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
  return buckets.findIndex((bucket) => time >= bucket.start && time < bucket.end);
}
