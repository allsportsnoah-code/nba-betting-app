import { unstable_cache } from "next/cache";
import { analyzeNbaGameForLearning } from "@/lib/nbaGameReview";
import { NBA_PROP_TYPES, isNbaPropType, type NbaPropType } from "@/lib/propModel";
import { getSupabaseServer } from "@/lib/supabaseServer";

export type NbaPropMarketType = NbaPropType;
export type NbaPropDirection = "over" | "under";
export type NbaPropBoardBucket = "top" | "value";

type NbaSettledPropRow = {
  pick_date?: string | null;
  game_label?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  game_start_time?: string | null;
  market_type?: string | null;
  side?: string | null;
  status?: string | null;
  units_result?: number | null;
  is_top_pick?: boolean | null;
  notes?: string | null;
};

type StatAccumulator = {
  decisions: number;
  wins: number;
  units: number;
};

export type NbaPropLearningStats = {
  decisions: number;
  wins: number;
  units: number;
  winRate: number;
  adjustment: number;
};

export type NbaPropLearningProfile = {
  overall: Record<NbaPropDirection, Record<NbaPropBoardBucket, NbaPropLearningStats>>;
  byMarket: Record<
    NbaPropMarketType,
    Record<NbaPropDirection, Record<NbaPropBoardBucket, NbaPropLearningStats>>
  >;
  excludedGames: Array<{
    pickDate: string;
    gameLabel: string;
    reasons: string[];
  }>;
};

type PropLearningInput = {
  marketType?: string | null;
  side?: string | null;
};

const EMPTY_ACCUMULATOR = (): StatAccumulator => ({
  decisions: 0,
  wins: 0,
  units: 0,
});

function createEmptyBucketStats(): Record<NbaPropBoardBucket, StatAccumulator> {
  return {
    top: EMPTY_ACCUMULATOR(),
    value: EMPTY_ACCUMULATOR(),
  };
}

function createEmptyDirectionStats() {
  return {
    over: createEmptyBucketStats(),
    under: createEmptyBucketStats(),
  } satisfies Record<NbaPropDirection, Record<NbaPropBoardBucket, StatAccumulator>>;
}

function createEmptyProfileAccumulators() {
  return {
    overall: createEmptyDirectionStats(),
    byMarket: Object.fromEntries(
      NBA_PROP_TYPES.map((marketType) => [marketType, createEmptyDirectionStats()])
    ) as Record<NbaPropMarketType, Record<NbaPropDirection, Record<NbaPropBoardBucket, StatAccumulator>>>,
  };
}

function normalizeLookupValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildGameKey(row: Pick<NbaSettledPropRow, "pick_date" | "game_label">) {
  return `${row.pick_date ?? ""}::${row.game_label ?? ""}`;
}

function clip(value: number, cap: number) {
  return Math.max(-cap, Math.min(cap, value));
}

function getOfficialBucket(row: Pick<NbaSettledPropRow, "is_top_pick" | "notes">): NbaPropBoardBucket | null {
  if (row.is_top_pick) return "top";
  if (row.notes === "best_value") return "value";
  return null;
}

function getPropDirection(side: string | null | undefined): NbaPropDirection | null {
  const normalized = normalizeLookupValue(side);
  if (normalized.startsWith("over")) return "over";
  if (normalized.startsWith("under")) return "under";
  return null;
}

function getPropMarketType(marketType: string | null | undefined): NbaPropMarketType | null {
  return isNbaPropType(marketType) ? marketType : null;
}

function resolveSettledStatus(status: string | null | undefined) {
  const normalized = normalizeLookupValue(status);
  if (normalized === "won") return "win";
  if (normalized === "lost") return "loss";
  if (normalized === "voided" || normalized === "push" || normalized === "postponed") return "push";
  return normalized;
}

function computeAdjustment(stats: StatAccumulator) {
  if (stats.decisions < 6) return 0;

  const winRate = stats.wins / stats.decisions;
  const unitsPerDecision = stats.units / stats.decisions;
  const sampleScale = Math.min(1, stats.decisions / 14);
  const raw = ((winRate - 0.53) * 28 + unitsPerDecision * 16) * sampleScale;
  return Number(clip(raw, 8).toFixed(2));
}

function finalizeStats(stats: StatAccumulator): NbaPropLearningStats {
  const winRate = stats.decisions > 0 ? Number(((stats.wins / stats.decisions) * 100).toFixed(1)) : 0;
  return {
    decisions: stats.decisions,
    wins: stats.wins,
    units: Number(stats.units.toFixed(2)),
    winRate,
    adjustment: computeAdjustment(stats),
  };
}

export function getNbaPropLearningAdjustment(
  input: PropLearningInput,
  bucket: NbaPropBoardBucket,
  profile: NbaPropLearningProfile | null | undefined
) {
  const marketType = getPropMarketType(input.marketType);
  const direction = getPropDirection(input.side);
  if (!profile || !marketType || !direction) return 0;

  const overallAdjustment = profile.overall[direction][bucket].adjustment;
  const marketAdjustment = profile.byMarket[marketType][direction][bucket].adjustment;
  const combined = marketAdjustment * 0.7 + overallAdjustment * 0.5;

  return Number(clip(combined, 10).toFixed(2));
}

