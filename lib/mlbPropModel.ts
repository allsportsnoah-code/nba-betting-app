import { getCachedData, setCachedData } from "@/lib/cache";
import type {
  MlbLearningProfile,
  MlbPitcherWorkloadHealth,
  MlbPropMarketHealth,
} from "@/lib/mlbLearning";

export const MLB_PROP_MARKET_MAP = {
  pitcher_strikeouts: {
    marketKey: "pitcher_strikeouts",
    statKey: "pitcher_strikeouts",
    label: "Pitcher Strikeouts",
  },
  pitcher_outs: {
    marketKey: "pitcher_outs",
    statKey: "pitcher_outs",
    label: "Pitcher Outs",
  },
  batter_hits: {
    marketKey: "batter_hits",
    statKey: "batter_hits",
    label: "Batter Hits",
  },
  batter_total_bases: {
    marketKey: "batter_total_bases",
    statKey: "batter_total_bases",
    label: "Batter Total Bases",
  },
  batter_rbis: {
    marketKey: "batter_rbis",
    statKey: "batter_rbis",
    label: "Batter RBIs",
  },
  batter_runs_scored: {
    marketKey: "batter_runs_scored",
    statKey: "batter_runs_scored",
    label: "Batter Runs",
  },
  batter_hits_runs_rbis: {
    marketKey: "batter_hits_runs_rbis",
    statKey: "batter_hits_runs_rbis",
    label: "Batter Hits + Runs + RBIs",
  },
} as const;

export type MlbPropType = keyof typeof MLB_PROP_MARKET_MAP;

function isPitcherWorkloadMarket(marketType: MlbPropType) {
  return marketType === "pitcher_strikeouts" || marketType === "pitcher_outs";
}

function isBatterRunProductionMarket(marketType: MlbPropType) {
  return (
    marketType === "batter_rbis" ||
    marketType === "batter_runs_scored" ||
    marketType === "batter_hits_runs_rbis"
  );
}

export const MLB_CORE_PROP_MARKET_TYPES = [
  "pitcher_strikeouts",
  "batter_hits",
  "batter_total_bases",
] as const satisfies readonly MlbPropType[];

export const MLB_SHADOW_PROP_MARKET_TYPES = [
  "pitcher_outs",
  "batter_rbis",
  "batter_runs_scored",
  "batter_hits_runs_rbis",
] as const satisfies readonly MlbPropType[];

export function getMlbPropMarketTypes(includeShadowMarkets = true): MlbPropType[] {
  return includeShadowMarkets
    ? [...MLB_CORE_PROP_MARKET_TYPES, ...MLB_SHADOW_PROP_MARKET_TYPES]
    : [...MLB_CORE_PROP_MARKET_TYPES];
}

type OddsOutcome = {
  name?: string | null;
  description?: string | null;
  participant?: string | null;
  player?: string | null;
  price?: number | null;
  point?: number | null;
};

type OddsMarket = {
  key: string;
  outcomes?: OddsOutcome[];
};

type OddsBookmaker = {
  key?: string;
  title?: string;
  markets?: OddsMarket[];
};

export type MlbPropOddsEvent = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: OddsBookmaker[];
};

type MlbPeopleSearchResponse = {
  people?: Array<{
    id?: number;
    fullName?: string;
    useName?: string;
    primaryPosition?: {
      abbreviation?: string;
    };
  }>;
};

type MlbTeamsResponse = {
  teams?: Array<{
    id?: number;
    name?: string;
  }>;
};

type MlbRosterResponse = {
  roster?: Array<{
    person?: {
      id?: number;
      fullName?: string;
    };
  }>;
};

type MlbPlayerStatsResponse = {
  stats?: Array<{
    splits?: Array<{
      date?: string;
      stat?: Record<string, string | number | undefined>;
    }>;
  }>;
};

type MlbScheduleResponse = {
  dates?: Array<{
    date?: string;
    games?: Array<{
      gamePk?: number;
      gameDate?: string;
      teams?: {
        away?: { team?: { name?: string } };
        home?: { team?: { name?: string } };
      };
    }>;
  }>;
};

type MlbGameFeedResponse = {
  liveData?: {
    boxscore?: {
      teams?: {
        away?: {
          battingOrder?: Array<number | string>;
          players?: Record<string, { person?: { fullName?: string } }>;
        };
        home?: {
          battingOrder?: Array<number | string>;
          players?: Record<string, { person?: { fullName?: string } }>;
        };
      };
    };
  };
};

type MlbLikelyLineupSlot = {
  slot: number;
  sample: number;
};

export type MlbPropCandidate = {
  external_event_id: string;
  commence_time: string | null;
  game_label: string;
  home_team: string;
  away_team: string;
  player_name: string;
  player_team: string;
  player_team_short: string;
  market_type: MlbPropType;
  line: number | null;
  side: string;
  odds_taken: number | null;
  confidence_score: number;
  projected_line: number | null;
  market_line: number | null;
  edge: number | null;
  edge_label: string;
  stat_key: string;
  top_pick_score: number;
  notes: string | null;
  projected_innings?: number | null;
  projected_batters_faced?: number | null;
  projected_pitch_count?: number | null;
  projected_times_through_order?: number | null;
  recent_average_pitch_count?: number | null;
  recent_workload_swing?: number | null;
  recent_pitch_count_volatility?: number | null;
  expected_plate_appearances?: number | null;
  true_probability?: number | null;
  line_clear_probability?: number | null;
  recent_line_clear_rate?: number | null;
  season_line_clear_rate?: number | null;
  spike_game_share?: number | null;
  confirmed_lineup?: boolean | null;
  batting_order_slot?: number | null;
  batting_order_sample?: number | null;
  context_note?: string | null;
  market_health_note?: string | null;
  bet_recommendation?: "bet" | "lean" | "pass";
  reason_labels?: string[];
  risk_flags?: string[];
};

export type MlbPropAuditCandidate = {
  external_event_id: string;
  commence_time: string | null;
  game_label: string;
  home_team: string;
  away_team: string;
  player_name: string;
  player_team: string;
  player_team_short: string;
  market_type: MlbPropType;
  line: number | null;
  side: string;
  odds_taken: number | null;
  projected_line: number | null;
  market_line: number | null;
  signed_edge: number | null;
  edge: number | null;
  implied_probability: number | null;
  true_probability: number | null;
  confidence_score: number | null;
  top_pick_score: number | null;
  expected_plate_appearances: number | null;
  line_clear_probability: number | null;
  recent_line_clear_rate: number | null;
  season_line_clear_rate: number | null;
  spike_game_share: number | null;
  projected_innings: number | null;
  projected_pitch_count: number | null;
  projected_times_through_order: number | null;
  confirmed_lineup: boolean | null;
  batting_order_slot: number | null;
  batting_order_sample: number | null;
  context_note: string | null;
  market_health_note: string | null;
  bet_recommendation: "bet" | "lean" | "pass" | null;
  reason_labels: string[];
  risk_flags: string[];
  passes_current_filters: boolean;
  current_model_preferred_side: string | null;
  selected_for_current_candidate_pool: boolean;
};

const MLB_TEAM_SHORT_NAMES: Record<string, string> = {
  "Arizona Diamondbacks": "ARI",
  "Atlanta Braves": "ATL",
  Athletics: "ATH",
  "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",
  "Chicago Cubs": "CHC",
  "Chicago White Sox": "CHW",
  "Cincinnati Reds": "CIN",
  "Cleveland Guardians": "CLE",
  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",
  "Houston Astros": "HOU",
  "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",
  "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",
  "Minnesota Twins": "MIN",
  "New York Mets": "NYM",
  "New York Yankees": "NYY",
  "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT",
  "San Diego Padres": "SD",
  "San Francisco Giants": "SF",
  "Seattle Mariners": "SEA",
  "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH",
};

export type MlbPropDiagnostics = {
  offeredCount: number;
  rosterMatchedCount: number;
  projectedCount: number;
  passedFilterCount: number;
  savedUniqueCount: number;
};

