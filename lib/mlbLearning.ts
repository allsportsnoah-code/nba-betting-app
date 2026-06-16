import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  getOrAnalyzeMlbPickGameReview,
  type MlbPickGameReview,
} from "@/lib/mlbGameReview";

type LearningPickRow = {
  id?: number | null;
  pick_date: string;
  game_label: string;
  game_start_time?: string | null;
  home_team: string | null;
  away_team: string | null;
  market_scope: string | null;
  market_type: string | null;
  side: string | null;
  line_taken: number | null;
  odds_taken?: number | null;
  projected_line?: number | null;
  projected_home_score: number | null;
  projected_away_score: number | null;
  final_score: string | null;
  final_stat?: number | null;
  status: string | null;
  units_result: number | null;
  confidence_score: number | null;
  edge: number | null;
  edge_label?: string | null;
  is_top_pick: boolean | null;
  notes: string | null;
  player_name?: string | null;
};

export type MlbTeamLearningAdjustment = {
  offenseRuns: number;
  defenseRuns: number;
  homeFieldRuns: number;
  totalBiasRuns: number;
  sampleSize: number;
};

export type MlbLearningProfile = {
  generatedAt: string;
  globalTotalBiasRuns: number;
  globalHomeFieldBiasRuns: number;
  marketPreferences: {
    moneyline: number;
    spread: number;
    total: number;
    plusRunLine: number;
    minusRunLine: number;
  };
  topPickPreferences: {
    moneyline: number;
    spread: number;
    total: number;
    pitcherStrikeouts: number;
    pitcherOuts: number;
    batterHits: number;
    batterTotalBases: number;
    batterRbis: number;
    batterRunsScored: number;
    batterHitsRunsRbis: number;
  };
  starRatingPreferences: {
    fiveStar: number;
    fourStar: number;
  };
  propMarketHealth: Record<string, MlbPropMarketHealth>;
  playerMarketCooldowns: Record<string, MlbPlayerMarketCooldown>;
  lossReviewAdjustments: MlbLossReviewAdjustments;
  teams: Record<string, MlbTeamLearningAdjustment>;
};

export type MlbPlayerMarketCooldown = {
  key: string;
  playerName: string;
  marketType: string;
  direction: MlbPropDirection;
  sampleSize: number;
  winRate: number;
  netUnits: number;
  recentSampleSize: number;
  recentWinRate: number;
  recentNetUnits: number;
  penalty: number;
  inCooldown: boolean;
  warning: string | null;
};

export type MlbLossReviewAdjustments = {
  teamSpreadTopPickPenalty: number;
  teamTotalTopPickPenalty: number;
  pitcherStrikeoutTopPickPenalty: number;
  pitcherOutsTopPickPenalty: number;
  pitcherStrikeoutLowIpPenalty: number;
  pitcherStrikeoutShortLeashPenalty: number;
  pitcherStrikeoutWorkloadDipPenalty: number;
  batterRunProductionTopPickPenalty: number;
  batterLowPaOverPenalty: number;
  summaries: {
    recentSpreadTopPickLosses: number;
    recentTotalTopPickLosses: number;
    recentPitcherStrikeoutTopPickLosses: number;
    recentPitcherOutsTopPickLosses: number;
    recentShortLeashPitcherTopPickLosses: number;
    recentWorkloadDipPitcherTopPickLosses: number;
    recentBatterRunProductionTopPickLosses: number;
    recentLowPaBatterTopPickLosses: number;
    softenedFineLosses: number;
    averageSpreadMiss: number;
    averageTotalMiss: number;
    averagePitcherStrikeoutMiss: number;
    averagePitcherOutsMiss: number;
    averageShortLeashPitcherMiss: number;
    averageWorkloadDipPitcherMiss: number;
    averageBatterRunProductionMiss: number;
    averageLowPaBatterMiss: number;
  };
};

export type MlbPropDirection = "over" | "under";

export type MlbPropDirectionHealth = {
  direction: MlbPropDirection;
  shadowEligibleSampleSize: number;
  shadowEligibleWinRate: number;
  shadowEligibleNetUnits: number;
  recentShadowEligibleSampleSize: number;
  recentShadowEligibleWinRate: number;
  recentShadowEligibleNetUnits: number;
  actualTopPickSampleSize: number;
  actualTopPickWinRate: number;
  actualTopPickNetUnits: number;
  inRotation: boolean;
  reentryReady: boolean;
  warning: string | null;
};

export type MlbPitcherWorkloadHealth = {
  direction: MlbPropDirection;
  sampleSize: number;
  winRate: number;
  netUnits: number;
  inRotation: boolean;
  warning: string | null;
};

