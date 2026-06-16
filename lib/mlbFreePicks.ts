import { americanToImpliedProb } from "@/lib/mlbModel";
import { getConfidenceStars } from "@/lib/starRatings";
import { americanToProfitPerUnit } from "@/lib/units";

export const FREE_PICK_PAYOUT_FLOOR = 0.63;
export const FIVE_STAR_FREE_PICK_PAYOUT_FLOOR = 0.5;

export type MlbFreePickLike = {
  id: number;
  pick_date?: string | null;
  sport?: string | null;
  market_scope?: string | null;
  market_type?: string | null;
  game_label?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  player_name?: string | null;
  side: string;
  line_taken?: number | null;
  odds_taken?: number | null;
  projected_line?: number | null;
  market_line?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  confidence_score?: number | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
  projected_side_margin?: number | null;
  cover_buffer?: number | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  game_start_time?: string | null;
};

function getProjectedMargin(pick: MlbFreePickLike) {
  if (
    pick.projected_home_score === null ||
    pick.projected_home_score === undefined ||
    pick.projected_away_score === null ||
    pick.projected_away_score === undefined
  ) {
    return null;
  }

  return Number(pick.projected_home_score) - Number(pick.projected_away_score);
}

function getProjectedSideMargin(pick: MlbFreePickLike) {
  if (pick.projected_side_margin !== null && pick.projected_side_margin !== undefined) {
    return pick.projected_side_margin;
  }

  const projectedMargin = getProjectedMargin(pick);
  if (projectedMargin === null) return null;

  if (pick.market_type === "moneyline" || pick.market_type === "spread") {
    const [labelAwayTeam, labelHomeTeam] = (pick.game_label ?? "").split(" @ ");
    const awayTeam = pick.away_team ?? labelAwayTeam;
    const homeTeam = pick.home_team ?? labelHomeTeam;
    const normalizedSide = pick.side.replace(/\s*[+-]?\d+(\.\d+)?$/, "").trim();

    if (homeTeam && normalizedSide === homeTeam) return projectedMargin;
    if (awayTeam && normalizedSide === awayTeam) return projectedMargin * -1;
  }

  return null;
}

function getCoverBuffer(pick: MlbFreePickLike) {
  if (pick.cover_buffer !== null && pick.cover_buffer !== undefined) {
    return pick.cover_buffer;
  }

  if (pick.market_type !== "spread" || pick.line_taken === null || pick.line_taken === undefined) {
    return null;
  }

  const projectedSideMargin = getProjectedSideMargin(pick);
  if (projectedSideMargin === null) return null;

  return Number((projectedSideMargin + pick.line_taken).toFixed(2));
}

export function getMlbFreePickBaseStars(pick: MlbFreePickLike) {
  return getConfidenceStars({
    sport: "MLB",
    marketType: pick.market_type,
    edge: pick.edge,
    confidenceScore: pick.confidence_score,
    projectedSideMargin: getProjectedSideMargin(pick),
    coverBuffer: getCoverBuffer(pick),
    gameStartTime: pick.game_start_time,
  });
}

export function getMlbFreePickRiskCapReasons(pick: MlbFreePickLike) {
  const baseStars = getMlbFreePickBaseStars(pick);
  return getBlockingFreePickWatchItems(pick.edge_label, baseStars, pick.market_scope);
}

export function getMlbFreePickStars(pick: MlbFreePickLike) {
  const baseStars = getMlbFreePickBaseStars(pick);
  const riskCapReasons = getMlbFreePickRiskCapReasons(pick);

  if (baseStars >= 5 && riskCapReasons.length > 0) {
    return 4;
  }

  return baseStars;
}

export function getMlbDisplayStars(
  pick: MlbFreePickLike,
  frozenStars: number | null | undefined,
  preserveFrozenStars = false
) {
  const cappedStars = getMlbFreePickStars(pick);
  if (typeof frozenStars !== "number") return cappedStars;
  return preserveFrozenStars ? frozenStars : Math.min(frozenStars, cappedStars);
}