function getShortTeamName(teamName: string) {
  return MLB_TEAM_SHORT_NAMES[teamName] ?? teamName;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizePlayerName(name: string | null | undefined) {
  return (name ?? "")
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

function safeNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBaseballInnings(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!text) return null;
  const [wholePart, outPart = "0"] = text.split(".");
  const whole = Number(wholePart);
  const outs = Number(outPart.slice(0, 1) || 0);

  if (!Number.isFinite(whole) || !Number.isFinite(outs)) return null;
  return whole + clamp(outs, 0, 2) / 3;
}

function americanToImpliedProbability(american: number | null | undefined) {
  if (american === null || american === undefined) return null;
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function estimateSideProbability(params: {
  marketType: MlbPropType;
  projectedLine: number;
  marketLine: number;
  pickSide: "Over" | "Under";
  hitProbability?: number | null;
  lineClearProbability?: number | null;
}) {
  let overProbability: number;

  if (
    params.marketType === "batter_hits" &&
    params.marketLine === 0.5 &&
    params.lineClearProbability !== null &&
    params.lineClearProbability !== undefined
  ) {
    overProbability = params.lineClearProbability;
  } else if (
    params.marketType === "batter_hits" &&
    params.marketLine === 0.5 &&
    params.hitProbability !== null &&
    params.hitProbability !== undefined
  ) {
    overProbability = params.hitProbability;
  } else if (
    params.marketType === "batter_total_bases" &&
    params.marketLine === 1.5 &&
    params.lineClearProbability !== null &&
    params.lineClearProbability !== undefined
  ) {
    overProbability = params.lineClearProbability;
  } else if (
    ((params.marketType === "batter_rbis" || params.marketType === "batter_runs_scored") &&
      params.marketLine === 0.5) ||
    (params.marketType === "batter_hits_runs_rbis" && params.marketLine === 1.5)
  ) {
    overProbability =
      params.lineClearProbability !== null && params.lineClearProbability !== undefined
        ? params.lineClearProbability
        : 1 / (1 + Math.exp((params.marketLine - params.projectedLine) * 1.05));
  } else {
    const slope =
      params.marketType === "pitcher_strikeouts"
        ? 1.15
        : params.marketType === "pitcher_outs"
        ? 0.55
        : params.marketType === "batter_total_bases"
        ? 1.0
        : params.marketType === "batter_hits_runs_rbis"
        ? 0.9
        : 1.25;
    overProbability = 1 / (1 + Math.exp((params.marketLine - params.projectedLine) * slope));
  }

  const probability = params.pickSide === "Over" ? overProbability : 1 - overProbability;
  return Number(clamp(probability, 0.05, 0.95).toFixed(3));
}

function scoreCapForMaxStars(maxStars: number) {
  if (maxStars >= 5) return 100;
  if (maxStars === 4) return 77.9;
  if (maxStars === 3) return 63.9;
  if (maxStars === 2) return 53.9;
  return 41.9;
}

function applyMarketHealth(score: number, health: MlbPropMarketHealth | undefined) {
  if (!health) {
    return { score, note: null as string | null };
  }

  const adjusted = score + health.ratingAdjustment;
  const capped = Math.min(adjusted, scoreCapForMaxStars(health.maxStars));
  return {
    score: Number(clamp(capped, 10, 100).toFixed(1)),
    note: health.warning,
  };
}

function getLossReviewPropAdjustment(params: {
  learningProfile?: MlbLearningProfile | null;
  marketType: MlbPropType;
  pickSide: "Over" | "Under";
  projectedInnings?: number | null;
  projectedPitchCount?: number | null;
  projectedTimesThroughOrder?: number | null;
  recentWorkloadSwing?: number | null;
  expectedPlateAppearances?: number | null;
}) {
  const adjustments = params.learningProfile?.lossReviewAdjustments;
  if (!adjustments) {
    return {
      confidencePenalty: 0,
      topPickPenalty: 0,
      note: null as string | null,
    };
  }

  let confidencePenalty = 0;
  let topPickPenalty = 0;
  const noteParts = new Set<string>();

  if (params.marketType === "pitcher_strikeouts") {
    if (adjustments.pitcherStrikeoutTopPickPenalty > 0) {
      confidencePenalty += adjustments.pitcherStrikeoutTopPickPenalty * 0.35;
      topPickPenalty += adjustments.pitcherStrikeoutTopPickPenalty;
      noteParts.add("recent pitcher-K misses");
    }
  }

  if (params.marketType === "pitcher_outs") {
    if (adjustments.pitcherOutsTopPickPenalty > 0) {
      confidencePenalty += adjustments.pitcherOutsTopPickPenalty * 0.35;
      topPickPenalty += adjustments.pitcherOutsTopPickPenalty;
      noteParts.add("recent pitcher-outs misses");
    }
  }

  if (isPitcherWorkloadMarket(params.marketType)) {
    if (
      params.pickSide === "Over" &&
      params.projectedInnings !== null &&
      params.projectedInnings !== undefined &&
      params.projectedInnings < 5.2 &&
      adjustments.pitcherStrikeoutLowIpPenalty > 0
    ) {
      confidencePenalty += adjustments.pitcherStrikeoutLowIpPenalty * 0.6;
      topPickPenalty += adjustments.pitcherStrikeoutLowIpPenalty;
      noteParts.add("low-IP pitcher overs");
    }

    if (
      params.pickSide === "Over" &&
      params.projectedPitchCount !== null &&
      params.projectedPitchCount !== undefined &&
      params.projectedPitchCount < 88 &&
      adjustments.pitcherStrikeoutShortLeashPenalty > 0
    ) {
      confidencePenalty += adjustments.pitcherStrikeoutShortLeashPenalty * 0.6;
      topPickPenalty += adjustments.pitcherStrikeoutShortLeashPenalty;
      noteParts.add("short-pitch-count pitcher overs");
    }

    if (
      params.pickSide === "Over" &&
      params.projectedTimesThroughOrder !== null &&
      params.projectedTimesThroughOrder !== undefined &&
      params.projectedTimesThroughOrder < 2.6 &&
      adjustments.pitcherStrikeoutShortLeashPenalty > 0
    ) {
      confidencePenalty += adjustments.pitcherStrikeoutShortLeashPenalty * 0.35;
      topPickPenalty += adjustments.pitcherStrikeoutShortLeashPenalty * 0.7;
      noteParts.add("short-leash pitcher overs");
    }

    if (
      params.pickSide === "Over" &&
      params.recentWorkloadSwing !== null &&
      params.recentWorkloadSwing !== undefined &&
      params.recentWorkloadSwing <= -10 &&
      adjustments.pitcherStrikeoutWorkloadDipPenalty > 0
    ) {
      confidencePenalty += adjustments.pitcherStrikeoutWorkloadDipPenalty * 0.6;
      topPickPenalty += adjustments.pitcherStrikeoutWorkloadDipPenalty;
      noteParts.add("pitch-count dip pitcher overs");
    }
  }

  if (
    isBatterRunProductionMarket(params.marketType) &&
    adjustments.batterRunProductionTopPickPenalty > 0
  ) {
    confidencePenalty += adjustments.batterRunProductionTopPickPenalty * 0.3;
    topPickPenalty += adjustments.batterRunProductionTopPickPenalty;
    noteParts.add("recent batter run-production misses");
  }

  if (
    !isPitcherWorkloadMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.expectedPlateAppearances !== null &&
    params.expectedPlateAppearances !== undefined &&
    params.expectedPlateAppearances < 4 &&
    adjustments.batterLowPaOverPenalty > 0
  ) {
    confidencePenalty += adjustments.batterLowPaOverPenalty * 0.7;
    topPickPenalty += adjustments.batterLowPaOverPenalty;
    noteParts.add("low-PA batter overs");
  }

  const note =
    noteParts.size > 0
      ? `recent miss review is cautious on ${Array.from(noteParts).join(" and ")}`
      : null;

  return {
    confidencePenalty: Number(clamp(confidencePenalty, 0, 18).toFixed(1)),
    topPickPenalty: Number(clamp(topPickPenalty, 0, 24).toFixed(1)),
    note,
  };
}

function getNumericContextValue(context: unknown, key: string) {
  if (!context || typeof context !== "object") return null;
  const value = (context as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPitcherContext(context: unknown) {
  return {
    projectedInnings: getNumericContextValue(context, "projectedInnings"),
    projectedBattersFaced: getNumericContextValue(context, "projectedBattersFaced"),
    projectedPitchCount: getNumericContextValue(context, "projectedPitchCount"),
    projectedTimesThroughOrder: getNumericContextValue(context, "projectedTimesThroughOrder"),
    recentAveragePitchCount: getNumericContextValue(context, "recentAveragePitchCount"),
    recentWorkloadSwing: getNumericContextValue(context, "recentWorkloadSwing"),
    recentPitchCountVolatility: getNumericContextValue(context, "recentPitchCountVolatility"),
  };
}

function getBatterContext(context: unknown) {
  return {
    expectedPlateAppearances: getNumericContextValue(context, "expectedPlateAppearances"),
    hitProbability: getNumericContextValue(context, "hitProbability"),
    lineClearProbability: getNumericContextValue(context, "lineClearProbability"),
    seasonLineClearRate: getNumericContextValue(context, "seasonLineClearRate"),
    recentLineClearRate: getNumericContextValue(context, "recentLineClearRate"),
    spikeGameShare: getNumericContextValue(context, "spikeGameShare"),
  };
}

function getPitcherWorkloadHealth(
  learningProfile: MlbLearningProfile | null | undefined,
  marketType: MlbPropType,
  pickSide: "Over" | "Under",
  projectedInnings: number | null | undefined
) {
  if (projectedInnings === null || projectedInnings === undefined || projectedInnings >= 5) {
    return null;
  }

  const direction = pickSide.toLowerCase() as "over" | "under";
  return learningProfile?.propMarketHealth?.[marketType]?.lowWorkloadDirectionHealth?.[direction] ?? null;
}

function buildPropMarketScore(params: {
  edge: number;
  oddsTaken: number | null;
  projectedLine: number | null;
  trueProbability?: number | null;
  marketType: MlbPropType;
  pickSide: "Over" | "Under";
  projectedInnings?: number | null;
  projectedPitchCount?: number | null;
  projectedTimesThroughOrder?: number | null;
  recentWorkloadSwing?: number | null;
  expectedPlateAppearances?: number | null;
  lineClearProbability?: number | null;
  spikeGameShare?: number | null;
  battingOrderSlot?: number | null;
  confirmedLineup?: boolean | null;
  battingOrderSample?: number | null;
}) {
  const implied = americanToImpliedProbability(params.oddsTaken) ?? 0.5;
  const edgeScore = Math.abs(params.edge) * 28;
  const payoutFit =
    params.oddsTaken === null
      ? 0
      : params.oddsTaken >= -145 && params.oddsTaken <= 115
      ? 18
      : params.oddsTaken >= -170 && params.oddsTaken <= 140
      ? 10
      : 4;
  const trueProbability = params.trueProbability ?? null;
  const probabilityEdge = trueProbability === null ? 0 : trueProbability - implied;
  // Reduced multiplier: was 150x, which drowned out edge and confidence
  const probabilityScore = trueProbability === null ? 0 : trueProbability * 34 + probabilityEdge * 50;
  const expensivePenalty = params.oddsTaken !== null && params.oddsTaken < -170 ? Math.min((Math.abs(params.oddsTaken) - 170) * 0.18, 20) : 0;
  // Workload penalties capped — previously up to 45pts combined could bury high-edge props
  const workloadPenalty =
    isPitcherWorkloadMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.projectedInnings !== null &&
    params.projectedInnings !== undefined &&
    params.projectedInnings < 5.2
      ? 7
      : 0;
  const pitchCountPenalty =
    isPitcherWorkloadMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.projectedPitchCount !== null &&
    params.projectedPitchCount !== undefined &&
    params.projectedPitchCount < 88
      ? 5
      : 0;
  const leashPenalty =
    isPitcherWorkloadMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.projectedTimesThroughOrder !== null &&
    params.projectedTimesThroughOrder !== undefined &&
    params.projectedTimesThroughOrder < 2.6
      ? 4
      : 0;
  const workloadSwingPenalty =
    isPitcherWorkloadMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.recentWorkloadSwing !== null &&
    params.recentWorkloadSwing !== undefined &&
    params.recentWorkloadSwing <= -10
      ? 4
      : 0;
  const paPenalty =
    !isPitcherWorkloadMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.expectedPlateAppearances !== null &&
    params.expectedPlateAppearances !== undefined &&
    params.expectedPlateAppearances < 3.7
      ? 10
      : 0;
  const tbClearRatePenalty =
    params.marketType === "batter_total_bases" &&
    params.pickSide === "Over" &&
    params.lineClearProbability !== null &&
    params.lineClearProbability !== undefined &&
    params.lineClearProbability < 0.5
      ? (0.5 - params.lineClearProbability) * 40
      : 0;
  const tbSpikePenalty =
    params.marketType === "batter_total_bases" &&
    params.pickSide === "Over" &&
    params.spikeGameShare !== null &&
    params.spikeGameShare !== undefined &&
    params.spikeGameShare >= 0.4 &&
    params.lineClearProbability !== null &&
    params.lineClearProbability !== undefined &&
    params.lineClearProbability < 0.56
      ? Math.min((params.spikeGameShare - 0.4) * 60, 14)
      : 0;
  const lineupSlotScore =
    !isPitcherWorkloadMarket(params.marketType) && params.pickSide === "Over"
      ? getLineupSlotScore(
          params.battingOrderSlot,
          params.confirmedLineup,
          params.battingOrderSample
        )
      : 0;
  const hitFit = (1 - Math.abs(implied - 0.54)) * 24;
  const projectionFit = params.projectedLine === null ? 0 : 10;

  return Number(
    clamp(
      edgeScore +
        payoutFit +
        hitFit +
        projectionFit +
        probabilityScore -
        expensivePenalty -
        workloadPenalty -
        pitchCountPenalty -
        leashPenalty -
        workloadSwingPenalty -
        paPenalty -
        tbClearRatePenalty -
        tbSpikePenalty +
        lineupSlotScore,
      10,
      100
    ).toFixed(1)
  );
}

function getProfitPerUnit(american: number | null | undefined) {
  if (american === null || american === undefined) return 0;
  if (american > 0) return american / 100;
  return 100 / Math.abs(american);
}

function buildPropBetProfile(params: {
  edge: number;
  oddsTaken: number | null;
  marketType: MlbPropType;
  pickSide: "Over" | "Under";
  confidenceScore: number;
  sideProbability: number;
  impliedProbability: number | null;
  projectedInnings?: number | null;
  projectedPitchCount?: number | null;
  projectedTimesThroughOrder?: number | null;
  recentAveragePitchCount?: number | null;
  recentWorkloadSwing?: number | null;
  recentPitchCountVolatility?: number | null;
  expectedPlateAppearances?: number | null;
  lineClearProbability?: number | null;
  seasonLineClearRate?: number | null;
  recentLineClearRate?: number | null;
  spikeGameShare?: number | null;
  battingOrderSlot?: number | null;
  confirmedLineup?: boolean | null;
  battingOrderSample?: number | null;
  health?: MlbPropMarketHealth;
  lowWorkloadHealth?: MlbPitcherWorkloadHealth | null;
}) {
  const reasonLabels: string[] = [];
  const riskFlags: string[] = [];
  const payout = getProfitPerUnit(params.oddsTaken);
  const probabilityEdge =
    params.impliedProbability === null ? null : params.sideProbability - params.impliedProbability;

  if (payout >= 0.63) {
    reasonLabels.push(`pays ${payout.toFixed(2)}u+`);
  } else {
    riskFlags.push(`low payout ${payout.toFixed(2)}u`);
  }

  if (Math.abs(params.edge) >= 1.6) {
    reasonLabels.push(`${Math.abs(params.edge).toFixed(1)} prop edge`);
  } else if (Math.abs(params.edge) >= 1.1) {
    reasonLabels.push(`${Math.abs(params.edge).toFixed(1)} prop lean`);
  } else if (Math.abs(params.edge) < 0.7) {
    riskFlags.push("thin prop edge");
  }

  if (probabilityEdge !== null && probabilityEdge >= 0.04) {
    reasonLabels.push(`${(probabilityEdge * 100).toFixed(1)}% probability edge`);
  } else if (probabilityEdge !== null && probabilityEdge < 0.01) {
    riskFlags.push("thin probability edge");
  }

  if (
    isPitcherWorkloadMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.projectedInnings !== null &&
    params.projectedInnings !== undefined
  ) {
    if (params.projectedInnings >= 5.6) {
      reasonLabels.push(`${params.projectedInnings.toFixed(1)} projected IP`);
    } else if (params.projectedInnings < 5.1) {
      riskFlags.push(`workload risk ${params.projectedInnings.toFixed(1)} IP`);
    }
  }

  if (isPitcherWorkloadMarket(params.marketType)) {
    if (
      params.projectedPitchCount !== null &&
      params.projectedPitchCount !== undefined &&
      params.pickSide === "Over"
    ) {
      if (params.projectedPitchCount >= 92) {
        reasonLabels.push(`${Math.round(params.projectedPitchCount)} projected pitches`);
      } else if (params.projectedPitchCount < 88) {
        riskFlags.push(`pitch leash ${Math.round(params.projectedPitchCount)}`);
      }
    }

    if (
      params.projectedTimesThroughOrder !== null &&
      params.projectedTimesThroughOrder !== undefined &&
      params.pickSide === "Over"
    ) {
      if (params.projectedTimesThroughOrder >= 2.8) {
        reasonLabels.push(`${params.projectedTimesThroughOrder.toFixed(1)}x order`);
      } else if (params.projectedTimesThroughOrder < 2.6) {
        riskFlags.push(`short leash ${params.projectedTimesThroughOrder.toFixed(1)}x order`);
      }
    }

    if (
      params.recentWorkloadSwing !== null &&
      params.recentWorkloadSwing !== undefined &&
      params.pickSide === "Over"
    ) {
      if (params.recentWorkloadSwing >= 8) {
        reasonLabels.push(`recent leash up ${Math.round(params.recentWorkloadSwing)} pitches`);
      } else if (params.recentWorkloadSwing <= -10) {
        riskFlags.push(`recent pitch dip ${Math.round(Math.abs(params.recentWorkloadSwing))}`);
      }
    }

    if (
      params.recentPitchCountVolatility !== null &&
      params.recentPitchCountVolatility !== undefined &&
      params.pickSide === "Over" &&
      params.recentPitchCountVolatility >= 13
    ) {
      riskFlags.push(`workload volatility ${params.recentPitchCountVolatility.toFixed(0)}`);
    }

    if (params.lowWorkloadHealth?.warning) {
      if (params.lowWorkloadHealth.inRotation) {
        reasonLabels.push(params.lowWorkloadHealth.warning);
      } else {
        riskFlags.push(params.lowWorkloadHealth.warning);
      }
    }
  }

  if (
    !isPitcherWorkloadMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.expectedPlateAppearances !== null &&
    params.expectedPlateAppearances !== undefined
  ) {
    if (params.expectedPlateAppearances >= 4) {
      reasonLabels.push(`${params.expectedPlateAppearances.toFixed(1)} projected PA`);
    } else if (params.expectedPlateAppearances < 3.6) {
      riskFlags.push(`PA risk ${params.expectedPlateAppearances.toFixed(1)}`);
    }
  }

  if (
    !isPitcherWorkloadMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.battingOrderSlot !== null &&
    params.battingOrderSlot !== undefined
  ) {
    if (params.confirmedLineup && params.battingOrderSlot <= 4) {
      reasonLabels.push(`confirmed ${params.battingOrderSlot} spot`);
    } else if (params.confirmedLineup && params.battingOrderSlot >= 7) {
      riskFlags.push(`lineup spot ${params.battingOrderSlot}`);
    } else if (!params.confirmedLineup && (params.battingOrderSample ?? 0) >= 3) {
      if (params.battingOrderSlot <= 4) {
        reasonLabels.push(`likely ${params.battingOrderSlot} spot (${params.battingOrderSample}g)`);
      } else if (params.battingOrderSlot >= 7) {
        riskFlags.push(`likely lineup spot ${params.battingOrderSlot} (${params.battingOrderSample}g)`);
      }
    }
  }

  if (
    !isPitcherWorkloadMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.lineClearProbability !== null &&
    params.lineClearProbability !== undefined
  ) {
    if (params.lineClearProbability >= 0.58) {
      reasonLabels.push(`${(params.lineClearProbability * 100).toFixed(0)}% clear rate`);
    } else if (params.lineClearProbability < 0.48) {
      riskFlags.push(`clear-rate risk ${(params.lineClearProbability * 100).toFixed(0)}%`);
    }
  }

  if (
    isBatterRunProductionMarket(params.marketType) &&
    params.pickSide === "Over" &&
    params.lineClearProbability !== null &&
    params.lineClearProbability !== undefined &&
    params.lineClearProbability < 0.5
  ) {
    riskFlags.push(`run-production volatility ${(params.lineClearProbability * 100).toFixed(0)}%`);
  }

  if (
    params.marketType === "batter_total_bases" &&
    params.pickSide === "Over" &&
    params.spikeGameShare !== null &&
    params.spikeGameShare !== undefined &&
    params.spikeGameShare >= 0.4
  ) {
    riskFlags.push(`spike-game risk ${(params.spikeGameShare * 100).toFixed(0)}%`);
  }

  if (params.health?.lockEligible === false || (params.health?.maxStars ?? 5) <= 3) {
    riskFlags.push("market health is cold");
  } else if ((params.health?.recentNetUnits ?? 0) > 0 && (params.health?.recentWinRate ?? 0) >= 55) {
    reasonLabels.push("market health is positive");
  }

  // Flag unconfirmed batters with no recent slot sample — lineup is unknown
  if (
    !isPitcherWorkloadMarket(params.marketType) &&
    !params.confirmedLineup &&
    (params.battingOrderSample ?? 0) < 2
  ) {
    riskFlags.push("lineup unconfirmed");
  }

  let betRecommendation: MlbPropCandidate["bet_recommendation"] = "lean";
  const hardRisk = riskFlags.some((flag) =>
    flag.includes("thin") ||
    flag.includes("risk") ||
    flag.includes("volatility") ||
    flag.includes("cold") ||
    flag.includes("lineup unconfirmed")
  );

  if (!hardRisk && params.confidenceScore >= 54 && Math.abs(params.edge) >= 0.7) {
    betRecommendation = "bet";
  } else if (params.confidenceScore < 42 || hardRisk) {
    betRecommendation = "pass";
  }

  return {
    betRecommendation,
    reasonLabels,
    riskFlags,
  };
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`MLB prop fetch failed: ${response.status} ${url}`);
  }
  return (await response.json()) as T;
}

async function resolvePlayerIdentity(playerName: string) {
  const normalized = normalizePlayerName(playerName);
  const cached = await getCachedData(`mlb_player_lookup_${normalized}`);
  if (cached?.data) {
    return cached.data as { id: number; fullName: string; position: string | null };
  }

  const params = new URLSearchParams({
    sportId: "1",
    names: playerName,
  });

  const data = await fetchJson<MlbPeopleSearchResponse>(
    `https://statsapi.mlb.com/api/v1/people/search?${params.toString()}`
  );

  const player = (data.people ?? []).find(
    (person) => normalizePlayerName(person.fullName) === normalized
  ) ?? data.people?.[0];

  if (!player?.id || !player.fullName) return null;

  const resolved = {
    id: player.id,
    fullName: player.fullName,
    position: player.primaryPosition?.abbreviation ?? null,
  };

  await setCachedData(`mlb_player_lookup_${normalized}`, resolved);
  return resolved;
}

async function getMlbTeamIdMap() {
  const cacheKey = "mlb_team_id_map";
  const cached = await getCachedData(cacheKey);
  if (cached?.data) return cached.data as Record<string, number>;

  const data = await fetchJson<MlbTeamsResponse>("https://statsapi.mlb.com/api/v1/teams?sportId=1");
  const map = Object.fromEntries(
    (data.teams ?? [])
      .filter((team): team is { id: number; name: string } => Boolean(team.id && team.name))
      .map((team) => [team.name, team.id])
  );

  await setCachedData(cacheKey, map);
  return map;
}

async function getActiveRosterForTeam(teamName: string) {
  const teamIdMap = await getMlbTeamIdMap();
  const teamId = teamIdMap[teamName];
  if (!teamId) return [];

  const cacheKey = `mlb_active_roster_${teamId}`;
  const cached = await getCachedData(cacheKey);
  if (cached?.data) {
    return cached.data as Array<{ id: number; fullName: string }>;
  }

  const data = await fetchJson<MlbRosterResponse>(
    `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active`
  );

  const roster = (data.roster ?? [])
    .filter((entry): entry is { person: { id: number; fullName: string } } => Boolean(entry.person?.id && entry.person?.fullName))
    .map((entry) => ({
      id: entry.person.id,
      fullName: entry.person.fullName,
    }));

  await setCachedData(cacheKey, roster);
  return roster;
}

async function fetchPlayerSeasonStats(playerId: number, group: "hitting" | "pitching", season: number) {
  const cacheKey = `mlb_player_stats_${group}_${season}_${playerId}`;
  const cached = await getCachedData(cacheKey);
  if (cached?.data) {
    return cached.data as Record<string, string | number | undefined>;
  }

  const data = await fetchJson<MlbPlayerStatsResponse>(
    `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=${group}&season=${season}`
  );

  const stat = data.stats?.[0]?.splits?.[0]?.stat ?? {};
  await setCachedData(cacheKey, stat);
  return stat;
}

async function fetchPlayerGameLog(playerId: number, group: "hitting" | "pitching", season: number) {
  const cacheKey = `mlb_player_gamelog_${group}_${season}_${playerId}`;
  const sortRecentFirst = (splits: Array<{ date?: string; stat?: Record<string, string | number | undefined> }>) =>
    [...splits].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });

  const cached = await getCachedData(cacheKey);
  if (cached?.data) {
    return sortRecentFirst(cached.data as Array<{ date?: string; stat?: Record<string, string | number | undefined> }>);
  }

  const data = await fetchJson<MlbPlayerStatsResponse>(
    `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=gameLog&group=${group}&season=${season}`
  );

  const splits = sortRecentFirst(data.stats?.[0]?.splits ?? []);
  await setCachedData(cacheKey, splits);
  return splits;
}