export type MlbPropMarketHealth = {
  marketType: string;
  sampleSize: number;
  winRate: number;
  netUnits: number;
  recentSampleSize: number;
  recentWinRate: number;
  recentNetUnits: number;
  fiveStarSampleSize: number;
  fiveStarWinRate: number;
  fiveStarNetUnits: number;
  topPickSampleSize: number;
  topPickWinRate: number;
  topPickNetUnits: number;
  bestValueSampleSize: number;
  bestValueWinRate: number;
  bestValueNetUnits: number;
  maxStars: number;
  lockEligible: boolean;
  ratingAdjustment: number;
  warning: string | null;
  directionalTopPickHealth: Partial<Record<MlbPropDirection, MlbPropDirectionHealth>>;
  lowWorkloadDirectionHealth?: Partial<Record<MlbPropDirection, MlbPitcherWorkloadHealth>>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clipLearningError(value: number, cap: number) {
  return clamp(value, -cap, cap);
}

function getOutlierWeight(params: {
  actualTotal: number;
  projectedTotal: number;
  homeScore: number;
  awayScore: number;
  totalError: number;
  marginError: number;
  finalScore: string | null;
}) {
  let weight = 1;

  if (params.actualTotal >= 16) weight *= 0.55;
  if (params.actualTotal >= 19) weight *= 0.35;
  if (Math.abs(params.totalError) >= 6) weight *= 0.65;
  if (Math.abs(params.totalError) >= 9) weight *= 0.45;
  if (Math.abs(params.marginError) >= 6) weight *= 0.75;
  if (Math.abs(params.marginError) >= 9) weight *= 0.55;
  if (params.homeScore >= 11 || params.awayScore >= 11) weight *= 0.8;
  if (params.homeScore >= 14 || params.awayScore >= 14) weight *= 0.55;
  if (Math.abs(params.actualTotal - params.projectedTotal) >= 10) weight *= 0.4;

  const extraInningsMatch = params.finalScore?.match(/\(F\/(\d+)\)/i);
  const innings = extraInningsMatch ? Number(extraInningsMatch[1]) : null;
  if (innings && innings > 9) {
    weight *= 0.72;
    if (innings >= 11) weight *= 0.82;
    if (innings >= 12) weight *= 0.78;
  }

  return clamp(weight, 0.2, 1);
}

function parseFinalScore(finalScore: string | null, awayTeam: string | null, homeTeam: string | null) {
  if (!finalScore || !awayTeam || !homeTeam) return null;
  const pattern = new RegExp(`${awayTeam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)\\s+-\\s+${homeTeam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)`);
  const match = finalScore.match(pattern);
  if (!match) return null;

  return {
    awayScore: Number(match[1]),
    homeScore: Number(match[2]),
  };
}

function getDaysAgo(pickDate: string) {
  const now = new Date();
  const then = new Date(`${pickDate}T12:00:00Z`);
  return Math.max(0, (now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000));
}

function normalizePlayerName(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/ jr$/g, "")
    .replace(/ sr$/g, "")
    .replace(/ ii$/g, "")
    .replace(/ iii$/g, "")
    .replace(/ iv$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getPropDirectionFromSide(side: string | null | undefined) {
  const normalized = String(side ?? "").trim().toLowerCase();
  if (normalized.startsWith("over")) return "over" as const;
  if (normalized.startsWith("under")) return "under" as const;
  return null;
}

function isPitcherWorkloadMarketType(marketType: string | null | undefined) {
  return marketType === "pitcher_strikeouts" || marketType === "pitcher_outs";
}

function isBatterRunProductionMarketType(marketType: string | null | undefined) {
  return (
    marketType === "batter_rbis" ||
    marketType === "batter_runs_scored" ||
    marketType === "batter_hits_runs_rbis"
  );
}

function isShadowLearningPropMarket(marketType: string | null | undefined) {
  return (
    marketType === "pitcher_outs" ||
    marketType === "batter_rbis" ||
    marketType === "batter_runs_scored" ||
    marketType === "batter_hits_runs_rbis"
  );
}

function buildPlayerMarketCooldownKey(
  playerName: string | null | undefined,
  marketType: string | null | undefined,
  side: string | null | undefined
) {
  const direction = getPropDirectionFromSide(side);
  if (!playerName || !marketType || !direction) return null;
  return `${normalizePlayerName(playerName)}|${marketType}|${direction}`;
}

function extractProjectedPitcherInningsFromEdgeLabel(value: string | null | undefined) {
  const match = (value ?? "").match(/proj\s+(\d+(?:\.\d+)?)\s+IP/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractProjectedPitchCountFromEdgeLabel(value: string | null | undefined) {
  const match = (value ?? "").match(/\/\s*(\d+(?:\.\d+)?)\s+pitches/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractProjectedTimesThroughOrderFromEdgeLabel(value: string | null | undefined) {
  const match = (value ?? "").match(/\/\s*(\d+(?:\.\d+)?)x\s+order/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractHasPitchDipFromEdgeLabel(value: string | null | undefined) {
  return (value ?? "").toLowerCase().includes("pitch dip");
}

function extractProjectedPlateAppearancesFromEdgeLabel(value: string | null | undefined) {
  const match = (value ?? "").match(/proj\s+(\d+(?:\.\d+)?)\s+PA/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

type WeightedMiss = {
  miss: number;
  weight: number;
};

function getWeightedAverage(samples: WeightedMiss[]) {
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
  if (totalWeight <= 0) return 0;

  const weightedSum = samples.reduce((sum, sample) => sum + sample.miss * sample.weight, 0);
  return weightedSum / totalWeight;
}

function buildRecentMissPenalty(
  samples: WeightedMiss[],
  options: { threshold: number; scale: number; max: number }
) {
  if (samples.length === 0) return 0;

  const averageMiss = getWeightedAverage(samples);
  const sampleFactor =
    samples.length >= 4 ? 1 : samples.length === 3 ? 0.85 : samples.length === 2 ? 0.7 : 0.45;

  if (samples.length === 1 && averageMiss < options.threshold + 1.4) {
    return 0;
  }

  return Number(
    clamp(Math.max(0, averageMiss - options.threshold) * options.scale * sampleFactor, 0, options.max).toFixed(1)
  );
}

function getLossLearningWeightMultiplier(review: MlbPickGameReview | null | undefined) {
  if (!review?.shouldSoftenLearning) return 1;
  return clamp(Number(review.learningWeightMultiplier ?? 0.3), 0.15, 1);
}

async function buildMlbLossReviewMap(rows: LearningPickRow[]) {
  const recentTeamLosses = rows.filter(
    (row) =>
      row.id &&
      row.market_scope === "team" &&
      row.is_top_pick &&
      row.status === "loss" &&
      getDaysAgo(row.pick_date) <= 14
  );

  const entries = await Promise.all(
    recentTeamLosses.map(async (row) => {
      try {
        const review = await getOrAnalyzeMlbPickGameReview({
          pickId: Number(row.id),
          pickDate: row.pick_date,
          gameLabel: row.game_label,
          homeTeam: row.home_team,
          awayTeam: row.away_team,
          gameStartTime: row.game_start_time ?? null,
          side: row.side,
          lineTaken: row.line_taken,
          marketType: row.market_type,
          resultStatus: row.status,
        });

        return [Number(row.id), review] as const;
      } catch {
        return null;
      }
    })
  );

  return new Map(entries.filter((entry): entry is [number, MlbPickGameReview] => Boolean(entry)));
}

function buildLossReviewAdjustments(
  rows: LearningPickRow[],
  reviewByPickId: Map<number, MlbPickGameReview> = new Map()
): MlbLossReviewAdjustments {
  const recentTopPickLosses = rows.filter(
    (row) => row.is_top_pick && row.status === "loss" && getDaysAgo(row.pick_date) <= 14
  );
  const spreadMisses: WeightedMiss[] = [];
  const totalMisses: WeightedMiss[] = [];
  const pitcherStrikeoutMisses: WeightedMiss[] = [];
  const pitcherOutsMisses: WeightedMiss[] = [];
  const lowIpPitcherStrikeoutMisses: WeightedMiss[] = [];
  const shortLeashPitcherStrikeoutMisses: WeightedMiss[] = [];
  const workloadDipPitcherStrikeoutMisses: WeightedMiss[] = [];
  const batterRunProductionMisses: WeightedMiss[] = [];
  const lowPaBatterMisses: WeightedMiss[] = [];
  let softenedFineLosses = 0;

  for (const row of recentTopPickLosses) {
    const review = row.id ? reviewByPickId.get(Number(row.id)) : null;
    const reviewMultiplier = getLossLearningWeightMultiplier(review);
    const weight = Math.exp(-getDaysAgo(row.pick_date) / 6) * reviewMultiplier;
    if (reviewMultiplier < 1) softenedFineLosses += 1;

    if (
      row.market_scope === "team" &&
      row.final_score &&
      row.home_team &&
      row.away_team &&
      row.projected_home_score !== null &&
      row.projected_home_score !== undefined &&
      row.projected_away_score !== null &&
      row.projected_away_score !== undefined
    ) {
      const parsedFinal = parseFinalScore(row.final_score, row.away_team, row.home_team);
      if (!parsedFinal) continue;

      if (row.market_type === "spread") {
        const projectedMargin = row.projected_home_score - row.projected_away_score;
        const actualMargin = parsedFinal.homeScore - parsedFinal.awayScore;
        spreadMisses.push({
          miss: Math.abs(actualMargin - projectedMargin),
          weight,
        });
      } else if (row.market_type === "total") {
        const projectedTotal = row.projected_home_score + row.projected_away_score;
        const actualTotal = parsedFinal.homeScore + parsedFinal.awayScore;
        totalMisses.push({
          miss: Math.abs(actualTotal - projectedTotal),
          weight,
        });
      }
    }

    if (
      row.market_scope === "player_prop" &&
      row.projected_line !== null &&
      row.projected_line !== undefined &&
      row.final_stat !== null &&
      row.final_stat !== undefined
    ) {
      const miss = Math.abs(Number(row.final_stat) - Number(row.projected_line));

      if (row.market_type === "pitcher_strikeouts") {
        pitcherStrikeoutMisses.push({ miss, weight });
      }

      if (row.market_type === "pitcher_outs") {
        pitcherOutsMisses.push({ miss, weight });
      }

      if (isPitcherWorkloadMarketType(row.market_type)) {
        const projectedInnings = extractProjectedPitcherInningsFromEdgeLabel(row.edge_label);
        if (projectedInnings !== null && projectedInnings < 5.2) {
          lowIpPitcherStrikeoutMisses.push({ miss, weight });
        }

        const projectedPitchCount = extractProjectedPitchCountFromEdgeLabel(row.edge_label);
        const projectedTimesThroughOrder = extractProjectedTimesThroughOrderFromEdgeLabel(row.edge_label);
        if (
          (projectedPitchCount !== null && projectedPitchCount < 88) ||
          (projectedTimesThroughOrder !== null && projectedTimesThroughOrder < 2.6)
        ) {
          shortLeashPitcherStrikeoutMisses.push({ miss, weight });
        }

        if (extractHasPitchDipFromEdgeLabel(row.edge_label)) {
          workloadDipPitcherStrikeoutMisses.push({ miss, weight });
        }
      }

      if (isBatterRunProductionMarketType(row.market_type)) {
        batterRunProductionMisses.push({ miss, weight });
      }

      if (
        !isPitcherWorkloadMarketType(row.market_type) &&
        String(row.side ?? "").toLowerCase().startsWith("over")
      ) {
        const projectedPlateAppearances = extractProjectedPlateAppearancesFromEdgeLabel(row.edge_label);
        if (projectedPlateAppearances !== null && projectedPlateAppearances < 4) {
          lowPaBatterMisses.push({ miss, weight });
        }
      }
    }
  }

  return {
    teamSpreadTopPickPenalty: buildRecentMissPenalty(spreadMisses, {
      threshold: 4.4,
      scale: 1.4,
      max: 10,
    }),
    teamTotalTopPickPenalty: buildRecentMissPenalty(totalMisses, {
      threshold: 3.4,
      scale: 1.9,
      max: 12,
    }),
    pitcherStrikeoutTopPickPenalty: buildRecentMissPenalty(pitcherStrikeoutMisses, {
      threshold: 2.2,
      scale: 2.1,
      max: 12,
    }),
    pitcherOutsTopPickPenalty: buildRecentMissPenalty(pitcherOutsMisses, {
      threshold: 3.2,
      scale: 0.95,
      max: 12,
    }),
    pitcherStrikeoutLowIpPenalty: buildRecentMissPenalty(lowIpPitcherStrikeoutMisses, {
      threshold: 1.9,
      scale: 2.0,
      max: 10,
    }),
    pitcherStrikeoutShortLeashPenalty: buildRecentMissPenalty(shortLeashPitcherStrikeoutMisses, {
      threshold: 1.8,
      scale: 2.1,
      max: 10,
    }),
    pitcherStrikeoutWorkloadDipPenalty: buildRecentMissPenalty(workloadDipPitcherStrikeoutMisses, {
      threshold: 1.7,
      scale: 2.2,
      max: 8,
    }),
    batterRunProductionTopPickPenalty: buildRecentMissPenalty(batterRunProductionMisses, {
      threshold: 1.4,
      scale: 2.0,
      max: 10,
    }),
    batterLowPaOverPenalty: buildRecentMissPenalty(lowPaBatterMisses, {
      threshold: 1.3,
      scale: 2.2,
      max: 8,
    }),
    summaries: {
      recentSpreadTopPickLosses: spreadMisses.length,
      recentTotalTopPickLosses: totalMisses.length,
      recentPitcherStrikeoutTopPickLosses: pitcherStrikeoutMisses.length,
      recentPitcherOutsTopPickLosses: pitcherOutsMisses.length,
      recentShortLeashPitcherTopPickLosses: shortLeashPitcherStrikeoutMisses.length,
      recentWorkloadDipPitcherTopPickLosses: workloadDipPitcherStrikeoutMisses.length,
      recentBatterRunProductionTopPickLosses: batterRunProductionMisses.length,
      recentLowPaBatterTopPickLosses: lowPaBatterMisses.length,
      softenedFineLosses,
      averageSpreadMiss: Number(getWeightedAverage(spreadMisses).toFixed(2)),
      averageTotalMiss: Number(getWeightedAverage(totalMisses).toFixed(2)),
      averagePitcherStrikeoutMiss: Number(getWeightedAverage(pitcherStrikeoutMisses).toFixed(2)),
      averagePitcherOutsMiss: Number(getWeightedAverage(pitcherOutsMisses).toFixed(2)),
      averageShortLeashPitcherMiss: Number(getWeightedAverage(shortLeashPitcherStrikeoutMisses).toFixed(2)),
      averageWorkloadDipPitcherMiss: Number(getWeightedAverage(workloadDipPitcherStrikeoutMisses).toFixed(2)),
      averageBatterRunProductionMiss: Number(getWeightedAverage(batterRunProductionMisses).toFixed(2)),
      averageLowPaBatterMiss: Number(getWeightedAverage(lowPaBatterMisses).toFixed(2)),
    },
  };
}

function getPropDisplayStars(row: LearningPickRow) {
  const score = Number(row.confidence_score ?? 0);
  const edge = Math.abs(Number(row.edge ?? 0));

  if (score >= 82 && edge >= 1.6) return 5;
  if (score >= 68 && edge >= 1.1) return 4;
  if (score >= 54 && edge >= 0.7) return 3;
  if (score >= 42 && edge >= 0.35) return 2;
  return 1;
}

function getProfitPerUnit(american: number | null | undefined) {
  if (american === null || american === undefined) return 0;
  if (american > 0) return american / 100;
  return 100 / Math.abs(american);
}

function getPropDirection(side: string | null | undefined): MlbPropDirection | null {
  const normalized = String(side ?? "").trim().toLowerCase();
  if (normalized.startsWith("over")) return "over";
  if (normalized.startsWith("under")) return "under";
  return null;
}

function getPropWarningFlagsFromEdgeLabel(value: string | null | undefined) {
  const edgeLabel = String(value ?? "").toLowerCase();
  const flags = new Set<string>();

  if (edgeLabel.includes("low payout")) flags.add("low payout");
  if (edgeLabel.includes("thin prop edge")) flags.add("thin prop edge");
  if (edgeLabel.includes("thin probability edge")) flags.add("thin probability edge");
  if (edgeLabel.includes("pa risk")) flags.add("pa risk");
  if (edgeLabel.includes("workload risk")) flags.add("workload risk");
  if (edgeLabel.includes("run-production volatility")) flags.add("run-production volatility");
  if (edgeLabel.includes("market health is cold")) flags.add("market health is cold");
  if (edgeLabel.includes("watch:") && flags.size === 0) flags.add("watch");

  return Array.from(flags);
}

function meetsShadowTopPickBaseThreshold(row: LearningPickRow) {
  if (getPropDisplayStars(row) < 3) return false;
  if (Math.abs(Number(row.edge ?? 0)) < 0.7) return false;
  if (Number(row.confidence_score ?? 0) < 54) return false;

  const oddsPayout = getProfitPerUnit(row.odds_taken ?? null);
  if (oddsPayout < 0.5) return false;

  const flags = getPropWarningFlagsFromEdgeLabel(row.edge_label);
  return flags.every((flag) => flag === "market health is cold" || flag.startsWith("low payout"));
}

function summarizeDecisions(rows: LearningPickRow[]) {
  const decisions = rows.filter((row) => row.status === "win" || row.status === "loss");
  const wins = decisions.filter((row) => row.status === "win").length;
  const losses = decisions.filter((row) => row.status === "loss").length;
  const netUnits = decisions.reduce((sum, row) => sum + Number(row.units_result ?? 0), 0);

  return {
    sampleSize: decisions.length,
    wins,
    losses,
    winRate: decisions.length > 0 ? Number(((wins / decisions.length) * 100).toFixed(1)) : 0,
    netUnits: Number(netUnits.toFixed(2)),
  };
}

function buildPropDirectionHealth(
  rows: LearningPickRow[],
  direction: MlbPropDirection
): MlbPropDirectionHealth | null {
  const directionRows = rows.filter((row) => getPropDirection(row.side) === direction);
  if (directionRows.length === 0) return null;

  const shadowEligibleRows = directionRows.filter(meetsShadowTopPickBaseThreshold);
  const recentShadowEligibleRows = shadowEligibleRows.filter((row) => getDaysAgo(row.pick_date) <= 10);
  const actualTopPickRows = directionRows.filter((row) => row.is_top_pick);

  const shadow = summarizeDecisions(shadowEligibleRows);
  const recentShadow = summarizeDecisions(recentShadowEligibleRows);
  const actualTopPick = summarizeDecisions(actualTopPickRows);

  const enoughShadowSample = shadow.sampleSize >= 10;
  const enoughRecentShadowSample = recentShadow.sampleSize >= 6;
  const blockedByShadow =
    enoughShadowSample && (shadow.winRate < 50 || shadow.netUnits < 0);
  const blockedByRecentShadow =
    enoughRecentShadowSample && recentShadow.winRate < 48 && recentShadow.netUnits < 0;
  const inRotation = !(blockedByShadow || blockedByRecentShadow);
  const reentryReady =
    shadow.sampleSize >= 10 &&
    shadow.winRate >= 54 &&
    shadow.netUnits >= 0 &&
    (recentShadow.sampleSize < 6 ||
      (recentShadow.winRate >= 52 && recentShadow.netUnits >= 0));

  const warningParts: string[] = [];
  if (!inRotation) {
    warningParts.push(
      `${direction} shadow is ${shadow.winRate}% over ${shadow.sampleSize} eligible picks (${shadow.netUnits.toFixed(1)}u)`
    );
  } else if (reentryReady && shadow.sampleSize >= 10) {
    warningParts.push(
      `${direction} shadow recovered to ${shadow.winRate}% over ${shadow.sampleSize} eligible picks (${shadow.netUnits.toFixed(1)}u)`
    );
  }

  return {
    direction,
    shadowEligibleSampleSize: shadow.sampleSize,
    shadowEligibleWinRate: shadow.winRate,
    shadowEligibleNetUnits: shadow.netUnits,
    recentShadowEligibleSampleSize: recentShadow.sampleSize,
    recentShadowEligibleWinRate: recentShadow.winRate,
    recentShadowEligibleNetUnits: recentShadow.netUnits,
    actualTopPickSampleSize: actualTopPick.sampleSize,
    actualTopPickWinRate: actualTopPick.winRate,
    actualTopPickNetUnits: actualTopPick.netUnits,
    inRotation,
    reentryReady,
    warning: warningParts.length > 0 ? warningParts.join("; ") : null,
  };
}

function buildPitcherLowWorkloadDirectionHealth(
  rows: LearningPickRow[],
  marketType: string,
  direction: MlbPropDirection
): MlbPitcherWorkloadHealth | null {
  const splitRows = rows.filter((row) => {
    if (row.market_type !== marketType) return false;
    if (getPropDirection(row.side) !== direction) return false;
    const projectedInnings = extractProjectedPitcherInningsFromEdgeLabel(row.edge_label);
    return projectedInnings !== null && projectedInnings < 5;
  });

  if (splitRows.length === 0) return null;

  const summary = summarizeDecisions(splitRows);
  const inRotation =
    summary.sampleSize < 8 || !(summary.winRate < 50 || summary.netUnits < 0);
  const warning =
    summary.sampleSize >= 8
      ? `${direction} low-IP is ${summary.winRate}% over ${summary.sampleSize} picks (${summary.netUnits.toFixed(1)}u)`
      : null;

  return {
    direction,
    sampleSize: summary.sampleSize,
    winRate: summary.winRate,
    netUnits: summary.netUnits,
    inRotation,
    warning,
  };
}

function buildPropMarketHealth(marketType: string, rows: LearningPickRow[]): MlbPropMarketHealth {
  const marketRows = rows.filter(
    (row) =>
      row.market_scope === "player_prop" &&
      row.market_type === marketType &&
      (row.status === "win" || row.status === "loss")
  );
  const recentRows = marketRows.filter((row) => getDaysAgo(row.pick_date) <= 10);
  const fiveStarRows = marketRows.filter((row) => getPropDisplayStars(row) === 5);
  const topPickRows = marketRows.filter((row) => row.is_top_pick);
  const bestValueRows = marketRows.filter((row) => row.notes === "best_value");
  const directionalTopPickHealth = {
    over: buildPropDirectionHealth(marketRows, "over"),
    under: buildPropDirectionHealth(marketRows, "under"),
  } satisfies Partial<Record<MlbPropDirection, MlbPropDirectionHealth | null>>;
  const lowWorkloadDirectionHealth =
    isPitcherWorkloadMarketType(marketType)
      ? ({
          over: buildPitcherLowWorkloadDirectionHealth(marketRows, marketType, "over"),
          under: buildPitcherLowWorkloadDirectionHealth(marketRows, marketType, "under"),
        } satisfies Partial<Record<MlbPropDirection, MlbPitcherWorkloadHealth | null>>)
      : null;

  const all = summarizeDecisions(marketRows);
  const recent = summarizeDecisions(recentRows);
  const fiveStar = summarizeDecisions(fiveStarRows);
  const topPick = summarizeDecisions(topPickRows);
  const bestValue = summarizeDecisions(bestValueRows);

  let maxStars = 5;
  let lockEligible = true;
  const warnings: string[] = [];

  if (isShadowLearningPropMarket(marketType)) {
    if (all.sampleSize < 18) {
      maxStars = Math.min(maxStars, 2);
      lockEligible = false;
      warnings.push(`${marketType} is in shadow learning until it grades 18 settled picks`);
    } else if (all.sampleSize < 35) {
      maxStars = Math.min(maxStars, 4);
      lockEligible = false;
      warnings.push(`${marketType} is still ramping up (${all.sampleSize}/35 settled picks)`);
    }
  }

  if (all.sampleSize >= 30 && all.netUnits <= -8) {
    maxStars = Math.min(maxStars, 4);
    warnings.push(`${marketType} is down ${Math.abs(all.netUnits).toFixed(1)}u overall`);
  }

  if (recent.sampleSize >= 10 && recent.netUnits <= -4) {
    maxStars = Math.min(maxStars, 3);
    lockEligible = false;
    warnings.push(`${marketType} is cold recently (${recent.winRate}% over ${recent.sampleSize})`);
  }

  if (fiveStar.sampleSize >= 12 && fiveStar.winRate < all.winRate) {
    maxStars = Math.min(maxStars, 4);
    warnings.push(`5-star ${marketType} is underperforming the market average`);
  }

  if (fiveStar.sampleSize >= 12 && fiveStar.winRate < 54) {
    maxStars = Math.min(maxStars, 3);
    warnings.push(`5-star ${marketType} is only ${fiveStar.winRate}%`);
  }

  if (topPick.sampleSize >= 6 && topPick.winRate < 50) {
    lockEligible = false;
    maxStars = Math.min(maxStars, 3);
    warnings.push(`top-pick ${marketType} is only ${topPick.winRate}%`);
  }

  if (bestValue.sampleSize >= 5 && bestValue.winRate >= 58 && bestValue.netUnits > 0) {
    maxStars = Math.max(maxStars, 4);
    warnings.push(`best-value ${marketType} is carrying better than top picks`);
  }

  for (const direction of ["over", "under"] as const) {
    const directionHealth = directionalTopPickHealth[direction];
    if (directionHealth?.warning) {
      warnings.push(`${marketType} ${direction}: ${directionHealth.warning}`);
    }

    const workloadHealth = lowWorkloadDirectionHealth?.[direction];
    if (workloadHealth?.warning) {
      warnings.push(`${marketType} ${direction} low-IP: ${workloadHealth.warning}`);
    }
  }

  const ratingAdjustment = clamp(
    (all.winRate - 55) * 0.28 +
      Math.max(-8, Math.min(8, all.netUnits)) * 0.55 +
      (recent.winRate - 55) * 0.18 +
      Math.max(-6, Math.min(6, recent.netUnits)) * 0.75,
    -24,
    12
  );

  return {
    marketType,
    sampleSize: all.sampleSize,
    winRate: all.winRate,
    netUnits: all.netUnits,
    recentSampleSize: recent.sampleSize,
    recentWinRate: recent.winRate,
    recentNetUnits: recent.netUnits,
    fiveStarSampleSize: fiveStar.sampleSize,
    fiveStarWinRate: fiveStar.winRate,
    fiveStarNetUnits: fiveStar.netUnits,
    topPickSampleSize: topPick.sampleSize,
    topPickWinRate: topPick.winRate,
    topPickNetUnits: topPick.netUnits,
    bestValueSampleSize: bestValue.sampleSize,
    bestValueWinRate: bestValue.winRate,
    bestValueNetUnits: bestValue.netUnits,
    maxStars,
    lockEligible,
    ratingAdjustment: Number(ratingAdjustment.toFixed(1)),
    warning: warnings.length > 0 ? warnings.join("; ") : null,
    directionalTopPickHealth: {
      over: directionalTopPickHealth.over ?? undefined,
      under: directionalTopPickHealth.under ?? undefined,
    },
    lowWorkloadDirectionHealth:
      lowWorkloadDirectionHealth === null
        ? undefined
        : {
            over: lowWorkloadDirectionHealth.over ?? undefined,
            under: lowWorkloadDirectionHealth.under ?? undefined,
          },
  };
}

function buildPlayerMarketCooldowns(rows: LearningPickRow[]) {
  const sums = new Map<
    string,
    {
      playerName: string;
      marketType: string;
      direction: MlbPropDirection;
      sampleSize: number;
      winCount: number;
      netUnits: number;
      recentSampleSize: number;
      recentWinCount: number;
      recentNetUnits: number;
    }
  >();

  for (const row of rows) {
    if (row.market_scope !== "player_prop") continue;
    if (!(row.is_top_pick || row.notes === "best_value")) continue;
    if (!row.player_name || !row.market_type || !row.status || row.status === "pending") continue;

    const key = buildPlayerMarketCooldownKey(row.player_name, row.market_type, row.side);
    const direction = getPropDirectionFromSide(row.side);
    if (!key || !direction) continue;

    const existing =
      sums.get(key) ??
      {
        playerName: row.player_name,
        marketType: row.market_type,
        direction,
        sampleSize: 0,
        winCount: 0,
        netUnits: 0,
        recentSampleSize: 0,
        recentWinCount: 0,
        recentNetUnits: 0,
      };

    const units =
      row.status === "win"
        ? Number(row.units_result ?? 1)
        : row.status === "loss"
        ? Number(row.units_result ?? -1)
        : 0;

    existing.sampleSize += 1;
    existing.netUnits += units;
    if (row.status === "win") existing.winCount += 1;

    if (getDaysAgo(row.pick_date) <= 21) {
      existing.recentSampleSize += 1;
      existing.recentNetUnits += units;
      if (row.status === "win") existing.recentWinCount += 1;
    }

    sums.set(key, existing);
  }

  return Object.fromEntries(
    Array.from(sums.entries())
      .map(([key, sum]) => {
        const winRate = sum.sampleSize > 0 ? (sum.winCount / sum.sampleSize) * 100 : 0;
        const recentWinRate =
          sum.recentSampleSize > 0 ? (sum.recentWinCount / sum.recentSampleSize) * 100 : 0;
        const severeRecentSlide =
          sum.recentSampleSize >= 3 && recentWinRate < 34 && sum.recentNetUnits <= -2;
        const broadSlide = sum.sampleSize >= 4 && winRate < 42 && sum.netUnits <= -2;
        const inCooldown = severeRecentSlide || broadSlide;
        const penalty = inCooldown
          ? Number(
              clamp(
                6 +
                  Math.max(0, 45 - winRate) * 0.18 +
                  Math.max(0, Math.abs(Math.min(0, sum.netUnits)) - 1.5) * 1.8,
                6,
                18
              ).toFixed(1)
            )
          : 0;

        return [
          key,
          {
            key,
            playerName: sum.playerName,
            marketType: sum.marketType,
            direction: sum.direction,
            sampleSize: sum.sampleSize,
            winRate: Number(winRate.toFixed(1)),
            netUnits: Number(sum.netUnits.toFixed(2)),
            recentSampleSize: sum.recentSampleSize,
            recentWinRate: Number(recentWinRate.toFixed(1)),
            recentNetUnits: Number(sum.recentNetUnits.toFixed(2)),
            penalty,
            inCooldown,
            warning: inCooldown
              ? `${sum.playerName} ${sum.marketType} ${sum.direction} is ${sum.winCount}-${Math.max(
                  0,
                  sum.sampleSize - sum.winCount
                )} for ${sum.netUnits.toFixed(2)}u`
              : null,
          } satisfies MlbPlayerMarketCooldown,
        ] as const;
      })
      .filter((entry) => entry[1].inCooldown)
  );
}

export async function buildMlbLearningProfile(): Promise<MlbLearningProfile> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("picks")
    .select("id, pick_date, game_label, game_start_time, home_team, away_team, market_scope, market_type, side, line_taken, odds_taken, projected_line, projected_home_score, projected_away_score, final_score, final_stat, status, units_result, confidence_score, edge, edge_label, is_top_pick, notes, player_name")
    .eq("sport", "MLB")
    .not("final_score", "is", null)
    .neq("status", "pending")
    .order("pick_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as LearningPickRow[];
  const lossReviewByPickId = await buildMlbLossReviewMap(rows);
  const gameMap = new Map<string, LearningPickRow>();

  for (const row of rows.filter((item) => item.market_scope === "team")) {
    const key = `${row.pick_date}::${row.game_label}`;
    if (!gameMap.has(key)) {
      gameMap.set(key, row);
    }
  }

  const teamSums = new Map<
    string,
    {
      offenseWeighted: number;
      defenseWeighted: number;
      homeWeighted: number;
      totalWeighted: number;
      weight: number;
      homeWeight: number;
      samples: number;
    }
  >();

  let globalTotalWeighted = 0;
  let globalHomeWeighted = 0;
  let globalWeight = 0;
  const marketSums = {
    moneyline: { weighted: 0, weight: 0 },
    spread: { weighted: 0, weight: 0 },
    total: { weighted: 0, weight: 0 },
    plusRunLine: { weighted: 0, weight: 0 },
    minusRunLine: { weighted: 0, weight: 0 },
  };
  const topPickSums = {
    moneyline: { weighted: 0, weight: 0 },
    spread: { weighted: 0, weight: 0 },
    total: { weighted: 0, weight: 0 },
    pitcherStrikeouts: { weighted: 0, weight: 0 },
    pitcherOuts: { weighted: 0, weight: 0 },
    batterHits: { weighted: 0, weight: 0 },
    batterTotalBases: { weighted: 0, weight: 0 },
    batterRbis: { weighted: 0, weight: 0 },
    batterRunsScored: { weighted: 0, weight: 0 },
    batterHitsRunsRbis: { weighted: 0, weight: 0 },
  };
  const starSums = {
    fiveStar: { weighted: 0, weight: 0 },
    fourStar: { weighted: 0, weight: 0 },
  };

  for (const game of gameMap.values()) {
    const parsed = parseFinalScore(game.final_score, game.away_team, game.home_team);

    if (
      !parsed ||
      game.projected_home_score === null ||
      game.projected_away_score === null ||
      !game.home_team ||
      !game.away_team
    ) {
      continue;
    }

    const daysAgo = getDaysAgo(game.pick_date);
    const weight = Math.exp(-daysAgo / 18);
    const rawAwayOffenseError = parsed.awayScore - game.projected_away_score;
    const rawHomeOffenseError = parsed.homeScore - game.projected_home_score;
    const projectedTotal = game.projected_home_score + game.projected_away_score;
    const actualTotal = parsed.homeScore + parsed.awayScore;
    const rawTotalError = actualTotal - projectedTotal;
    const rawHomeMarginError =
      (parsed.homeScore - parsed.awayScore) - (game.projected_home_score - game.projected_away_score);
    const outlierWeight = getOutlierWeight({
      actualTotal,
      projectedTotal,
      homeScore: parsed.homeScore,
      awayScore: parsed.awayScore,
      totalError: rawTotalError,
      marginError: rawHomeMarginError,
      finalScore: game.final_score,
    });
    const weightedRecency = weight * outlierWeight;
    const awayOffenseError = clipLearningError(rawAwayOffenseError, 3.5);
    const homeOffenseError = clipLearningError(rawHomeOffenseError, 3.5);
    const totalError = clipLearningError(rawTotalError, 5.5);
    const homeMarginError = clipLearningError(rawHomeMarginError, 5);

    const awayEntry = teamSums.get(game.away_team) ?? {
      offenseWeighted: 0,
      defenseWeighted: 0,
      homeWeighted: 0,
      totalWeighted: 0,
      weight: 0,
      homeWeight: 0,
      samples: 0,
    };
    awayEntry.offenseWeighted += awayOffenseError * weightedRecency;
    awayEntry.defenseWeighted += -homeOffenseError * weightedRecency;
    awayEntry.totalWeighted += totalError * weightedRecency;
    awayEntry.weight += weightedRecency;
    awayEntry.samples += 1;
    teamSums.set(game.away_team, awayEntry);

    const homeEntry = teamSums.get(game.home_team) ?? {
      offenseWeighted: 0,
      defenseWeighted: 0,
      homeWeighted: 0,
      totalWeighted: 0,
      weight: 0,
      homeWeight: 0,
      samples: 0,
    };
    homeEntry.offenseWeighted += homeOffenseError * weightedRecency;
    homeEntry.defenseWeighted += -awayOffenseError * weightedRecency;
    homeEntry.homeWeighted += homeMarginError * weightedRecency;
    homeEntry.totalWeighted += totalError * weightedRecency;
    homeEntry.weight += weightedRecency;
    homeEntry.homeWeight += weightedRecency;
    homeEntry.samples += 1;
    teamSums.set(game.home_team, homeEntry);

    globalTotalWeighted += totalError * weightedRecency;
    globalHomeWeighted += homeMarginError * weightedRecency;
    globalWeight += weightedRecency;

  }

  for (const row of rows) {
    if (!row.status || row.status === "pending") continue;

    const realizedUnits =
      row.status === "win" ? 1 :
      row.status === "loss" ? -1 :
      0;
    const daysAgo = getDaysAgo(row.pick_date);
    const recencyWeight = Math.exp(-daysAgo / 14);
    const marketWeight = recencyWeight * 0.8;

    if (row.market_type === "moneyline") {
      marketSums.moneyline.weighted += realizedUnits * marketWeight;
      marketSums.moneyline.weight += marketWeight;
    } else if (row.market_type === "spread") {
      marketSums.spread.weighted += realizedUnits * marketWeight;
      marketSums.spread.weight += marketWeight;

      if ((row.line_taken ?? 0) > 0) {
        marketSums.plusRunLine.weighted += realizedUnits * marketWeight;
        marketSums.plusRunLine.weight += marketWeight;
      } else if ((row.line_taken ?? 0) < 0) {
        marketSums.minusRunLine.weighted += realizedUnits * marketWeight;
        marketSums.minusRunLine.weight += marketWeight;
      }
    } else if (row.market_type === "total") {
      marketSums.total.weighted += realizedUnits * marketWeight;
      marketSums.total.weight += marketWeight;
    }

    if (row.is_top_pick) {
      const topWeight = Math.exp(-daysAgo / 7) * 1.15;

      if (row.market_type === "moneyline") {
        topPickSums.moneyline.weighted += realizedUnits * topWeight;
        topPickSums.moneyline.weight += topWeight;
      } else if (row.market_type === "spread") {
        topPickSums.spread.weighted += realizedUnits * topWeight;
        topPickSums.spread.weight += topWeight;
      } else if (row.market_type === "total") {
        topPickSums.total.weighted += realizedUnits * topWeight;
        topPickSums.total.weight += topWeight;
      } else if (row.market_type === "pitcher_strikeouts") {
        topPickSums.pitcherStrikeouts.weighted += realizedUnits * topWeight;
        topPickSums.pitcherStrikeouts.weight += topWeight;
      } else if (row.market_type === "pitcher_outs") {
        topPickSums.pitcherOuts.weighted += realizedUnits * topWeight;
        topPickSums.pitcherOuts.weight += topWeight;
      } else if (row.market_type === "batter_hits") {
        topPickSums.batterHits.weighted += realizedUnits * topWeight;
        topPickSums.batterHits.weight += topWeight;
      } else if (row.market_type === "batter_total_bases") {
        topPickSums.batterTotalBases.weighted += realizedUnits * topWeight;
        topPickSums.batterTotalBases.weight += topWeight;
      } else if (row.market_type === "batter_rbis") {
        topPickSums.batterRbis.weighted += realizedUnits * topWeight;
        topPickSums.batterRbis.weight += topWeight;
      } else if (row.market_type === "batter_runs_scored") {
        topPickSums.batterRunsScored.weighted += realizedUnits * topWeight;
        topPickSums.batterRunsScored.weight += topWeight;
      } else if (row.market_type === "batter_hits_runs_rbis") {
        topPickSums.batterHitsRunsRbis.weighted += realizedUnits * topWeight;
        topPickSums.batterHitsRunsRbis.weight += topWeight;
      }
    }

    const confidenceScore = Number(row.confidence_score ?? 0);
    if (confidenceScore >= 100) {
      starSums.fiveStar.weighted += realizedUnits * recencyWeight;
      starSums.fiveStar.weight += recencyWeight;
    } else if (confidenceScore >= 80) {
      starSums.fourStar.weighted += realizedUnits * recencyWeight;
      starSums.fourStar.weight += recencyWeight;
    }
  }

  const toMarketPreference = (sum: { weighted: number; weight: number }, scale = 7, limit = 8) =>
    Number(clamp((sum.weight > 0 ? (sum.weighted / sum.weight) * scale : 0), -limit, limit).toFixed(2));

  const teams: Record<string, MlbTeamLearningAdjustment> = {};

  for (const [team, sum] of teamSums.entries()) {
    const weight = Math.max(sum.weight, 0.01);
    const offenseAvg = sum.offenseWeighted / weight;
    const defenseAvg = sum.defenseWeighted / weight;
    const totalAvg = sum.totalWeighted / weight;
    const homeAvg = sum.homeWeight > 0 ? sum.homeWeighted / sum.homeWeight : 0;

    teams[team] = {
      offenseRuns: Number(clamp(offenseAvg * 0.22, -0.35, 0.35).toFixed(2)),
      defenseRuns: Number(clamp(defenseAvg * 0.22, -0.35, 0.35).toFixed(2)),
      homeFieldRuns: Number(clamp(homeAvg * 0.12, -0.18, 0.18).toFixed(2)),
      totalBiasRuns: Number(clamp(totalAvg * 0.16, -0.25, 0.25).toFixed(2)),
      sampleSize: sum.samples,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    globalTotalBiasRuns: Number(clamp((globalTotalWeighted / Math.max(globalWeight, 0.01)) * 0.14, -0.2, 0.2).toFixed(2)),
    globalHomeFieldBiasRuns: Number(clamp((globalHomeWeighted / Math.max(globalWeight, 0.01)) * 0.08, -0.12, 0.12).toFixed(2)),
    marketPreferences: {
      moneyline: toMarketPreference(marketSums.moneyline),
      spread: toMarketPreference(marketSums.spread),
      total: toMarketPreference(marketSums.total),
      plusRunLine: toMarketPreference(marketSums.plusRunLine),
      minusRunLine: toMarketPreference(marketSums.minusRunLine),
    },
    topPickPreferences: {
      moneyline: toMarketPreference(topPickSums.moneyline, 10, 12),
      spread: toMarketPreference(topPickSums.spread, 10, 12),
      total: toMarketPreference(topPickSums.total, 10, 12),
      pitcherStrikeouts: toMarketPreference(topPickSums.pitcherStrikeouts, 10, 12),
      pitcherOuts: toMarketPreference(topPickSums.pitcherOuts, 10, 12),
      batterHits: toMarketPreference(topPickSums.batterHits, 10, 12),
      batterTotalBases: toMarketPreference(topPickSums.batterTotalBases, 10, 12),
      batterRbis: toMarketPreference(topPickSums.batterRbis, 10, 12),
      batterRunsScored: toMarketPreference(topPickSums.batterRunsScored, 10, 12),
      batterHitsRunsRbis: toMarketPreference(topPickSums.batterHitsRunsRbis, 10, 12),
    },
    starRatingPreferences: {
      fiveStar: toMarketPreference(starSums.fiveStar, 8, 10),
      fourStar: toMarketPreference(starSums.fourStar, 6, 8),
    },
    propMarketHealth: {
      pitcher_strikeouts: buildPropMarketHealth("pitcher_strikeouts", rows),
      pitcher_outs: buildPropMarketHealth("pitcher_outs", rows),
      batter_hits: buildPropMarketHealth("batter_hits", rows),
      batter_total_bases: buildPropMarketHealth("batter_total_bases", rows),
      batter_rbis: buildPropMarketHealth("batter_rbis", rows),
      batter_runs_scored: buildPropMarketHealth("batter_runs_scored", rows),
      batter_hits_runs_rbis: buildPropMarketHealth("batter_hits_runs_rbis", rows),
    },
    playerMarketCooldowns: buildPlayerMarketCooldowns(rows),
    lossReviewAdjustments: buildLossReviewAdjustments(rows, lossReviewByPickId),
    teams,
  };
}
