import { getCachedData, isOddsDataStale } from "@/lib/cache";
import type { NflGameContext } from "@/lib/nflContext";

export type NflOddsCacheDay = "today" | "tomorrow" | "week";

export type NflOddsGame = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: {
    markets?: {
      key: string;
      outcomes?: { name: string; description?: string | null; price?: number | null; point?: number | null }[];
    }[];
  }[];
};

export type CachedNflOddsPayload = {
  businessDate?: string;
  weekStart?: string;
  data?: NflOddsGame[];
  context?: Record<string, NflGameContext>;
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

  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

function formatDateLabel(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getExpectedNflWeekStart(now = new Date()) {
  const et = getEasternNowParts(now);
  const date = new Date(Date.UTC(et.year, et.month - 1, et.day, 12, 0, 0));
  // Roll back to most recent Tuesday (NFL week resets Tuesday)
  const dayOfWeek = date.getUTCDay(); // 0=Sun, 2=Tue
  const daysBack = dayOfWeek >= 2 ? dayOfWeek - 2 : dayOfWeek + 5;
  date.setUTCDate(date.getUTCDate() - daysBack);
  return formatDateLabel(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function getNflOddsCacheKey() {
  return "nfl_odds_week";
}

export async function getResolvedNflOddsCache(now = new Date()) {
  const expectedWeekStart = getExpectedNflWeekStart(now);
  const cacheKey = getNflOddsCacheKey();
  const primaryRow = await getCachedData(cacheKey);
  const primary = (primaryRow?.data as CachedNflOddsPayload | null) ?? null;

  const isWeekStale = Boolean(primary?.weekStart && primary.weekStart !== expectedWeekStart);
  const isAgeStale = isOddsDataStale(primaryRow?.updated_at);

  return {
    active: isWeekStale ? null : primary,
    expectedWeekStart,
    isStale: isWeekStale || isAgeStale,
    isAgeStale,
    primary,
  };
}
