import {
  getFreePickPayoutFloor,
  getMlbDisplayStars,
  getMlbFreePickBaseStars,
  getMlbFreePickExclusionReasons,
  getMlbFreePickScore,
  type MlbFreePickLike,
} from "@/lib/mlbFreePicks";
import { hasNbaTeamFreePickRiskCap } from "@/lib/nbaFreePickRisk";
import { getPickConfidenceStars } from "@/lib/starRatings";
import { capNbaMoneylineEdge } from "@/lib/teamModel";
import { americanToProfitPerUnit } from "@/lib/units";

export type PublicFreePickLike = MlbFreePickLike & {
  created_at?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  status?: string | null;
  units_result?: number | null;
};

function normalizeSport(value: string | null | undefined) {
  return (value ?? "").toUpperCase();
}

function isTopOrValuePick(pick: PublicFreePickLike) {
  return Boolean(pick.is_top_pick) || pick.notes === "best_value";
}

function getNbaWatchItems(value: string | null | undefined) {
  return (value ?? "")
    .split(" | ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("Watch:") || part.startsWith("Learning:"))
    .flatMap((part) =>
      part
        .replace(/^(Watch|Learning):\s*/, "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
    .filter((item) => !item.toLowerCase().startsWith("low payout"));
}

export function getPublicFreePickBaseStars(pick: PublicFreePickLike) {
  if (normalizeSport(pick.sport) === "MLB") {
    return getMlbFreePickBaseStars({
      ...pick,
      sport: "MLB",
    });
  }

  if (normalizeSport(pick.sport) === "NBA") {
    return getPickConfidenceStars({
      ...pick,
      sport: "NBA",
    });
  }

  return getPickConfidenceStars(pick);
}

export function getPublicFreePickStars(
  pick: PublicFreePickLike,
  frozenStars?: number | null,
  preserveFrozenStars = false
) {
  if (normalizeSport(pick.sport) === "MLB") {
    return getMlbDisplayStars(
      {
        ...pick,
        sport: "MLB",
      },
      frozenStars,
      preserveFrozenStars
    );
  }

  if (normalizeSport(pick.sport) === "NBA") {
    const baseStars = getPublicFreePickBaseStars(pick);
    const cappedStars = baseStars >= 5 && hasNbaTeamFreePickRiskCap(pick) ? 4 : baseStars;
    if (typeof frozenStars !== "number") return cappedStars;
    return preserveFrozenStars ? frozenStars : Math.min(frozenStars, cappedStars);
  }

  return getPublicFreePickBaseStars(pick);
}

export function getPublicFreePickExclusionReasons(pick: PublicFreePickLike) {
  if (normalizeSport(pick.sport) === "MLB") {
    return getMlbFreePickExclusionReasons({
      ...pick,
      sport: "MLB",
    });
  }

  const reasons: string[] = [];
  const sport = normalizeSport(pick.sport);
  const baseStars = getPublicFreePickBaseStars(pick);
  const stars = getPublicFreePickStars(pick);
  const payout = americanToProfitPerUnit(Number(pick.odds_taken ?? 0));

  if (sport !== "NBA") reasons.push("not an NBA/MLB pick");
  if (pick.market_scope !== "team" && pick.market_scope !== "player_prop") {
    reasons.push("not a team/player prop pick");
  }
  if (!isTopOrValuePick(pick)) reasons.push("not on Top Picks or Best Value");
  if (stars < 5) {
    reasons.push(baseStars >= 5 ? "NBA risk cap lowered it below 5 Stars" : `${stars} Stars is below the NBA Free Picks floor`);
  }
  if (payout < getFreePickPayoutFloor(stars)) {
    reasons.push(`payout ${payout.toFixed(2)}u below ${getFreePickPayoutFloor(stars).toFixed(2)}u floor`);
  }

  const watchItems = getNbaWatchItems(pick.edge_label);
  if (pick.market_scope === "player_prop" && watchItems.length > 0) {
    reasons.push(`Watch/Learning flag: ${watchItems[0]}`);
  }

  return reasons;
}

export function isPublicFreePickEligible(pick: PublicFreePickLike) {
  return getPublicFreePickExclusionReasons(pick).length === 0;
}

export function getPublicFreePickScore(pick: PublicFreePickLike) {
  if (normalizeSport(pick.sport) === "MLB") {
    return getMlbFreePickScore({
      ...pick,
      sport: "MLB",
    });
  }

  const payout = americanToProfitPerUnit(Number(pick.odds_taken ?? 0));
  const stars = getPublicFreePickStars(pick);
  const confidence = Number(pick.confidence_score ?? stars * 20);
  const rawEdge = Number(pick.edge ?? 0);
  const cappedEdge =
    pick.market_scope === "team" && pick.market_type === "moneyline"
      ? capNbaMoneylineEdge(rawEdge) ?? rawEdge
      : rawEdge;
  const edge = Math.abs(cappedEdge);
  const projectedLine = Number(pick.projected_line ?? NaN);
  const marketLine = Number(pick.market_line ?? pick.line_taken ?? NaN);
  const lineSupport =
    Number.isFinite(projectedLine) && Number.isFinite(marketLine)
      ? Math.abs(projectedLine - marketLine)
      : 0;

  return Number(
    (
      confidence * 0.9 +
      stars * 18 +
      edge * (pick.market_scope === "player_prop" ? 8 : 12) +
      lineSupport * 8 +
      Math.min(payout, 1.35) * 12 +
      (pick.is_top_pick ? 9 : 0) +
      (pick.notes === "best_value" ? 4 : 0)
    ).toFixed(2)
  );
}

export function rankPublicFreePickRows<T extends PublicFreePickLike>(
  rows: T[],
  options?: { limit?: number; frozenIds?: number[] | null }
) {
  const limit = options?.limit ?? 3;
  const deduped = new Map<number, T>();

  for (const row of rows) {
    deduped.set(row.id, row);
  }

  const frozenRows = (options?.frozenIds ?? [])
    .map((id) => deduped.get(id))
    .filter((row): row is T => Boolean(row));
  const frozenIds = new Set(frozenRows.map((row) => row.id));
  const rankedRows = Array.from(deduped.values())
    .filter((row) => !frozenIds.has(row.id))
    .filter(isPublicFreePickEligible)
    .sort((a, b) => {
      const starDelta = getPublicFreePickStars(b) - getPublicFreePickStars(a);
      if (starDelta !== 0) return starDelta;

      const scoreDelta = getPublicFreePickScore(b) - getPublicFreePickScore(a);
      if (scoreDelta !== 0) return scoreDelta;

      return americanToProfitPerUnit(Number(b.odds_taken ?? 0)) - americanToProfitPerUnit(Number(a.odds_taken ?? 0));
    });

  return [...frozenRows, ...rankedRows].slice(0, limit);
}

export function getStoredPublicFreePickRows<T extends PublicFreePickLike>(
  rows: T[],
  freePickIds: number[] | null | undefined,
  limit = 3
) {
  if (!freePickIds || freePickIds.length === 0) return [];

  const rowById = new Map(rows.map((row) => [row.id, row]));
  return freePickIds
    .slice(0, limit)
    .map((id) => rowById.get(id))
    .filter((row): row is T => Boolean(row));
}

export function rankPublicFreePickRowsForHistory<T extends PublicFreePickLike>(
  rows: T[],
  storedFreePickIds?: number[] | null,
  limit = 3
) {
  const storedRows = getStoredPublicFreePickRows(rows, storedFreePickIds, limit);
  if (storedFreePickIds && storedFreePickIds.length > 0) {
    return storedRows;
  }

  return rankPublicFreePickRows(rows, { limit });
}

export function buildPublicFreePickRows<T extends PublicFreePickLike>(rows: T[], limit = 3) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const pickDate = row.pick_date ?? "";
    const existing = grouped.get(pickDate) ?? [];
    existing.push(row);
    grouped.set(pickDate, existing);
  }

  return Array.from(grouped.values()).flatMap((dayRows) => rankPublicFreePickRows(dayRows, { limit }));
}
