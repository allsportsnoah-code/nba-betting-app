export type NflTeamMarketKey =
  | "moneyline"
  | "spread"
  | "game_total"
  | "home_team_total"
  | "away_team_total";

export type NflPropCategoryKey =
  | "passing"
  | "rushing"
  | "receiving"
  | "combo"
  | "scoring"
  | "kicking"
  | "defense";

export type NflPropMarketKey =
  | "passing_yards"
  | "passing_tds"
  | "pass_attempts"
  | "pass_completions"
  | "passing_interceptions"
  | "longest_completion"
  | "rushing_yards"
  | "rushing_attempts"
  | "longest_rush"
  | "rushing_tds"
  | "receiving_yards"
  | "receptions"
  | "targets"
  | "longest_reception"
  | "receiving_tds"
  | "rush_plus_rec_yards"
  | "qb_pass_plus_rush_yards"
  | "anytime_td"
  | "first_td"
  | "field_goals_made"
  | "longest_field_goal"
  | "extra_points_made"
  | "tackles_plus_assists"
  | "sacks"
  | "interceptions";

export type NflTeamMarketDefinition = {
  key: NflTeamMarketKey;
  label: string;
  shortLabel: string;
  group: "team";
};

export type NflPropMarketDefinition = {
  key: NflPropMarketKey;
  label: string;
  shortLabel: string;
  category: NflPropCategoryKey;
};

export const NFL_TEAM_MARKETS: NflTeamMarketDefinition[] = [
  { key: "moneyline", label: "Moneyline", shortLabel: "ML", group: "team" },
  { key: "spread", label: "Spread", shortLabel: "ATS", group: "team" },
  { key: "game_total", label: "Game Total", shortLabel: "Total", group: "team" },
  { key: "home_team_total", label: "Home Team Total", shortLabel: "Home TT", group: "team" },
  { key: "away_team_total", label: "Away Team Total", shortLabel: "Away TT", group: "team" },
];

export const NFL_PROP_MARKETS: NflPropMarketDefinition[] = [
  { key: "passing_yards", label: "Passing Yards", shortLabel: "Pass Yds", category: "passing" },
  { key: "passing_tds", label: "Passing Touchdowns", shortLabel: "Pass TDs", category: "passing" },
  { key: "pass_attempts", label: "Pass Attempts", shortLabel: "Attempts", category: "passing" },
  { key: "pass_completions", label: "Completions", shortLabel: "Comps", category: "passing" },
  { key: "passing_interceptions", label: "Interceptions", shortLabel: "INTs", category: "passing" },
  { key: "longest_completion", label: "Longest Completion", shortLabel: "Long Comp", category: "passing" },
  { key: "rushing_yards", label: "Rushing Yards", shortLabel: "Rush Yds", category: "rushing" },
  { key: "rushing_attempts", label: "Rushing Attempts", shortLabel: "Carries", category: "rushing" },
  { key: "longest_rush", label: "Longest Rush", shortLabel: "Long Rush", category: "rushing" },
  { key: "rushing_tds", label: "Rushing Touchdowns", shortLabel: "Rush TDs", category: "rushing" },
  { key: "receiving_yards", label: "Receiving Yards", shortLabel: "Rec Yds", category: "receiving" },
  { key: "receptions", label: "Receptions", shortLabel: "Recs", category: "receiving" },
  { key: "targets", label: "Targets", shortLabel: "Targets", category: "receiving" },
  { key: "longest_reception", label: "Longest Reception", shortLabel: "Long Rec", category: "receiving" },
  { key: "receiving_tds", label: "Receiving Touchdowns", shortLabel: "Rec TDs", category: "receiving" },
  { key: "rush_plus_rec_yards", label: "Rush + Receiving Yards", shortLabel: "Rush+Rec", category: "combo" },
  { key: "qb_pass_plus_rush_yards", label: "QB Pass + Rush Yards", shortLabel: "QB Combo", category: "combo" },
  { key: "anytime_td", label: "Anytime Touchdown", shortLabel: "ATD", category: "scoring" },
  { key: "first_td", label: "First Touchdown", shortLabel: "1st TD", category: "scoring" },
  { key: "field_goals_made", label: "Field Goals Made", shortLabel: "FG Made", category: "kicking" },
  { key: "longest_field_goal", label: "Longest Field Goal", shortLabel: "Long FG", category: "kicking" },
  { key: "extra_points_made", label: "Extra Points Made", shortLabel: "XP Made", category: "kicking" },
  { key: "tackles_plus_assists", label: "Tackles + Assists", shortLabel: "T+A", category: "defense" },
  { key: "sacks", label: "Sacks", shortLabel: "Sacks", category: "defense" },
  { key: "interceptions", label: "Interceptions", shortLabel: "INT", category: "defense" },
];