async function fetchScheduleGamesForDate(businessDate: string) {
  const cacheKey = `mlb_schedule_games_${businessDate}`;
  const cached = await getCachedData(cacheKey);
  if (cached?.data) {
    return cached.data as Array<{ gamePk: number; awayTeam: string; homeTeam: string; gameDate: string | null }>;
  }

  const data = await fetchJson<MlbScheduleResponse>(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${businessDate}`
  );

  const games = (data.dates ?? [])
    .flatMap((date) => date.games ?? [])
    .map((game) => ({
      gamePk: Number(game.gamePk ?? 0),
      awayTeam: game.teams?.away?.team?.name ?? "",
      homeTeam: game.teams?.home?.team?.name ?? "",
      gameDate: game.gameDate ?? null,
    }))
    .filter((game) => game.gamePk > 0 && game.awayTeam && game.homeTeam);

  await setCachedData(cacheKey, games);
  return games;
}

function getDateDaysAgo(dateString: string, daysAgo: number) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function fetchScheduleGamesForRange(startDate: string, endDate: string) {
  const cacheKey = `mlb_schedule_games_${startDate}_${endDate}`;
  const cached = await getCachedData(cacheKey);
  if (cached?.data) {
    return cached.data as Array<{ gamePk: number; awayTeam: string; homeTeam: string; gameDate: string | null }>;
  }

  const data = await fetchJson<MlbScheduleResponse>(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}`
  );

  const games = (data.dates ?? [])
    .flatMap((date) => date.games ?? [])
    .map((game) => ({
      gamePk: Number(game.gamePk ?? 0),
      awayTeam: game.teams?.away?.team?.name ?? "",
      homeTeam: game.teams?.home?.team?.name ?? "",
      gameDate: game.gameDate ?? null,
    }))
    .filter((game) => game.gamePk > 0 && game.awayTeam && game.homeTeam);

  await setCachedData(cacheKey, games);
  return games;
}

