import { getCachedData } from "@/lib/cache";
import type { MlbContextMap } from "@/lib/mlbContext";
import type { MlbLearningProfile } from "@/lib/mlbLearning";
import type { MlbOddsGame } from "@/lib/mlbModel";

export type MlbOddsCacheDay = "today" | "tomorrow" | "yesterday";

export type CachedMlbOddsPayload = {
  businessDate?: string;
  context?: MlbContextMap;
  data?: MlbOddsGame[];
  learning?: MlbLearningProfile;
  [key: string]: unknown;
};

function getEasternNowParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
  };
}

function formatDateLabel(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getExpectedMlbBusinessDate(day: MlbOddsCacheDay, now = new Date()) {
  const et = getEasternNowParts(now);
  const anchor = new Date(Date.UTC(et.year, et.month - 1, et.day, 12, 0, 0));

  if (et.hour < 5) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }

  if (day === "yesterday") {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }

  if (day === "tomorrow") {
    anchor.setUTCDate(anchor.getUTCDate() + 1);
  }

  return formatDateLabel(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, anchor.getUTCDate());
}

export async function getResolvedMlbOddsCache(day: MlbOddsCacheDay, now = new Date()) {
  const expectedBusinessDate = getExpectedMlbBusinessDate(day, now);
  const primaryKey = `mlb_odds_${day}`;
  const primaryRow = await getCachedData(primaryKey);
  const primary = (primaryRow?.data as CachedMlbOddsPayload | null) ?? null;
  const tomorrowFallbackRow =
    day === "today" ? await getCachedData("mlb_odds_tomorrow") : null;
  const tomorrowFallback =
    (tomorrowFallbackRow?.data as CachedMlbOddsPayload | null) ?? null;

  const primaryMatches = primary?.businessDate === expectedBusinessDate;
  const fallbackMatches = tomorrowFallback?.businessDate === expectedBusinessDate;
  const active =
    primaryMatches ? primary : fallbackMatches ? tomorrowFallback : null;

  return {
    active,
    expectedBusinessDate,
    isStale: Boolean(primary?.businessDate && primary.businessDate !== expectedBusinessDate),
    primary,
    usedTomorrowFallback: !primaryMatches && fallbackMatches,
  };
}

export async function getCachedMlbOddsPayloadForBusinessDate(businessDate: string) {
  const todayRow = await getCachedData("mlb_odds_today");
  const tomorrowRow = await getCachedData("mlb_odds_tomorrow");
  const today = (todayRow?.data as CachedMlbOddsPayload | null) ?? null;
  const tomorrow = (tomorrowRow?.data as CachedMlbOddsPayload | null) ?? null;

  if (today?.businessDate === businessDate) return today;
  if (tomorrow?.businessDate === businessDate) return tomorrow;

  return null;
}
