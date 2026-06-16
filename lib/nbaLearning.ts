import { unstable_cache } from "next/cache";
import { analyzeNbaGameForLearning, type NbaGameReview } from "@/lib/nbaGameReview";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { NbaTeamMarketType } from "@/lib/teamModel";

type NbaSettledTeamRow = {
  pick_date?: string | null;
  game_label?: string | null;
  game_start_time?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  market_type?: string | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  final_score?: string | null;
  status?: string | null;
  units_result?: number | null;
  is_top_pick?: boolean | null;
  notes?: string | null;
};

type TeamAdjustmentAccumulator = {
  offenseSum: number;
  defenseSum: number;
  sample: number;
};

type MarketStatAccumulator = {
  decisions: number;
  wins: number;
  units: number;
};

export type NbaTeamLearningAdjustment = {
  offenseDelta: number;
  defenseDelta: number;
  sample: number;
};

export type NbaMarketPreference = {
  topPickAdjustment: number;
  bestValueAdjustment: number;
  topPickSample: number;
  bestValueSample: number;
};

export type NbaMatchupAdjustment = {
  pairKey: string;
  totalDelta: number;
  totalSample: number;
  homeTeamBias: Record<
    string,
    {
      marginDelta: number;
      sample: number;
    }
  >;
};

export type NbaLearningProfile = {
  teams: Record<string, NbaTeamLearningAdjustment>;
  marketPreferences: Record<NbaTeamMarketType, NbaMarketPreference>;
  matchupAdjustments: Record<string, NbaMatchupAdjustment>;
  globalHomeBiasPoints: number;
  globalTotalBiasPoints: number;
  excludedGames: Array<{
    pickDate: string;
    gameLabel: string;
    reasons: string[];
  }>;
};

function normalizeLookupValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function clip(value: number, cap: number) {
  return Math.max(-cap, Math.min(cap, value));
}

function buildGameKey(row: Pick<NbaSettledTeamRow, "pick_date" | "game_label">) {
  return `${row.pick_date ?? ""}::${row.game_label ?? ""}`;
}