async function fetchConfirmedLineupByGamePk(gamePk: number) {
  const cacheKey = `mlb_confirmed_lineup_${gamePk}`;
  const cached = await getCachedData(cacheKey);
  if (cached?.data) {
    return cached.data as {
      away: Array<{ playerName: string; slot: number }>;
      home: Array<{ playerName: string; slot: number }>;
    };
  }

  const data = await fetchJson<MlbGameFeedResponse>(
    `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`
  );

  const parseTeamLineup = (teamData: {
    battingOrder?: Array<number | string>;
    players?: Record<string, { person?: { fullName?: string } }>;
  } | null | undefined) => {
    const battingOrder = teamData?.battingOrder ?? [];
    const players = teamData?.players ?? {};

    return battingOrder
      .map((rawId, index) => {
        const playerKey =
          typeof rawId === "string" && rawId.toUpperCase().startsWith("ID")
            ? rawId.toUpperCase()
            : `ID${String(rawId)}`;
        const playerName = players[playerKey]?.person?.fullName ?? "";
        if (!playerName) return null;
        return {
          playerName,
          slot: index + 1,
        };
      })
      .filter((entry): entry is { playerName: string; slot: number } => Boolean(entry));
  };

  const lineup = {
    away: parseTeamLineup(data.liveData?.boxscore?.teams?.away),
    home: parseTeamLineup(data.liveData?.boxscore?.teams?.home),
  };

  await setCachedData(cacheKey, lineup);
  return lineup;
}

async function getConfirmedLineupContext(
  businessDate: string,
  awayTeam: string,
  homeTeam: string
) {
  const games = await fetchScheduleGamesForDate(businessDate);
  const game = games.find((item) => item.awayTeam === awayTeam && item.homeTeam === homeTeam);
  if (!game) {
    return {
      teamSlotMaps: new Map<string, Map<string, number>>(),
      confirmedTeams: new Set<string>(),
    };
  }

  const lineup = await fetchConfirmedLineupByGamePk(game.gamePk);
  const awayMap = new Map(
    lineup.away.map((entry) => [normalizePlayerName(entry.playerName), entry.slot])
  );
  const homeMap = new Map(
    lineup.home.map((entry) => [normalizePlayerName(entry.playerName), entry.slot])
  );
  const teamSlotMaps = new Map<string, Map<string, number>>([
    [awayTeam, awayMap],
    [homeTeam, homeMap],
  ]);
  const confirmedTeams = new Set<string>();
  if (awayMap.size >= 8) confirmedTeams.add(awayTeam);
  if (homeMap.size >= 8) confirmedTeams.add(homeTeam);

  return {
    teamSlotMaps,
    confirmedTeams,
  };
}

async function getLikelyLineupSlotsForTeam(teamName: string, businessDate: string) {
  const cacheKey = `mlb_likely_lineup_slots_${normalizePlayerName(teamName)}_${businessDate}`;
  const cached = await getCachedData(cacheKey);
  if (cached?.data) {
    return new Map<string, MlbLikelyLineupSlot>(
      Object.entries(cached.data as Record<string, MlbLikelyLineupSlot>)
    );
  }

  const startDate = getDateDaysAgo(businessDate, 28);
  const endDate = getDateDaysAgo(businessDate, 1);
  const recentGames = (await fetchScheduleGamesForRange(startDate, endDate))
    .filter((game) => game.awayTeam === teamName || game.homeTeam === teamName)
    .sort((a, b) => (b.gameDate ?? "").localeCompare(a.gameDate ?? ""))
    .slice(0, 12);

  const playerSlotWeights = new Map<
    string,
    { appearances: number; slotWeights: Map<number, number>; latestSlot: number | null }
  >();

  for (const [index, game] of recentGames.entries()) {
    const lineup = await fetchConfirmedLineupByGamePk(game.gamePk);
    const relevantLineup = game.awayTeam === teamName ? lineup.away : lineup.home;
    if (relevantLineup.length < 8) continue;

    const recencyWeight = Math.max(recentGames.length - index, 1);
    for (const entry of relevantLineup) {
      const normalizedName = normalizePlayerName(entry.playerName);
      const existing = playerSlotWeights.get(normalizedName) ?? {
        appearances: 0,
        slotWeights: new Map<number, number>(),
        latestSlot: null,
      };
      existing.appearances += 1;
      existing.slotWeights.set(entry.slot, (existing.slotWeights.get(entry.slot) ?? 0) + recencyWeight);
      if (existing.latestSlot === null) {
        existing.latestSlot = entry.slot;
      }
      playerSlotWeights.set(normalizedName, existing);
    }
  }

  const likelySlots = new Map<string, MlbLikelyLineupSlot>();
  const serializable: Record<string, MlbLikelyLineupSlot> = {};
  for (const [playerName, entry] of playerSlotWeights.entries()) {
    if (entry.appearances < 2) continue;

    const sortedSlots = Array.from(entry.slotWeights.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      if (entry.latestSlot !== null) {
        if (a[0] === entry.latestSlot) return -1;
        if (b[0] === entry.latestSlot) return 1;
      }
      return a[0] - b[0];
    });
    const likelySlot = sortedSlots[0]?.[0] ?? null;
    if (likelySlot === null) continue;

    const slotEntry = {
      slot: likelySlot,
      sample: entry.appearances,
    };
    likelySlots.set(playerName, slotEntry);
    serializable[playerName] = slotEntry;
  }

  await setCachedData(cacheKey, serializable);
  return likelySlots;
}

