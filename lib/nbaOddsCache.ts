import { getCachedData } from "@/lib/cache";
import type { NbaPropType } from "@/lib/propModel";

export type NbaOddsCacheDay = "today" | "tomorrow" | "yesterday";
export type NbaPropMarketType = NbaPropType;

export type CachedNbaOddsPayload = {
  businessDate?: string;
  data?: unknown[];
  [key: string]: unknown;
};

export type CachedNbaPropsPayload = {
  businessDate?: string;
  data?: unknown[];
  propType?: string;
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

export function getExpectedNbaBusinessDate(day: NbaOddsCacheDay, now = new Date()) {
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

export async function getResolvedNbaTeamOddsCache(day: NbaOddsCacheDay, now = new Date()) {
  const expectedBusinessDate = getExpectedNbaBusinessDate(day, now);
  const primaryKey = `team_odds_${day}`;
  const primaryRow = await getCachedData(primaryKey);
  const primary = (primaryRow?.data as CachedNbaOddsPayload | null) ?? null;
  const tomorrowFallbackRow =
    day === "today" ? await getCachedData("team_odds_tomorrow") : null;
  const tomorrowFallback =
    (tomorrowFallbackRow?.data as CachedNbaOddsPayload | null) ?? null;

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

export async function getResolvedNbaPropsCache(
  day: NbaOddsCacheDay,
  propType: NbaPropMarketType,
  now = new Date()
) {
  const expectedBusinessDate = getExpectedNbaBusinessDate(day, now);
  const primaryKey = `props_${day}_${propType}`;
  const primaryRow = await getCachedData(primaryKey);
  const primary = (primaryRow?.data as CachedNbaPropsPayload | null) ?? null;
  const tomorrowFallbackRow =
    day === "today" ? await getCachedData(`props_tomorrow_${propType}`) : null;
  const tomorrowFallback =
    (tomorrowFallbackRow?.data as CachedNbaPropsPayload | null) ?? null;

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