function buildMatchupPairKey(homeTeam: string | null | undefined, awayTeam: string | null | undefined) {
  return [homeTeam ?? "", awayTeam ?? ""].sort((a, b) => a.localeCompare(b)).join("::");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseFinalScore(row: NbaSettledTeamRow) {
  if (!row.final_score || !row.home_team || !row.away_team) return null;

  const pattern = new RegExp(
    `^${escapeRegExp(row.away_team)}\\s+(\\d+)\\s+-\\s+${escapeRegExp(row.home_team)}\\s+(\\d+)`,
    "i"
  );
  const match = row.final_score.match(pattern);
  if (!match) return null;

  const awayScore = Number(match[1] ?? NaN);
  const homeScore = Number(match[2] ?? NaN);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

  return { homeScore, awayScore };
}

function getOfficialBucket(row: NbaSettledTeamRow) {
  if (row.is_top_pick) return "top";
  if (row.notes === "best_value") return "value";
  return null;
}

function createEmptyMarketPreference(): Record<NbaTeamMarketType, NbaMarketPreference> {
  return {
    moneyline: {
      topPickAdjustment: 0,
      bestValueAdjustment: 0,
      topPickSample: 0,
      bestValueSample: 0,
    },
    spread: {
      topPickAdjustment: 0,
      bestValueAdjustment: 0,
      topPickSample: 0,
      bestValueSample: 0,
    },
    total: {
      topPickAdjustment: 0,
      bestValueAdjustment: 0,
      topPickSample: 0,
      bestValueSample: 0,
    },
  };
}

function scoreMarketAdjustment(stats: MarketStatAccumulator) {
  if (stats.decisions < 5) return 0;

  const winRate = stats.wins / stats.decisions;
  const unitsPerDecision = stats.units / stats.decisions;
  return Number(clip((winRate - 0.53) * 16 + unitsPerDecision * 5, 3.5).toFixed(2));
}

export function getNbaTopPickLearningAdjustment(
  marketType: NbaTeamMarketType,
  profile: NbaLearningProfile | null | undefined
) {
  return profile?.marketPreferences?.[marketType]?.topPickAdjustment ?? 0;
}

export function getNbaBestValueLearningAdjustment(
  marketType: NbaTeamMarketType,
  profile: NbaLearningProfile | null | undefined
) {
  return profile?.marketPreferences?.[marketType]?.bestValueAdjustment ?? 0;
}

async function computeNbaLearningProfile(): Promise<NbaLearningProfile> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("picks")
    .select("*")
    .eq("sport", "NBA")
    .eq("market_scope", "team")
    .in("status", ["win", "loss", "push"])
    .order("pick_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as NbaSettledTeamRow[];
  const gameRows = new Map<string, NbaSettledTeamRow>();
  const excludedGames: NbaGameReview[] = [];
  const excludedGameKeys = new Set<string>();

  for (const row of rows) {
    if (
      !row.pick_date ||
      !row.game_label ||
      !row.home_team ||
      !row.away_team ||
      row.projected_home_score === null ||
      row.projected_home_score === undefined ||
      row.projected_away_score === null ||
      row.projected_away_score === undefined ||
      !row.final_score
    ) {
      continue;
    }

    const key = buildGameKey(row);
    if (!gameRows.has(key)) {
      gameRows.set(key, row);
    }
  }

  for (const row of gameRows.values()) {
    const review = await analyzeNbaGameForLearning({
      pickDate: row.pick_date ?? "",
      gameLabel: row.game_label ?? "",
      homeTeam: row.home_team ?? "",
      awayTeam: row.away_team ?? "",
      gameStartTime: row.game_start_time ?? null,
    });

    if (review.shouldExcludeFromLearning) {
      excludedGames.push(review);
      excludedGameKeys.add(buildGameKey(row));
    }
  }

  const teamAccumulators: Record<string, TeamAdjustmentAccumulator> = {};
  const matchupAccumulators: Record<
    string,
    {
      totalDeltaSum: number;
      totalSample: number;
      homeTeamBias: Record<string, { marginDeltaSum: number; sample: number }>;
    }
  > = {};
  let totalBiasSum = 0;
  let totalBiasSample = 0;
  let homeBiasSum = 0;
  let homeBiasSample = 0;

  for (const row of gameRows.values()) {
    const gameKey = buildGameKey(row);
    if (excludedGameKeys.has(gameKey)) continue;

    const finalScores = parseFinalScore(row);
    if (!finalScores) continue;

    const projectedHomeScore = Number(row.projected_home_score ?? NaN);
    const projectedAwayScore = Number(row.projected_away_score ?? NaN);
    if (!Number.isFinite(projectedHomeScore) || !Number.isFinite(projectedAwayScore)) continue;

    const homeOffenseError = finalScores.homeScore - projectedHomeScore;
    const awayOffenseError = finalScores.awayScore - projectedAwayScore;
    const homeDefenseError = projectedAwayScore - finalScores.awayScore;
    const awayDefenseError = projectedHomeScore - finalScores.homeScore;
    const actualHomeMargin = finalScores.homeScore - finalScores.awayScore;
    const projectedHomeMargin = projectedHomeScore - projectedAwayScore;
    const actualTotal = finalScores.homeScore + finalScores.awayScore;
    const projectedTotal = projectedHomeScore + projectedAwayScore;
    const marginDelta = actualHomeMargin - projectedHomeMargin;
    const totalDelta = actualTotal - projectedTotal;

    const homeAccumulator =
      teamAccumulators[row.home_team ?? ""] ??
      { offenseSum: 0, defenseSum: 0, sample: 0 };
    homeAccumulator.offenseSum += clip(homeOffenseError, 14);
    homeAccumulator.defenseSum += clip(homeDefenseError, 14);
    homeAccumulator.sample += 1;
    teamAccumulators[row.home_team ?? ""] = homeAccumulator;

    const awayAccumulator =
      teamAccumulators[row.away_team ?? ""] ??
      { offenseSum: 0, defenseSum: 0, sample: 0 };
    awayAccumulator.offenseSum += clip(awayOffenseError, 14);
    awayAccumulator.defenseSum += clip(awayDefenseError, 14);
    awayAccumulator.sample += 1;
    teamAccumulators[row.away_team ?? ""] = awayAccumulator;

    const matchupKey = buildMatchupPairKey(row.home_team, row.away_team);
    const matchupAccumulator =
      matchupAccumulators[matchupKey] ??
      {
        totalDeltaSum: 0,
        totalSample: 0,
        homeTeamBias: {},
      };

    const homeTeamBiasAccumulator =
      matchupAccumulator.homeTeamBias[row.home_team ?? ""] ??
      { marginDeltaSum: 0, sample: 0 };
    homeTeamBiasAccumulator.marginDeltaSum += clip(marginDelta, 20);
    homeTeamBiasAccumulator.sample += 1;
    matchupAccumulator.homeTeamBias[row.home_team ?? ""] = homeTeamBiasAccumulator;

    const awayTeamBiasAccumulator =
      matchupAccumulator.homeTeamBias[row.away_team ?? ""] ??
      { marginDeltaSum: 0, sample: 0 };
    awayTeamBiasAccumulator.marginDeltaSum += clip(-marginDelta, 20);
    awayTeamBiasAccumulator.sample += 1;
    matchupAccumulator.homeTeamBias[row.away_team ?? ""] = awayTeamBiasAccumulator;

    matchupAccumulator.totalDeltaSum += clip(totalDelta, 24);
    matchupAccumulator.totalSample += 1;
    matchupAccumulators[matchupKey] = matchupAccumulator;

    totalBiasSum += clip(totalDelta, 18);
    totalBiasSample += 1;
    homeBiasSum += clip(marginDelta, 16);
    homeBiasSample += 1;
  }

  const teams: Record<string, NbaTeamLearningAdjustment> = {};
  for (const [team, accumulator] of Object.entries(teamAccumulators)) {
    if (!team || accumulator.sample === 0) continue;

    teams[team] = {
      offenseDelta: Number(clip((accumulator.offenseSum / accumulator.sample) * 0.16, 1.8).toFixed(2)),
      defenseDelta: Number(clip((accumulator.defenseSum / accumulator.sample) * 0.16, 1.8).toFixed(2)),
      sample: accumulator.sample,
    };
  }

  const marketPreferences = createEmptyMarketPreference();
  const marketStats: Record<
    NbaTeamMarketType,
    { top: MarketStatAccumulator; value: MarketStatAccumulator }
  > = {
    moneyline: {
      top: { decisions: 0, wins: 0, units: 0 },
      value: { decisions: 0, wins: 0, units: 0 },
    },
    spread: {
      top: { decisions: 0, wins: 0, units: 0 },
      value: { decisions: 0, wins: 0, units: 0 },
    },
    total: {
      top: { decisions: 0, wins: 0, units: 0 },
      value: { decisions: 0, wins: 0, units: 0 },
    },
  };

  for (const row of rows) {
    const marketType = row.market_type as NbaTeamMarketType | null;
    const bucket = getOfficialBucket(row);
    if (!marketType || !bucket) continue;
    if (excludedGameKeys.has(buildGameKey(row))) continue;
    if (row.status !== "win" && row.status !== "loss") continue;

    const stats = marketStats[marketType][bucket];
    stats.decisions += 1;
    if (row.status === "win") stats.wins += 1;
    stats.units += Number(row.units_result ?? 0);
  }

  for (const marketType of ["moneyline", "spread", "total"] as const) {
    marketPreferences[marketType] = {
      topPickAdjustment: scoreMarketAdjustment(marketStats[marketType].top),
      bestValueAdjustment: scoreMarketAdjustment(marketStats[marketType].value),
      topPickSample: marketStats[marketType].top.decisions,
      bestValueSample: marketStats[marketType].value.decisions,
    };
  }

  const matchupAdjustments: Record<string, NbaMatchupAdjustment> = {};
  for (const [pairKey, accumulator] of Object.entries(matchupAccumulators)) {
    const homeTeamBias: NbaMatchupAdjustment["homeTeamBias"] = {};

    for (const [team, biasAccumulator] of Object.entries(accumulator.homeTeamBias)) {
      if (!team || biasAccumulator.sample === 0) continue;

      homeTeamBias[team] = {
        marginDelta: Number(
          clip((biasAccumulator.marginDeltaSum / biasAccumulator.sample) * 0.35, 3.5).toFixed(2)
        ),
        sample: biasAccumulator.sample,
      };
    }

    matchupAdjustments[pairKey] = {
      pairKey,
      totalDelta: Number(
        clip((accumulator.totalDeltaSum / Math.max(accumulator.totalSample, 1)) * 0.35, 4).toFixed(2)
      ),
      totalSample: accumulator.totalSample,
      homeTeamBias,
    };
  }

  return {
    teams,
    marketPreferences,
    matchupAdjustments,
    globalHomeBiasPoints:
      homeBiasSample > 0
        ? Number(clip(homeBiasSum / homeBiasSample, 2.5).toFixed(2))
        : 0,
    globalTotalBiasPoints:
      totalBiasSample > 0
        ? Number(clip(totalBiasSum / totalBiasSample, 3).toFixed(2))
        : 0,
    excludedGames: excludedGames.map((review) => ({
      pickDate: review.pickDate,
      gameLabel: review.gameLabel,
      reasons: review.exclusionReasons,
    })),
  };
}

export const buildNbaLearningProfile = unstable_cache(
  async () => computeNbaLearningProfile(),
  ["nba-learning-profile"],
  { revalidate: 60 }
);