export function getFreePickPayoutFloor(stars: number) {
  return stars >= 5 ? FIVE_STAR_FREE_PICK_PAYOUT_FLOOR : FREE_PICK_PAYOUT_FLOOR;
}

function getBlockingFreePickWatchItems(
  value: string | null | undefined,
  stars: number,
  marketScope?: string | null
) {
  const watchItems = (value ?? "")
    .split(" | ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("Watch:") || part.startsWith("Learning:"))
    .flatMap((part) =>
      part
        .replace(/^(Watch|Learning):\s*/, "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );

  if (stars >= 5) {
    const blockingItems = watchItems.filter((item) => !item.toLowerCase().startsWith("low payout"));
    const isTeamPick = marketScope === "team";
    const hasOnlyLineupInjuryImpact =
      blockingItems.length === 1 && blockingItems[0].toLowerCase().includes("lineup has notable recent injury impact");

    if (isTeamPick && hasOnlyLineupInjuryImpact) {
      return [];
    }

    return blockingItems;
  }

  return watchItems;
}

function hasBlockingFreePickWatch(value: string | null | undefined, stars: number) {
  return getBlockingFreePickWatchItems(value, stars).length > 0;
}

function isTopOrValuePick(pick: MlbFreePickLike) {
  return Boolean(pick.is_top_pick) || pick.notes === "best_value";
}

function isTeamFreePickEligible(pick: MlbFreePickLike) {
  if (getMlbFreePickExclusionReasons(pick).length > 0) return false;

  if (pick.market_scope !== "team") return false;

  return true;
}

function isPropFreePickEligible(pick: MlbFreePickLike) {
  if (getMlbFreePickExclusionReasons(pick).length > 0) return false;

  if (pick.market_scope !== "player_prop") return false;

  return true;
}

export function getMlbFreePickExclusionReasons(pick: MlbFreePickLike) {
  const reasons: string[] = [];
  const baseStars = getMlbFreePickBaseStars(pick);
  const stars = getMlbFreePickStars(pick);
  const payout = americanToProfitPerUnit(Number(pick.odds_taken ?? 0));
  const payoutFloor = getFreePickPayoutFloor(stars);
  const edge = Math.abs(Number(pick.edge ?? 0));
  const confidence = Number(pick.confidence_score ?? 0);
  const projectedSideMargin = getProjectedSideMargin(pick);
  const coverBuffer = getCoverBuffer(pick);

  if (pick.sport !== "MLB") reasons.push("not an MLB pick");
  if (pick.market_scope !== "team" && pick.market_scope !== "player_prop") {
    reasons.push("not a team/player prop pick");
  }
  if (!isTopOrValuePick(pick)) reasons.push("not on Top Picks or Best Value");
  if (payout < payoutFloor) reasons.push(`payout ${payout.toFixed(2)}u below ${payoutFloor.toFixed(2)}u floor`);
  if (stars < 4) reasons.push(`${stars} Stars is below the Free Picks floor`);
  const blockingWatchItems = getBlockingFreePickWatchItems(pick.edge_label, baseStars, pick.market_scope);
  if (blockingWatchItems.length > 0) {
    reasons.push(`Watch/Learning flag: ${blockingWatchItems[0]}`);
  }

  if (pick.market_scope === "team") {
    if (pick.market_type === "moneyline") {
      if (edge < 4.5) reasons.push("moneyline edge is below Free Picks floor");
      if ((projectedSideMargin ?? 0) < 0.75) reasons.push("projected winner support is too thin");
    } else if (pick.market_type === "spread") {
      if (edge < 0.6) reasons.push("run-line edge is below Free Picks floor");
      if ((coverBuffer ?? 0) < 0.7) reasons.push("run-line cover buffer is too thin");
    } else if (pick.market_type === "total") {
      if (edge < 0.8) reasons.push("total edge is below Free Picks floor");
    } else {
      reasons.push("unsupported team market");
    }
  }

  if (pick.market_scope === "player_prop") {
    if (confidence < 68) reasons.push("prop confidence is below 68");
    if (edge < 1.1) reasons.push("prop edge is below 1.1");
  }

  return reasons;
}

export function isMlbFreePickEligible(pick: MlbFreePickLike) {
  return isTeamFreePickEligible(pick) || isPropFreePickEligible(pick);
}

function getTeamFreePickScore(pick: MlbFreePickLike) {
  const payout = americanToProfitPerUnit(Number(pick.odds_taken ?? 0));
  const impliedProb = americanToImpliedProb(Number(pick.odds_taken ?? 0));
  const stars = getMlbFreePickStars(pick);
  const confidence = Number(pick.confidence_score ?? stars * 20);
  const projectedSideMargin = getProjectedSideMargin(pick);
  const coverBuffer = getCoverBuffer(pick);
  const edge = Math.abs(Number(pick.edge ?? 0));
  const payoutPenalty = payout > 1.2 ? Math.min((payout - 1.2) * 18, 18) : 0;
  let supportScore = edge * 3;

  if (pick.market_type === "spread") {
    supportScore += Math.max(0, coverBuffer ?? 0) * 16;
  }

  if (pick.market_type === "moneyline") {
    supportScore += Math.max(0, projectedSideMargin ?? 0) * 22;
  }

  if (pick.market_type === "total") {
    supportScore += edge * 6;
  }

  return Number(
    (
      confidence * 0.85 +
      impliedProb * 95 +
      stars * 16 +
      supportScore +
      (pick.is_top_pick ? 9 : 0) +
      (pick.notes === "best_value" ? 4 : 0) -
      payoutPenalty
    ).toFixed(2)
  );
}

function getPropFreePickScore(pick: MlbFreePickLike) {
  const payout = americanToProfitPerUnit(Number(pick.odds_taken ?? 0));
  const impliedProb = americanToImpliedProb(Number(pick.odds_taken ?? 0));
  const stars = getMlbFreePickStars(pick);
  const confidence = Number(pick.confidence_score ?? stars * 20);
  const edge = Math.abs(Number(pick.edge ?? 0));
  const projectedLine = Number(pick.projected_line ?? NaN);
  const marketLine = Number(pick.market_line ?? pick.line_taken ?? NaN);
  const lineSupport =
    Number.isFinite(projectedLine) && Number.isFinite(marketLine)
      ? Math.abs(projectedLine - marketLine)
      : 0;
  const payoutPenalty = payout > 1.2 ? Math.min((payout - 1.2) * 18, 18) : 0;

  return Number(
    (
      confidence * 0.9 +
      impliedProb * 90 +
      stars * 16 +
      edge * 10 +
      lineSupport * 12 +
      (pick.is_top_pick ? 9 : 0) +
      (pick.notes === "best_value" ? 4 : 0) -
      payoutPenalty
    ).toFixed(2)
  );
}

export function getMlbFreePickScore(pick: MlbFreePickLike) {
  return pick.market_scope === "player_prop" ? getPropFreePickScore(pick) : getTeamFreePickScore(pick);
}

export function rankMlbFreePickRows<T extends MlbFreePickLike>(rows: T[], limit = 3) {
  const deduped = new Map<number, T>();

  for (const row of rows) {
    deduped.set(row.id, row);
  }

  return Array.from(deduped.values())
    .filter(isMlbFreePickEligible)
    .sort((a, b) => {
      const starDelta = getMlbFreePickStars(b) - getMlbFreePickStars(a);
      if (starDelta !== 0) return starDelta;

      const scoreDelta = getMlbFreePickScore(b) - getMlbFreePickScore(a);
      if (scoreDelta !== 0) return scoreDelta;

      return americanToProfitPerUnit(Number(b.odds_taken ?? 0)) - americanToProfitPerUnit(Number(a.odds_taken ?? 0));
    })
    .slice(0, limit);
}

export function buildMlbFreePickRows<T extends MlbFreePickLike>(rows: T[], limit = 3) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const pickDate = row.pick_date ?? "";
    const existing = grouped.get(pickDate) ?? [];
    existing.push(row);
    grouped.set(pickDate, existing);
  }

  return Array.from(grouped.values()).flatMap((dayRows) => rankMlbFreePickRows(dayRows, limit));
}