export const NFL_PROP_CATEGORY_LABELS: Record<NflPropCategoryKey, string> = {
  passing: "Passing",
  rushing: "Rushing",
  receiving: "Receiving",
  combo: "Combo",
  scoring: "Scoring",
  kicking: "Kicking",
  defense: "Defense",
};

// ---------------------------------------------------------------------------
// NFL Pick Scoring
// ---------------------------------------------------------------------------

export type NflCandidate = {
  marketType: "moneyline" | "spread" | "game_total";
  side: string;
  lineTaken: number | null;
  oddsTaken: number;
  edge: number;
  confidenceScore: number;
  projectedLine: number | null;
  marketLine: number | null;
  payoutPerUnit: number;
  selectedImpliedProb: number;
  projectedSideMargin?: number | null;
  coverBuffer?: number | null;
  contextRiskScore?: number;
  betRecommendation: "bet" | "lean" | "pass";
  edgeLabel: string;
  reasonLabels: string[];
  riskFlags: string[];
};

function americanToProfitPerUnitNfl(american: number): number {
  if (american > 0) return american / 100;
  return 100 / Math.abs(american);
}

function americanToImpliedProbNfl(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

export function getNflTopPickScore(params: {
  marketType: "moneyline" | "spread" | "game_total";
  edge: number;
  confidenceScore: number;
  oddsTaken: number;
  projectedSideMargin?: number | null;
  coverBuffer?: number | null;
  contextRiskScore?: number;
}): number {
  const payoutPerUnit = americanToProfitPerUnitNfl(params.oddsTaken);
  const impliedProb = americanToImpliedProbNfl(params.oddsTaken);

  // Favorites get a stability bonus — consistent-hit strategy prefers high-prob outcomes
  const favoriteBonus = params.oddsTaken < 0
    ? Math.min((Math.abs(params.oddsTaken) - 100) / 50, 10)
    : 0;
  // Penalize heavy underdogs on moneyline
  const longshotPenalty = params.marketType === "moneyline" && params.oddsTaken > 160
    ? Math.min((params.oddsTaken - 160) / 30, 10)
    : 0;
  // Reward implied probability in the 55-70% range (high hit-rate zone)
  const hitRateBonus = (1 - Math.abs(impliedProb - 0.62)) * 14;
  // Market stability: spreads are most reliable in NFL, totals next, ML last
  const marketStability = params.marketType === "spread" ? 12 : params.marketType === "game_total" ? 8 : 4;

  let supportAdjustment = 0;
  if (params.marketType === "moneyline") {
    if ((params.projectedSideMargin ?? 0) < 1.5) supportAdjustment -= 12;
    if ((params.projectedSideMargin ?? 0) < 0.5) supportAdjustment -= 10;
    if (params.edge < 5.0) supportAdjustment -= 10;
  }
  if (params.marketType === "spread") {
    if ((params.coverBuffer ?? 0) >= 2.0) supportAdjustment += 8;
    if ((params.coverBuffer ?? 0) < 0.5) supportAdjustment -= 10;
  }

  const contextPenalty = (params.contextRiskScore ?? 0) * 0.6;

  return Number(
    Math.max(
      0,
      params.confidenceScore * 1.3 +
      impliedProb * 60 +
      params.edge * 8 +
      favoriteBonus +
      hitRateBonus +
      marketStability +
      supportAdjustment -
      longshotPenalty -
      contextPenalty
    ).toFixed(1)
  );
}

export function isNflCandidateTopPickEligible(candidate: NflCandidate): boolean {
  if (candidate.betRecommendation !== "bet") return false;
  if (candidate.marketType === "moneyline") {
    return (
      candidate.edge >= 5.0 &&
      candidate.confidenceScore >= 65 &&
      candidate.payoutPerUnit <= 1.1 &&
      (candidate.projectedSideMargin ?? 0) >= 1.5
    );
  }
  if (candidate.marketType === "spread") {
    return (
      candidate.edge >= 2.0 &&
      candidate.confidenceScore >= 72 &&
      candidate.payoutPerUnit >= 0.88 &&
      (candidate.coverBuffer ?? 0) >= 0.5
    );
  }
  if (candidate.marketType === "game_total") {
    return (
      candidate.edge >= 2.5 &&
      candidate.confidenceScore >= 70 &&
      candidate.payoutPerUnit >= 0.88 &&
      candidate.selectedImpliedProb >= 0.52
    );
  }
  return false;
}

export function buildNflBetProfile(params: {
  marketType: "moneyline" | "spread" | "game_total";
  edge: number;
  confidenceScore: number;
  payoutPerUnit: number;
  projectedSideMargin?: number | null;
  coverBuffer?: number | null;
  contextRiskScore?: number;
}): { betRecommendation: NflCandidate["betRecommendation"]; reasonLabels: string[]; riskFlags: string[] } {
  const reasonLabels: string[] = [];
  const riskFlags: string[] = [];

  if (params.payoutPerUnit >= 0.88) {
    reasonLabels.push(`pays ${params.payoutPerUnit.toFixed(2)}u`);
  } else {
    riskFlags.push(`low payout ${params.payoutPerUnit.toFixed(2)}u`);
  }

  if (params.marketType === "moneyline") {
    const margin = params.projectedSideMargin ?? 0;
    if (margin >= 2) reasonLabels.push(`model favors side by ${margin.toFixed(1)}`);
    else if (margin >= 1) reasonLabels.push(`model supports side by ${margin.toFixed(1)}`);
    else riskFlags.push(`thin ML margin ${margin.toFixed(1)}`);
    if (params.edge >= 6) reasonLabels.push(`${params.edge.toFixed(1)}% ML edge`);
    else if (params.edge < 3) riskFlags.push("thin ML edge");
  }

  if (params.marketType === "spread") {
    const buffer = params.coverBuffer ?? 0;
    if (buffer >= 2) reasonLabels.push(`${buffer.toFixed(1)} pt cover buffer`);
    else if (buffer >= 0.5) reasonLabels.push(`${buffer.toFixed(1)} pt spread support`);
    else riskFlags.push("thin spread buffer");
    if (params.edge >= 2.5) reasonLabels.push(`${params.edge.toFixed(1)} pt edge`);
  }

  if (params.marketType === "game_total") {
    if (params.edge >= 3) reasonLabels.push(`${params.edge.toFixed(1)} pt total edge`);
    else if (params.edge < 1.5) riskFlags.push("thin total edge");
  }

  if ((params.contextRiskScore ?? 0) >= 20) {
    riskFlags.push(`high context risk ${params.contextRiskScore}/40`);
  }

  const hardRisk = riskFlags.some((f) =>
    f.includes("thin") || f.includes("low payout") || f.includes("high context risk")
  );

  let betRecommendation: NflCandidate["betRecommendation"] = "lean";
  if (!hardRisk && params.confidenceScore >= 62 && params.payoutPerUnit >= 0.88) {
    betRecommendation = "bet";
  } else if (params.confidenceScore < 45 || hardRisk) {
    betRecommendation = "pass";
  }

  return { betRecommendation, reasonLabels, riskFlags };
}

export const NFL_MODEL_READINESS_TRACKS = [
  {
    title: "Roster Map",
    items: [
      "depth chart changes",
      "rookie landing spots",
      "usage splits by position group",
      "QB / OL / skill-player continuity",
    ],
  },
  {
    title: "Team Tactics",
    items: [
      "pass rate over expectation",
      "neutral pace",
      "red-zone tendency",
      "run funnel vs pass funnel matchup",
    ],
  },
  {
    title: "Player Context",
    items: [
      "route share and target share",
      "carry share and goal-line work",
      "air yards and depth of target",
      "injury and snap-count risk",
    ],
  },
] as const;