export function getNbaPropSelectionThreshold(
  input: PropLearningInput,
  bucket: NbaPropBoardBucket,
  profile: NbaPropLearningProfile | null | undefined
) {
  const direction = getPropDirection(input.side);
  const marketType = getPropMarketType(input.marketType);
  const learningAdjustment = getNbaPropLearningAdjustment(input, bucket, profile);

  let threshold = bucket === "top" ? 59 : 56.5;

  if (direction === "over") {
    threshold += bucket === "top" ? 1.5 : 0.5;
  }

  if (
    direction === "over" &&
    (
      marketType === "points" ||
      marketType === "pra" ||
      marketType === "points_rebounds" ||
      marketType === "points_assists"
    )
  ) {
    threshold += 1.5;
  } else if (
    direction === "over" &&
    (marketType === "assists" || marketType === "rebounds_assists" || marketType === "free_throws_attempted")
  ) {
    threshold += 0.5;
  }

  if (learningAdjustment <= -6) threshold += 3;
  else if (learningAdjustment <= -3) threshold += 1.5;
  else if (learningAdjustment >= 4) threshold -= 1;

  return Number(threshold.toFixed(1));
}

export function buildNbaPropTopScore(
  input: PropLearningInput & { marketScore?: number | null; oddsTaken?: number | null },
  profile: NbaPropLearningProfile | null | undefined
) {
  const marketScore = input.marketScore ?? 0;
  const learningAdjustment = getNbaPropLearningAdjustment(input, "top", profile);
  return Number((marketScore + learningAdjustment).toFixed(1));
}

export function buildNbaPropValueScore(
  input: PropLearningInput & { marketScore?: number | null; oddsTaken?: number | null },
  profile: NbaPropLearningProfile | null | undefined
) {
  const marketScore = input.marketScore ?? 0;
  const odds = input.oddsTaken;
  const payoutFit = odds !== null && odds !== undefined && odds > 0 ? 12 : 0;
  const learningAdjustment = getNbaPropLearningAdjustment(input, "value", profile);
  return Number((marketScore + payoutFit + learningAdjustment).toFixed(1));
}

export function isNbaPropEligibleForBoard(
  input: PropLearningInput & { marketScore?: number | null; oddsTaken?: number | null },
  bucket: NbaPropBoardBucket,
  profile: NbaPropLearningProfile | null | undefined
) {
  const score =
    bucket === "top"
      ? buildNbaPropTopScore(input, profile)
      : buildNbaPropValueScore(input, profile);
  const threshold = getNbaPropSelectionThreshold(input, bucket, profile);
  return score >= threshold;
}

async function computeNbaPropLearningProfile(): Promise<NbaPropLearningProfile> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("picks")
    .select("*")
    .eq("sport", "NBA")
    .eq("market_scope", "player_prop")
    .in("status", ["win", "loss", "push"])
    .or("is_top_pick.eq.true,notes.eq.best_value")
    .order("pick_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as NbaSettledPropRow[];
  const accumulators = createEmptyProfileAccumulators();
  const excludedGames: NbaPropLearningProfile["excludedGames"] = [];
  const excludedGameKeys = new Set<string>();
  const uniqueGames = new Map<string, NbaSettledPropRow>();

  for (const row of rows) {
    if (!row.pick_date || !row.game_label || !row.home_team || !row.away_team) continue;
    const key = buildGameKey(row);
    if (!uniqueGames.has(key)) {
      uniqueGames.set(key, row);
    }
  }

  for (const row of uniqueGames.values()) {
    const review = await analyzeNbaGameForLearning({
      pickDate: row.pick_date ?? "",
      gameLabel: row.game_label ?? "",
      homeTeam: row.home_team ?? "",
      awayTeam: row.away_team ?? "",
      gameStartTime: row.game_start_time ?? null,
    });

    if (review.shouldExcludeFromLearning) {
      excludedGames.push({
        pickDate: review.pickDate,
        gameLabel: review.gameLabel,
        reasons: review.exclusionReasons,
      });
      excludedGameKeys.add(buildGameKey(row));
    }
  }

  for (const row of rows) {
    const gameKey = buildGameKey(row);
    if (excludedGameKeys.has(gameKey)) continue;

    const bucket = getOfficialBucket(row);
    const direction = getPropDirection(row.side);
    const marketType = getPropMarketType(row.market_type);
    const resolvedStatus = resolveSettledStatus(row.status);

    if (!bucket || !direction || !marketType) continue;
    if (resolvedStatus !== "win" && resolvedStatus !== "loss" && resolvedStatus !== "push") continue;

    const overallStats = accumulators.overall[direction][bucket];
    const marketStats = accumulators.byMarket[marketType][direction][bucket];

    if (resolvedStatus === "win" || resolvedStatus === "loss") {
      overallStats.decisions += 1;
      marketStats.decisions += 1;
    }

    if (resolvedStatus === "win") {
      overallStats.wins += 1;
      marketStats.wins += 1;
    }

    overallStats.units += Number(row.units_result ?? 0);
    marketStats.units += Number(row.units_result ?? 0);
  }

  return {
    overall: {
      over: {
        top: finalizeStats(accumulators.overall.over.top),
        value: finalizeStats(accumulators.overall.over.value),
      },
      under: {
        top: finalizeStats(accumulators.overall.under.top),
        value: finalizeStats(accumulators.overall.under.value),
      },
    },
    byMarket: Object.fromEntries(
      NBA_PROP_TYPES.map((marketType) => [
        marketType,
        {
          over: {
            top: finalizeStats(accumulators.byMarket[marketType].over.top),
            value: finalizeStats(accumulators.byMarket[marketType].over.value),
          },
          under: {
            top: finalizeStats(accumulators.byMarket[marketType].under.top),
            value: finalizeStats(accumulators.byMarket[marketType].under.value),
          },
        },
      ])
    ) as Record<NbaPropMarketType, Record<NbaPropDirection, Record<NbaPropBoardBucket, NbaPropLearningStats>>>,
    excludedGames,
  };
}

export const buildNbaPropLearningProfile = unstable_cache(
  async () => computeNbaPropLearningProfile(),
  ["nba-prop-learning-profile"],
  { revalidate: 60 }
);