async function getLineupContext(
  businessDate: string,
  awayTeam: string,
  homeTeam: string
) {
  const confirmed = await getConfirmedLineupContext(businessDate, awayTeam, homeTeam);
  const likelyTeamSlotMaps = new Map<string, Map<string, MlbLikelyLineupSlot>>();

  for (const teamName of [awayTeam, homeTeam]) {
    if (confirmed.confirmedTeams.has(teamName)) continue;
    likelyTeamSlotMaps.set(teamName, await getLikelyLineupSlotsForTeam(teamName, businessDate));
  }

  return {
    ...confirmed,
    likelyTeamSlotMaps,
  };
}

function getLineupSlotScore(
  battingOrderSlot: number | null | undefined,
  confirmedLineup: boolean | null | undefined,
  battingOrderSample: number | null | undefined
) {
  if (battingOrderSlot === null || battingOrderSlot === undefined) return 0;

  const baseScore =
    battingOrderSlot <= 4
      ? 6 - battingOrderSlot
      : battingOrderSlot === 5
      ? 1
      : battingOrderSlot === 6
      ? 0
      : battingOrderSlot === 7
      ? -5
      : battingOrderSlot === 8
      ? -8
      : -10;

  if (confirmedLineup) return baseScore;

  const sample = battingOrderSample ?? 0;
  const sampleMultiplier = sample >= 7 ? 0.75 : sample >= 5 ? 0.6 : sample >= 3 ? 0.45 : 0.25;
  return Number((baseScore * sampleMultiplier).toFixed(1));
}

function extractPlayerName(outcome: OddsOutcome) {
  const rawName =
    outcome.description ??
    outcome.participant ??
    outcome.player ??
    outcome.name ??
    "";

  if (!rawName) return "";
  if (rawName === "Over" || rawName === "Under") return "";
  return rawName;
}

function parsePropMarket(event: MlbPropOddsEvent, marketType: MlbPropType) {
  const marketKey = MLB_PROP_MARKET_MAP[marketType].marketKey;
  const market = event.bookmakers?.[0]?.markets?.find((entry) => entry.key === marketKey);
  if (!market) return [];

  const grouped = new Map<
    string,
    {
      player_name: string;
      line: number | null;
      over_odds: number | null;
      under_odds: number | null;
    }
  >();

  for (const outcome of market.outcomes ?? []) {
    const playerName = extractPlayerName(outcome);
    const side =
      outcome.name === "Over" || outcome.name === "Under"
        ? outcome.name
        : String(outcome.name ?? "").toLowerCase().includes("over")
        ? "Over"
        : String(outcome.name ?? "").toLowerCase().includes("under")
        ? "Under"
        : null;

    if (!playerName || !side) continue;

    const line = outcome.point ?? null;
    const key = `${normalizePlayerName(playerName)}|${line ?? "na"}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        player_name: playerName,
        line,
        over_odds: null,
        under_odds: null,
      });
    }

    const row = grouped.get(key);
    if (!row) continue;

    if (side === "Over") row.over_odds = outcome.price ?? null;
    if (side === "Under") row.under_odds = outcome.price ?? null;
  }

  return Array.from(grouped.values());
}

function getPlateAppearances(stat: Record<string, string | number | undefined>) {
  return (
    safeNumber(stat.plateAppearances) ??
    (safeNumber(stat.atBats) ?? 0) +
      (safeNumber(stat.baseOnBalls) ?? 0) +
      (safeNumber(stat.hitByPitch) ?? 0) +
      (safeNumber(stat.sacFlies) ?? 0)
  );
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageAbsoluteDelta(values: number[]) {
  if (values.length < 2) return null;
  const deltas = [];
  for (let index = 1; index < values.length; index += 1) {
    deltas.push(Math.abs(values[index - 1] - values[index]));
  }
  return average(deltas);
}

type BatterLineClearKey = "hits" | "totalBases" | "rbi" | "runs" | "hitsRunsRbis";

function getBatterPropStatValue(
  stat: Record<string, string | number | undefined>,
  valueKey: BatterLineClearKey
) {
  if (valueKey === "hitsRunsRbis") {
    return (
      (safeNumber(stat.hits) ?? 0) +
      (safeNumber(stat.runs) ?? 0) +
      (safeNumber(stat.rbi) ?? 0)
    );
  }

  return safeNumber(stat[valueKey]) ?? 0;
}

function buildBatterLineClearProfile(
  gameLog: Array<{ stat?: Record<string, string | number | undefined> }>,
  valueKey: BatterLineClearKey,
  threshold: number
) {
  const games = gameLog
    .map((entry) => {
      const entryStat = entry.stat ?? {};
      return {
        plateAppearances: getPlateAppearances(entryStat),
        value: getBatterPropStatValue(entryStat, valueKey),
      };
    })
    .filter((entry) => entry.plateAppearances > 0);

  if (games.length === 0) {
    return {
      seasonLineClearRate: null as number | null,
      recentLineClearRate: null as number | null,
      spikeGameShare: null as number | null,
    };
  }

  const recentGames = games.slice(0, 12);
  const seasonLineClearRate = Number(
    (
      games.filter((entry) => entry.value >= threshold).length / games.length
    ).toFixed(3)
  );
  const recentLineClearRate = Number(
    (
      recentGames.filter((entry) => entry.value >= threshold).length / recentGames.length
    ).toFixed(3)
  );
  const recentTotal = recentGames.reduce((sum, entry) => sum + entry.value, 0);
  const spikeGameShare =
    recentTotal > 0
      ? Number(
          (
            Math.max(...recentGames.map((entry) => entry.value)) / recentTotal
          ).toFixed(3)
        )
      : null;

  return {
    seasonLineClearRate,
    recentLineClearRate,
    spikeGameShare,
  };
}

function estimatePitcherStrikeouts(
  stat: Record<string, string | number | undefined>,
  gameLog: Array<{ stat?: Record<string, string | number | undefined> }>
) {
  const strikeOuts = safeNumber(stat.strikeOuts) ?? 0;
  const innings = parseBaseballInnings(stat.inningsPitched) ?? 0;
  const gamesStarted = safeNumber(stat.gamesStarted) ?? safeNumber(stat.gamesPlayed) ?? 1;
  const battersFaced = safeNumber(stat.battersFaced) ?? innings * 4.25;
  const seasonPitchCount = safeNumber(stat.numberOfPitches) ?? safeNumber(stat.pitchesThrown);

  if (innings <= 0 || gamesStarted <= 0) return null;

  const recentPitching = gameLog
    .map((entry) => {
      const entryStat = entry.stat ?? {};
      const ip = parseBaseballInnings(entryStat.inningsPitched) ?? 0;
      return {
        innings: ip,
        battersFaced: safeNumber(entryStat.battersFaced) ?? ip * 4.25,
        strikeOuts: safeNumber(entryStat.strikeOuts) ?? 0,
        pitches:
          safeNumber(entryStat.numberOfPitches) ??
          safeNumber(entryStat.pitchesThrown) ??
          null,
      };
    })
    .filter((entry) => entry.innings > 0)
    .slice(0, 5);
  const recentInnings = average(recentPitching.map((entry) => entry.innings));
  const recentBattersFaced = recentPitching.reduce((sum, entry) => sum + entry.battersFaced, 0);
  const recentStrikeouts = recentPitching.reduce((sum, entry) => sum + entry.strikeOuts, 0);
  const recentPitchCounts = recentPitching
    .map((entry) => entry.pitches)
    .filter((value): value is number => value !== null && value > 0);
  const recentAveragePitchCount = average(recentPitchCounts);
  const seasonPitchCountPerStart =
    seasonPitchCount !== null && seasonPitchCount > 0 ? seasonPitchCount / gamesStarted : null;
  const lastPitchCount = recentPitchCounts[0] ?? null;
  const priorPitchAverage = average(recentPitchCounts.slice(1, 4));
  const recentWorkloadSwing =
    lastPitchCount !== null && priorPitchAverage !== null
      ? Number((lastPitchCount - priorPitchAverage).toFixed(1))
      : null;
  const recentPitchCountVolatility = averageAbsoluteDelta(recentPitchCounts);
  const inningsPerStart = innings / gamesStarted;
  const seasonKPerBatter = strikeOuts / Math.max(battersFaced, 1);
  const recentKPerBatter = recentBattersFaced > 0 ? recentStrikeouts / recentBattersFaced : seasonKPerBatter;
  const kPerBatter = clamp(seasonKPerBatter * 0.6 + recentKPerBatter * 0.4, 0.08, 0.42);
  const battersPerInning = clamp(battersFaced / innings, 3.35, 4.85);
  const pitchesPerBatterSeason =
    seasonPitchCount !== null && seasonPitchCount > 0 ? seasonPitchCount / Math.max(battersFaced, 1) : null;
  const recentPitchTotal = recentPitchCounts.reduce((sum, value) => sum + value, 0);
  const recentPitchesPerBatter =
    recentBattersFaced > 0 && recentPitchTotal > 0 ? recentPitchTotal / recentBattersFaced : null;
  const pitchesPerBatter = clamp(
    ((pitchesPerBatterSeason ?? recentPitchesPerBatter ?? 4.0) * 0.55 +
      (recentPitchesPerBatter ?? pitchesPerBatterSeason ?? 4.0) * 0.45),
    3.4,
    5.2
  );
  const projectedPitchCount = Number(
    clamp(
      (recentAveragePitchCount ?? seasonPitchCountPerStart ?? 89) * 0.68 +
        (seasonPitchCountPerStart ?? recentAveragePitchCount ?? 89) * 0.32 +
        (recentWorkloadSwing !== null ? recentWorkloadSwing * 0.35 : 0),
      72,
      108
    ).toFixed(0)
  );
  let inningsAdjustment = 0;
  if (projectedPitchCount < 82) inningsAdjustment -= 0.45;
  else if (projectedPitchCount < 88) inningsAdjustment -= 0.25;
  else if (projectedPitchCount >= 96) inningsAdjustment += 0.15;

  if (recentWorkloadSwing !== null && recentWorkloadSwing <= -12) inningsAdjustment -= 0.3;
  else if (recentWorkloadSwing !== null && recentWorkloadSwing >= 10) inningsAdjustment += 0.1;

  if (recentPitchCountVolatility !== null && recentPitchCountVolatility >= 13) {
    inningsAdjustment -= 0.15;
  }

  const inningsFromHistory =
    recentInnings !== null ? recentInnings * 0.62 + inningsPerStart * 0.38 : inningsPerStart;
  const projectedBattersFacedByPitchCount = projectedPitchCount / pitchesPerBatter;
  const projectedBattersFaced = Number(
    clamp(
      projectedBattersFacedByPitchCount * 0.48 +
        (inningsFromHistory + inningsAdjustment) * battersPerInning * 0.52,
      13.5,
      30
    ).toFixed(1)
  );
  const projectedInnings = Number(clamp(projectedBattersFaced / battersPerInning, 3.6, 6.9).toFixed(1));
  const projectedTimesThroughOrder = Number((projectedBattersFaced / 9).toFixed(1));
  const projection = Number(clamp(projectedBattersFaced * kPerBatter, 1.5, 11).toFixed(1));
  const workloadLabel =
    recentWorkloadSwing !== null && recentWorkloadSwing <= -10
      ? "pitch dip"
      : recentWorkloadSwing !== null && recentWorkloadSwing >= 8
      ? "leash up"
      : recentPitchCountVolatility !== null && recentPitchCountVolatility >= 13
      ? "volatile leash"
      : "stable leash";

  return {
    projection,
    projectedInnings,
    projectedBattersFaced,
    projectedPitchCount,
    projectedTimesThroughOrder,
    recentAveragePitchCount: recentAveragePitchCount !== null ? Number(recentAveragePitchCount.toFixed(1)) : null,
    recentWorkloadSwing,
    recentPitchCountVolatility:
      recentPitchCountVolatility !== null ? Number(recentPitchCountVolatility.toFixed(1)) : null,
    contextNote: `proj ${projectedInnings.toFixed(1)} IP / ${projectedPitchCount.toFixed(0)} pitches / ${Math.round(projectedBattersFaced)} BF / ${projectedTimesThroughOrder.toFixed(1)}x order / ${workloadLabel}`,
  };
}

function estimatePitcherOuts(
  stat: Record<string, string | number | undefined>,
  gameLog: Array<{ stat?: Record<string, string | number | undefined> }>
) {
  const workload = estimatePitcherStrikeouts(stat, gameLog);
  if (!workload) return null;

  const projection = Number(clamp(workload.projectedInnings * 3, 10.8, 20.7).toFixed(1));

  return {
    ...workload,
    projection,
    contextNote: `proj ${projection.toFixed(1)} outs / ${workload.projectedInnings.toFixed(1)} IP / ${workload.projectedPitchCount.toFixed(0)} pitches / ${Math.round(workload.projectedBattersFaced)} BF / ${workload.projectedTimesThroughOrder.toFixed(1)}x order`,
  };
}

function estimateBatterHits(
  stat: Record<string, string | number | undefined>,
  gameLog: Array<{ stat?: Record<string, string | number | undefined> }>
) {
  const hits = safeNumber(stat.hits) ?? 0;
  const gamesPlayed = safeNumber(stat.gamesPlayed) ?? 0;
  const plateAppearances = getPlateAppearances(stat);

  if (gamesPlayed <= 0 || plateAppearances <= 0) return null;

  const recentHitting = gameLog
    .map((entry) => {
      const entryStat = entry.stat ?? {};
      return {
        plateAppearances: getPlateAppearances(entryStat),
        hits: safeNumber(entryStat.hits) ?? 0,
      };
    })
    .filter((entry) => entry.plateAppearances > 0)
    .slice(0, 8);
  const recentPlateAppearances = average(recentHitting.map((entry) => entry.plateAppearances));
  const seasonPaPerGame = plateAppearances / gamesPlayed;
  const expectedPlateAppearances = Number(
    clamp(
      recentPlateAppearances !== null ? recentPlateAppearances * 0.55 + seasonPaPerGame * 0.45 : seasonPaPerGame,
      2.5,
      5.2
    ).toFixed(1)
  );
  const seasonHitPerPa = hits / plateAppearances;
  const recentHits = recentHitting.reduce((sum, entry) => sum + entry.hits, 0);
  const recentPas = recentHitting.reduce((sum, entry) => sum + entry.plateAppearances, 0);
  const recentHitPerPa = recentPas > 0 ? recentHits / recentPas : seasonHitPerPa;
  const hitPerPa = clamp(seasonHitPerPa * 0.65 + recentHitPerPa * 0.35, 0.04, 0.42);
  const hitProbability = Number((1 - Math.pow(1 - hitPerPa, expectedPlateAppearances)).toFixed(3));
  const projection = Number(clamp(expectedPlateAppearances * hitPerPa, 0.15, 2.6).toFixed(1));
  const clearProfile = buildBatterLineClearProfile(gameLog, "hits", 1);
  const lineClearProbability = Number(
    clamp(
      hitProbability * 0.55 +
        (clearProfile.recentLineClearRate ?? hitProbability) * 0.3 +
        (clearProfile.seasonLineClearRate ?? hitProbability) * 0.15,
      0.05,
      0.95
    ).toFixed(3)
  );

  return {
    projection,
    expectedPlateAppearances,
    hitProbability,
    lineClearProbability,
    seasonLineClearRate: clearProfile.seasonLineClearRate,
    recentLineClearRate: clearProfile.recentLineClearRate,
    spikeGameShare: clearProfile.spikeGameShare,
    contextNote: `proj ${expectedPlateAppearances.toFixed(1)} PA / ${(hitProbability * 100).toFixed(0)}% hit / ${(lineClearProbability * 100).toFixed(0)}% clear`,
  };
}

function estimateBatterTotalBases(
  stat: Record<string, string | number | undefined>,
  gameLog: Array<{ stat?: Record<string, string | number | undefined> }>
) {
  const totalBases = safeNumber(stat.totalBases) ?? 0;
  const gamesPlayed = safeNumber(stat.gamesPlayed) ?? 0;
  const plateAppearances = getPlateAppearances(stat);

  if (gamesPlayed <= 0 || plateAppearances <= 0) return null;

  const recentHitting = gameLog
    .map((entry) => {
      const entryStat = entry.stat ?? {};
      return {
        plateAppearances: getPlateAppearances(entryStat),
        totalBases: safeNumber(entryStat.totalBases) ?? 0,
      };
    })
    .filter((entry) => entry.plateAppearances > 0)
    .slice(0, 8);
  const recentPlateAppearances = average(recentHitting.map((entry) => entry.plateAppearances));
  const seasonPaPerGame = plateAppearances / gamesPlayed;
  const expectedPlateAppearances = Number(
    clamp(
      recentPlateAppearances !== null ? recentPlateAppearances * 0.55 + seasonPaPerGame * 0.45 : seasonPaPerGame,
      2.5,
      5.2
    ).toFixed(1)
  );
  const seasonTbPerPa = totalBases / plateAppearances;
  const recentTotalBases = recentHitting.reduce((sum, entry) => sum + entry.totalBases, 0);
  const recentPas = recentHitting.reduce((sum, entry) => sum + entry.plateAppearances, 0);
  const recentTbPerPa = recentPas > 0 ? recentTotalBases / recentPas : seasonTbPerPa;
  const totalBasesPerPa = clamp(seasonTbPerPa * 0.65 + recentTbPerPa * 0.35, 0.08, 0.85);
  const projection = Number(clamp(expectedPlateAppearances * totalBasesPerPa, 0.25, 4.8).toFixed(1));
  const clearProfile = buildBatterLineClearProfile(gameLog, "totalBases", 2);
  const projectionClearProbability = 1 / (1 + Math.exp((1.5 - projection) * 1.05));
  const lineClearProbability = Number(
    clamp(
      projectionClearProbability * 0.2 +
        (clearProfile.recentLineClearRate ?? projectionClearProbability) * 0.45 +
        (clearProfile.seasonLineClearRate ?? projectionClearProbability) * 0.35,
      0.05,
      0.95
    ).toFixed(3)
  );

  return {
    projection,
    expectedPlateAppearances,
    lineClearProbability,
    seasonLineClearRate: clearProfile.seasonLineClearRate,
    recentLineClearRate: clearProfile.recentLineClearRate,
    spikeGameShare: clearProfile.spikeGameShare,
    contextNote: `proj ${expectedPlateAppearances.toFixed(1)} PA / ${(lineClearProbability * 100).toFixed(0)}% clear`,
  };
}

function estimatePoissonAtLeast(lambda: number, threshold: number) {
  if (threshold <= 1) return 1 - Math.exp(-lambda);

  let cumulative = 0;
  for (let count = 0; count < threshold; count += 1) {
    let factorial = 1;
    for (let divisor = 2; divisor <= count; divisor += 1) {
      factorial *= divisor;
    }
    cumulative += (Math.exp(-lambda) * Math.pow(lambda, count)) / factorial;
  }

  return 1 - cumulative;
}

function estimateBatterRunProductionProp(
  stat: Record<string, string | number | undefined>,
  gameLog: Array<{ stat?: Record<string, string | number | undefined> }>,
  options: {
    valueKey: "rbi" | "runs" | "hitsRunsRbis";
    label: string;
    clearThreshold: number;
    minRatePerPa: number;
    maxRatePerPa: number;
  }
) {
  const seasonValue = getBatterPropStatValue(stat, options.valueKey);
  const gamesPlayed = safeNumber(stat.gamesPlayed) ?? 0;
  const plateAppearances = getPlateAppearances(stat);

  if (gamesPlayed <= 0 || plateAppearances <= 0) return null;

  const recentHitting = gameLog
    .map((entry) => {
      const entryStat = entry.stat ?? {};
      return {
        plateAppearances: getPlateAppearances(entryStat),
        value: getBatterPropStatValue(entryStat, options.valueKey),
      };
    })
    .filter((entry) => entry.plateAppearances > 0)
    .slice(0, 12);
  const recentPlateAppearances = average(recentHitting.map((entry) => entry.plateAppearances));
  const seasonPaPerGame = plateAppearances / gamesPlayed;
  const expectedPlateAppearances = Number(
    clamp(
      recentPlateAppearances !== null ? recentPlateAppearances * 0.58 + seasonPaPerGame * 0.42 : seasonPaPerGame,
      2.5,
      5.3
    ).toFixed(1)
  );
  const seasonRatePerPa = seasonValue / plateAppearances;
  const recentValue = recentHitting.reduce((sum, entry) => sum + entry.value, 0);
  const recentPas = recentHitting.reduce((sum, entry) => sum + entry.plateAppearances, 0);
  const recentRatePerPa = recentPas > 0 ? recentValue / recentPas : seasonRatePerPa;
  const ratePerPa = clamp(
    seasonRatePerPa * 0.58 + recentRatePerPa * 0.42,
    options.minRatePerPa,
    options.maxRatePerPa
  );
  const projection = Number(
    clamp(expectedPlateAppearances * ratePerPa, 0.05, options.clearThreshold + 2.2).toFixed(1)
  );
  const clearProfile = buildBatterLineClearProfile(gameLog, options.valueKey, options.clearThreshold);
  const projectionClearProbability = estimatePoissonAtLeast(projection, options.clearThreshold);
  const lineClearProbability = Number(
    clamp(
      projectionClearProbability * 0.34 +
        (clearProfile.recentLineClearRate ?? projectionClearProbability) * 0.42 +
        (clearProfile.seasonLineClearRate ?? projectionClearProbability) * 0.24,
      0.05,
      0.95
    ).toFixed(3)
  );

  return {
    projection,
    expectedPlateAppearances,
    lineClearProbability,
    seasonLineClearRate: clearProfile.seasonLineClearRate,
    recentLineClearRate: clearProfile.recentLineClearRate,
    spikeGameShare: clearProfile.spikeGameShare,
    contextNote: `proj ${expectedPlateAppearances.toFixed(1)} PA / ${(lineClearProbability * 100).toFixed(0)}% ${options.label} clear`,
  };
}

async function projectPlayerProp(playerName: string, marketType: MlbPropType, season: number) {
  const player = await resolvePlayerIdentity(playerName);
  if (!player) return null;

  if (marketType === "pitcher_strikeouts") {
    const [stats, gameLog] = await Promise.all([
      fetchPlayerSeasonStats(player.id, "pitching", season),
      fetchPlayerGameLog(player.id, "pitching", season),
    ]);
    const projection = estimatePitcherStrikeouts(stats, gameLog);
    return {
      projection: projection?.projection ?? null,
      playerId: player.id,
      playerName: player.fullName,
      context: projection ?? null,
    };
  }

  if (marketType === "pitcher_outs") {
    const [stats, gameLog] = await Promise.all([
      fetchPlayerSeasonStats(player.id, "pitching", season),
      fetchPlayerGameLog(player.id, "pitching", season),
    ]);
    const projection = estimatePitcherOuts(stats, gameLog);
    return {
      projection: projection?.projection ?? null,
      playerId: player.id,
      playerName: player.fullName,
      context: projection ?? null,
    };
  }

  const [stats, gameLog] = await Promise.all([
    fetchPlayerSeasonStats(player.id, "hitting", season),
    fetchPlayerGameLog(player.id, "hitting", season),
  ]);
  let projection:
    | ReturnType<typeof estimateBatterHits>
    | ReturnType<typeof estimateBatterTotalBases>
    | ReturnType<typeof estimateBatterRunProductionProp> = null;

  if (marketType === "batter_hits") {
    projection = estimateBatterHits(stats, gameLog);
  } else if (marketType === "batter_total_bases") {
    projection = estimateBatterTotalBases(stats, gameLog);
  } else if (marketType === "batter_rbis") {
    projection = estimateBatterRunProductionProp(stats, gameLog, {
      valueKey: "rbi",
      label: "RBI",
      clearThreshold: 1,
      minRatePerPa: 0.015,
      maxRatePerPa: 0.28,
    });
  } else if (marketType === "batter_runs_scored") {
    projection = estimateBatterRunProductionProp(stats, gameLog, {
      valueKey: "runs",
      label: "run",
      clearThreshold: 1,
      minRatePerPa: 0.02,
      maxRatePerPa: 0.3,
    });
  } else if (marketType === "batter_hits_runs_rbis") {
    projection = estimateBatterRunProductionProp(stats, gameLog, {
      valueKey: "hitsRunsRbis",
      label: "H+R+RBI",
      clearThreshold: 2,
      minRatePerPa: 0.08,
      maxRatePerPa: 0.82,
    });
  }

  return {
    projection: projection?.projection ?? null,
    playerId: player.id,
    playerName: player.fullName,
    context: projection ?? null,
  };
}

function passesCurrentMlbPropFilters(params: {
  signedEdge: number;
  oddsTaken: number | null;
  sideProbability: number;
  impliedProbability: number | null;
}) {
  if (Math.abs(params.signedEdge) < 0.25 || params.oddsTaken === null) return false;
  if (
    params.impliedProbability !== null &&
    params.oddsTaken < -145 &&
    params.sideProbability < params.impliedProbability + 0.025
  ) {
    return false;
  }

  return true;
}

function buildMlbPropSideEvaluation(params: {
  event: MlbPropOddsEvent;
  marketType: MlbPropType;
  line: number | null;
  pickSide: "Over" | "Under";
  oddsTaken: number | null;
  projection: {
    playerName: string;
    context?: ({ contextNote?: string | null } & Record<string, unknown>) | null;
    projection: number;
  };
  rosterPlayer: { teamName: string; teamShort: string; fullName: string };
  learningProfile?: MlbLearningProfile | null;
  confirmedLineup: boolean;
  battingOrderSlot: number | null;
  battingOrderSample: number | null;
  signedEdge: number;
  preferredSide: "Over" | "Under";
}) {
  const pitcherContext = getPitcherContext(params.projection.context);
  const batterContext = getBatterContext(params.projection.context);
  const lowWorkloadHealth = getPitcherWorkloadHealth(
    params.learningProfile,
    params.marketType,
    params.pickSide,
    pitcherContext.projectedInnings
  );
  const sideProbability = estimateSideProbability({
    marketType: params.marketType,
    projectedLine: params.projection.projection,
    marketLine: params.line ?? 0,
    pickSide: params.pickSide,
    hitProbability: batterContext.hitProbability,
    lineClearProbability: batterContext.lineClearProbability,
  });
  const impliedProbability = americanToImpliedProbability(params.oddsTaken);
  const health = params.learningProfile?.propMarketHealth?.[params.marketType];
  const rawMarketScore = buildPropMarketScore({
    edge: params.signedEdge,
    oddsTaken: params.oddsTaken,
    projectedLine: params.projection.projection,
    trueProbability: sideProbability,
    marketType: params.marketType,
    pickSide: params.pickSide,
    projectedInnings: pitcherContext.projectedInnings,
    projectedPitchCount: pitcherContext.projectedPitchCount,
    projectedTimesThroughOrder: pitcherContext.projectedTimesThroughOrder,
    recentWorkloadSwing: pitcherContext.recentWorkloadSwing,
    expectedPlateAppearances: batterContext.expectedPlateAppearances,
    lineClearProbability: batterContext.lineClearProbability,
    spikeGameShare: batterContext.spikeGameShare,
    battingOrderSlot: params.battingOrderSlot,
    confirmedLineup: params.confirmedLineup,
    battingOrderSample: params.battingOrderSample,
  });
  const { score: marketHealthAdjustedScore, note: marketHealthNote } = applyMarketHealth(rawMarketScore, health);
  const lossReviewAdjustment = getLossReviewPropAdjustment({
    learningProfile: params.learningProfile,
    marketType: params.marketType,
    pickSide: params.pickSide,
    projectedInnings: pitcherContext.projectedInnings,
    projectedPitchCount: pitcherContext.projectedPitchCount,
    projectedTimesThroughOrder: pitcherContext.projectedTimesThroughOrder,
    recentWorkloadSwing: pitcherContext.recentWorkloadSwing,
    expectedPlateAppearances: batterContext.expectedPlateAppearances,
  });
  const marketScore = Number(
    clamp(marketHealthAdjustedScore - lossReviewAdjustment.confidencePenalty, 10, 100).toFixed(1)
  );
  const learningNote = [marketHealthNote, lossReviewAdjustment.note].filter(Boolean).join("; ") || null;
  const betProfile = buildPropBetProfile({
    edge: params.signedEdge,
    oddsTaken: params.oddsTaken,
    marketType: params.marketType,
    pickSide: params.pickSide,
    confidenceScore: marketScore,
    sideProbability,
    impliedProbability,
    projectedInnings: pitcherContext.projectedInnings,
    projectedPitchCount: pitcherContext.projectedPitchCount,
    projectedTimesThroughOrder: pitcherContext.projectedTimesThroughOrder,
    recentAveragePitchCount: pitcherContext.recentAveragePitchCount,
    recentWorkloadSwing: pitcherContext.recentWorkloadSwing,
    recentPitchCountVolatility: pitcherContext.recentPitchCountVolatility,
    expectedPlateAppearances: batterContext.expectedPlateAppearances,
    lineClearProbability: batterContext.lineClearProbability,
    seasonLineClearRate: batterContext.seasonLineClearRate,
    recentLineClearRate: batterContext.recentLineClearRate,
    spikeGameShare: batterContext.spikeGameShare,
    battingOrderSlot: params.battingOrderSlot,
    confirmedLineup: params.confirmedLineup,
    battingOrderSample: params.battingOrderSample,
    health,
    lowWorkloadHealth,
  });
  const passesCurrentFilters = passesCurrentMlbPropFilters({
    signedEdge: params.signedEdge,
    oddsTaken: params.oddsTaken,
    sideProbability,
    impliedProbability,
  });

  return {
    candidate: {
      external_event_id: params.event.id,
      commence_time: params.event.commence_time,
      game_label: `${params.event.away_team} @ ${params.event.home_team}`,
      home_team: params.event.home_team,
      away_team: params.event.away_team,
      player_name: params.projection.playerName,
      player_team: params.rosterPlayer.teamName,
      player_team_short: params.rosterPlayer.teamShort,
      market_type: params.marketType,
      line: params.line,
      side: `${params.pickSide} ${params.line}`,
      odds_taken: params.oddsTaken,
      confidence_score: marketScore,
      projected_line: params.projection.projection,
      market_line: params.line,
      edge: Math.abs(params.signedEdge),
      edge_label: `${params.pickSide} value${params.projection.context?.contextNote ? ` | ${params.projection.context.contextNote}` : ""}`,
      stat_key: MLB_PROP_MARKET_MAP[params.marketType].statKey,
      top_pick_score: Number(
        (
          marketScore +
          Math.max(0, 1 - Math.abs((americanToImpliedProbability(params.oddsTaken) ?? 0.5) - 0.56)) * 18 +
          (sideProbability - (impliedProbability ?? 0.5)) * 120 +
          (health?.lockEligible === false ? -28 : 0) +
          (health?.ratingAdjustment ?? 0) -
          lossReviewAdjustment.topPickPenalty
        ).toFixed(1)
      ),
      notes: null,
      projected_innings: pitcherContext.projectedInnings,
      projected_batters_faced: pitcherContext.projectedBattersFaced,
      projected_pitch_count: pitcherContext.projectedPitchCount,
      projected_times_through_order: pitcherContext.projectedTimesThroughOrder,
      recent_average_pitch_count: pitcherContext.recentAveragePitchCount,
      recent_workload_swing: pitcherContext.recentWorkloadSwing,
      recent_pitch_count_volatility: pitcherContext.recentPitchCountVolatility,
      expected_plate_appearances: batterContext.expectedPlateAppearances,
      true_probability: sideProbability,
      line_clear_probability: batterContext.lineClearProbability,
      recent_line_clear_rate: batterContext.recentLineClearRate,
      season_line_clear_rate: batterContext.seasonLineClearRate,
      spike_game_share: batterContext.spikeGameShare,
      batting_order_slot: params.battingOrderSlot,
      batting_order_sample: params.battingOrderSample,
      confirmed_lineup: params.confirmedLineup,
      context_note: params.projection.context?.contextNote ?? null,
      market_health_note: learningNote,
      bet_recommendation: betProfile.betRecommendation,
      reason_labels: betProfile.reasonLabels,
      risk_flags: betProfile.riskFlags,
    } satisfies MlbPropCandidate,
    auditCandidate: {
      external_event_id: params.event.id,
      commence_time: params.event.commence_time,
      game_label: `${params.event.away_team} @ ${params.event.home_team}`,
      home_team: params.event.home_team,
      away_team: params.event.away_team,
      player_name: params.projection.playerName,
      player_team: params.rosterPlayer.teamName,
      player_team_short: params.rosterPlayer.teamShort,
      market_type: params.marketType,
      line: params.line,
      side: `${params.pickSide} ${params.line}`,
      odds_taken: params.oddsTaken,
      projected_line: params.projection.projection,
      market_line: params.line,
      signed_edge: Number(params.signedEdge.toFixed(3)),
      edge: Number(Math.abs(params.signedEdge).toFixed(3)),
      implied_probability: impliedProbability,
      true_probability: sideProbability,
      confidence_score: marketScore,
      top_pick_score: Number(
        (
          marketScore +
          Math.max(0, 1 - Math.abs((americanToImpliedProbability(params.oddsTaken) ?? 0.5) - 0.56)) * 18 +
          (sideProbability - (impliedProbability ?? 0.5)) * 120 +
          (health?.lockEligible === false ? -28 : 0) +
          (health?.ratingAdjustment ?? 0) -
          lossReviewAdjustment.topPickPenalty
        ).toFixed(1)
      ),
      expected_plate_appearances: batterContext.expectedPlateAppearances,
      line_clear_probability: batterContext.lineClearProbability,
      recent_line_clear_rate: batterContext.recentLineClearRate,
      season_line_clear_rate: batterContext.seasonLineClearRate,
      spike_game_share: batterContext.spikeGameShare,
      projected_innings: pitcherContext.projectedInnings,
      projected_pitch_count: pitcherContext.projectedPitchCount,
      projected_times_through_order: pitcherContext.projectedTimesThroughOrder,
      confirmed_lineup: params.confirmedLineup,
      batting_order_slot: params.battingOrderSlot,
      batting_order_sample: params.battingOrderSample,
      context_note: params.projection.context?.contextNote ?? null,
      market_health_note: learningNote,
      bet_recommendation: betProfile.betRecommendation,
      reason_labels: betProfile.reasonLabels,
      risk_flags: betProfile.riskFlags,
      passes_current_filters: passesCurrentFilters,
      current_model_preferred_side: `${params.preferredSide} ${params.line}`,
      selected_for_current_candidate_pool: passesCurrentFilters && params.pickSide === params.preferredSide,
    } satisfies MlbPropAuditCandidate,
    passesCurrentFilters,
  };
}

export async function evaluateMlbPlayerProps(params: {
  event: MlbPropOddsEvent;
  businessDate: string;
  marketTypes?: MlbPropType[];
  learningProfile?: MlbLearningProfile | null;
}) {
  const marketTypes = params.marketTypes ?? getMlbPropMarketTypes(true);
  const season = Number(params.businessDate.slice(0, 4));
  const [homeRoster, awayRoster] = await Promise.all([
    getActiveRosterForTeam(params.event.home_team),
    getActiveRosterForTeam(params.event.away_team),
  ]);
  const lineupContext = await getLineupContext(
    params.businessDate,
    params.event.away_team,
    params.event.home_team
  );
  const rosterByName = new Map(
    [
      ...awayRoster.map((player) => ({
        ...player,
        teamName: params.event.away_team,
        teamShort: getShortTeamName(params.event.away_team),
      })),
      ...homeRoster.map((player) => ({
        ...player,
        teamName: params.event.home_team,
        teamShort: getShortTeamName(params.event.home_team),
      })),
    ].map((player) => [normalizePlayerName(player.fullName), player])
  );
  const allCandidates: MlbPropCandidate[] = [];
  const auditCandidates: MlbPropAuditCandidate[] = [];
  let offeredCount = 0;
  let rosterMatchedCount = 0;
  let projectedCount = 0;
  let passedFilterCount = 0;

  for (const marketType of marketTypes) {
    const parsedRows = parsePropMarket(params.event, marketType);
    offeredCount += parsedRows.length;

    for (const row of parsedRows) {
      const rosterPlayer = rosterByName.get(normalizePlayerName(row.player_name));
      if (!rosterPlayer) continue;

      const lineupSlots = lineupContext.teamSlotMaps.get(rosterPlayer.teamName) ?? null;
      const confirmedLineup = lineupContext.confirmedTeams.has(rosterPlayer.teamName);
      const likelySlots = lineupContext.likelyTeamSlotMaps.get(rosterPlayer.teamName) ?? null;
      const likelySlotInfo =
        likelySlots?.get(normalizePlayerName(rosterPlayer.fullName)) ??
        likelySlots?.get(normalizePlayerName(row.player_name)) ??
        null;
      const confirmedSlot =
        lineupSlots?.get(normalizePlayerName(rosterPlayer.fullName)) ??
        lineupSlots?.get(normalizePlayerName(row.player_name)) ??
        null;
      const battingOrderSlot = confirmedSlot ?? likelySlotInfo?.slot ?? null;
      const battingOrderSample = confirmedLineup ? null : likelySlotInfo?.sample ?? null;
      if (confirmedLineup && !isPitcherWorkloadMarket(marketType) && battingOrderSlot === null) {
        continue;
      }

      rosterMatchedCount += 1;

      const projection = await projectPlayerProp(rosterPlayer.fullName, marketType, season);
      if (!projection?.projection || row.line === null) continue;
      projectedCount += 1;

      const overSignedEdge = Number((projection.projection - row.line).toFixed(3));
      const preferredSide = overSignedEdge >= 0 ? "Over" : "Under";
      const sideEvaluations = [
        buildMlbPropSideEvaluation({
          event: params.event,
          marketType,
          line: row.line,
          pickSide: "Over",
          oddsTaken: row.over_odds,
          projection: {
            playerName: projection.playerName,
            context: projection.context ?? null,
            projection: projection.projection,
          },
          rosterPlayer,
          learningProfile: params.learningProfile,
          confirmedLineup,
          battingOrderSlot,
          battingOrderSample,
          signedEdge: overSignedEdge,
          preferredSide,
        }),
        buildMlbPropSideEvaluation({
          event: params.event,
          marketType,
          line: row.line,
          pickSide: "Under",
          oddsTaken: row.under_odds,
          projection: {
            playerName: projection.playerName,
            context: projection.context ?? null,
            projection: projection.projection,
          },
          rosterPlayer,
          learningProfile: params.learningProfile,
          confirmedLineup,
          battingOrderSlot,
          battingOrderSample,
          signedEdge: Number((row.line - projection.projection).toFixed(3)),
          preferredSide,
        }),
      ];

      auditCandidates.push(...sideEvaluations.map((entry) => entry.auditCandidate));

      const preferredEvaluation = sideEvaluations.find(
        (entry) => entry.candidate.side.startsWith(preferredSide)
      );
      if (!preferredEvaluation?.passesCurrentFilters) continue;
      passedFilterCount += 1;
      allCandidates.push(preferredEvaluation.candidate);
    }
  }

  const sorted = allCandidates.sort((a, b) => b.top_pick_score - a.top_pick_score);
  const seen = new Set<string>();
  const uniqueCandidates = sorted.filter((candidate) => {
    const key = `${candidate.player_name}|${candidate.market_type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    candidates: uniqueCandidates,
    auditCandidates,
    diagnostics: {
      offeredCount,
      rosterMatchedCount,
      projectedCount,
      passedFilterCount,
      savedUniqueCount: uniqueCandidates.length,
    },
  };
}
