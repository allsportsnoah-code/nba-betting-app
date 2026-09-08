import { projectHomeSpread } from "@/lib/projections";
import {
  buildNbaTeamInjuryAdjustments,
  isNbaHighRiskStatus,
  type NbaInjuryReportRow,
} from "@/lib/nbaInjuries";
import type { NbaLearningProfile } from "@/lib/nbaLearning";
import { americanToProfitPerUnit } from "@/lib/units";

export const teamRatings: Record<
  string,
  { offRating: number; defRating: number; restDays: number; injuryAdjustment: number }
> = {
  "Atlanta Hawks": { offRating: 117.0, defRating: 119.0, restDays: 1, injuryAdjustment: 0 },
  "Boston Celtics": { offRating: 121.5, defRating: 111.0, restDays: 1, injuryAdjustment: 0 },
  "Brooklyn Nets": { offRating: 110.8, defRating: 116.8, restDays: 1, injuryAdjustment: 0 },
  "Charlotte Hornets": { offRating: 109.0, defRating: 119.3, restDays: 1, injuryAdjustment: 0 },
  "Chicago Bulls": { offRating: 114.4, defRating: 116.6, restDays: 1, injuryAdjustment: 0 },
  "Cleveland Cavaliers": { offRating: 121.0, defRating: 111.4, restDays: 1, injuryAdjustment: 0 },
  "Dallas Mavericks": { offRating: 116.3, defRating: 114.8, restDays: 1, injuryAdjustment: 0 },
  "Denver Nuggets": { offRating: 118.0, defRating: 114.8, restDays: 1, injuryAdjustment: 0 },
  "Detroit Pistons": { offRating: 111.8, defRating: 116.4, restDays: 1, injuryAdjustment: 0 },
  "Golden State Warriors": { offRating: 117.0, defRating: 115.1, restDays: 1, injuryAdjustment: 0 },
  "Houston Rockets": { offRating: 113.7, defRating: 110.9, restDays: 1, injuryAdjustment: 0 },
  "Indiana Pacers": { offRating: 118.1, defRating: 117.0, restDays: 1, injuryAdjustment: 0 },
  "LA Clippers": { offRating: 114.0, defRating: 111.6, restDays: 1, injuryAdjustment: 0 },
  "Los Angeles Clippers": { offRating: 114.0, defRating: 111.6, restDays: 1, injuryAdjustment: 0 },
  "Los Angeles Lakers": { offRating: 116.5, defRating: 114.2, restDays: 1, injuryAdjustment: 0 },
  "Memphis Grizzlies": { offRating: 111.0, defRating: 113.7, restDays: 1, injuryAdjustment: 0 },
  "Miami Heat": { offRating: 113.0, defRating: 112.4, restDays: 1, injuryAdjustment: 0 },
  "Milwaukee Bucks": { offRating: 118.4, defRating: 114.9, restDays: 1, injuryAdjustment: 0 },
  "Minnesota Timberwolves": { offRating: 114.7, defRating: 108.8, restDays: 1, injuryAdjustment: 0 },
  "New Orleans Pelicans": { offRating: 112.7, defRating: 116.0, restDays: 1, injuryAdjustment: 0 },
  "New York Knicks": { offRating: 117.2, defRating: 112.1, restDays: 1, injuryAdjustment: 0 },
  "Oklahoma City Thunder": { offRating: 119.5, defRating: 111.2, restDays: 1, injuryAdjustment: 0 },
  "Orlando Magic": { offRating: 112.9, defRating: 110.8, restDays: 1, injuryAdjustment: 0 },
  "Philadelphia 76ers": { offRating: 114.1, defRating: 113.8, restDays: 1, injuryAdjustment: 0 },
  "Phoenix Suns": { offRating: 117.1, defRating: 115.9, restDays: 1, injuryAdjustment: 0 },
  "Portland Trail Blazers": { offRating: 108.8, defRating: 117.5, restDays: 1, injuryAdjustment: 0 },
  "Sacramento Kings": { offRating: 116.8, defRating: 115.7, restDays: 1, injuryAdjustment: 0 },
  "San Antonio Spurs": { offRating: 112.2, defRating: 117.9, restDays: 1, injuryAdjustment: 0 },
  "Toronto Raptors": { offRating: 112.0, defRating: 118.2, restDays: 1, injuryAdjustment: 0 },
  "Utah Jazz": { offRating: 111.2, defRating: 119.6, restDays: 1, injuryAdjustment: 0 },
  "Washington Wizards": { offRating: 109.7, defRating: 121.2, restDays: 1, injuryAdjustment: 0 },
};

export function americanToImpliedProb(american: number) {
  if (american > 0) return (100 / (american + 100)) * 100;
  return (Math.abs(american) / (Math.abs(american) + 100)) * 100;
}

export type NbaTeamMarketType = "moneyline" | "spread" | "total";

export const NBA_MONEYLINE_EDGE_CAP_PERCENT = 18;

type NbaTeamScoreInput = {
  marketType: NbaTeamMarketType;
  edge: number | null;
  confidenceScore: number | null;
  oddsTaken: number | null;
};

function getNbaTeamEdgeMultiplier(marketType: NbaTeamMarketType) {
  if (marketType === "moneyline") return 6;
  if (marketType === "total") return 16;
  return 18;
}

export function getNbaTeamTopPickScore({
  marketType,
  edge,
  confidenceScore,
  oddsTaken,
}: NbaTeamScoreInput) {
  if (edge === null || confidenceScore === null || oddsTaken === null) return 0;

  const scoringEdge =
    marketType === "moneyline" ? capNbaMoneylineEdge(edge) ?? edge : edge;
  const payoutPerUnit = americanToProfitPerUnit(oddsTaken);
  const impliedProbability = americanToImpliedProb(oddsTaken);
  const targetImpliedProbability = marketType === "moneyline" ? 56 : 54;
  const oddsFitScore = (100 - Math.abs(impliedProbability - targetImpliedProbability)) * 0.2;
  // Favorites (negative odds) get higher stability bonus — they hit more consistently
  const stabilityBonus =
    marketType === "total" ? 16 : marketType === "moneyline" ? (oddsTaken < 0 ? 16 : 4) : 10;
  const longshotPenalty =
    payoutPerUnit > (marketType === "moneyline" ? 1.6 : 1.05)
      ? (payoutPerUnit - (marketType === "moneyline" ? 1.6 : 1.05)) * 14
      : 0;

  return Number(
    (
      confidenceScore * 0.75 +
      Math.abs(scoringEdge) * getNbaTeamEdgeMultiplier(marketType) +
      oddsFitScore +
      stabilityBonus -
      longshotPenalty
    ).toFixed(1)
  );
}

export function getNbaTeamBestValueScore({
  marketType,
  edge,
  confidenceScore,
  oddsTaken,
}: NbaTeamScoreInput) {
  if (edge === null || confidenceScore === null || oddsTaken === null) return 0;

  const scoringEdge =
    marketType === "moneyline" ? capNbaMoneylineEdge(edge) ?? edge : edge;
  const payoutPerUnit = americanToProfitPerUnit(oddsTaken);
  // Reward favorites, not underdogs — goal is consistent hits over high payout
  const plusMoneyBonus = oddsTaken > 0 ? (marketType === "moneyline" ? 2 : 1) : 0;
  const favoriteBonus =
    marketType === "moneyline" && oddsTaken < 0
      ? Math.min((Math.abs(oddsTaken) - 100) / 60, 8)
      : 0;
  // Penalize heavy underdogs instead of heavy favorites
  const longshotPenalty =
    marketType === "moneyline" && oddsTaken > 150
      ? Math.min((oddsTaken - 150) / 30, 8)
      : 0;
  const payoutWeight = marketType === "moneyline" ? 10 : 16;

  return Number(
    (
      confidenceScore * 0.55 +
      Math.abs(scoringEdge) * (getNbaTeamEdgeMultiplier(marketType) + 0.5) +
      payoutPerUnit * payoutWeight +
      plusMoneyBonus +
      favoriteBonus -
      longshotPenalty
    ).toFixed(1)
  );
}

function probabilityToAmerican(probabilityPercent: number) {
  const probability = Math.min(Math.max(probabilityPercent / 100, 0.01), 0.99);
  if (probability >= 0.5) {
    return Math.round((-100 * probability) / (1 - probability));
  }
  return Math.round((100 * (1 - probability)) / probability);
}

function projectedHomeWinProbFromMargin(projectedHomeMargin: number | null) {
  if (projectedHomeMargin === null || projectedHomeMargin === undefined) return null;
  const probability = 1 / (1 + Math.exp(-projectedHomeMargin / 6.2));
  return Number((probability * 100).toFixed(1));
}

function projectTotalPoints(
  home: { offRating: number; defRating: number; restDays: number; injuryAdjustment: number } | undefined,
  away: { offRating: number; defRating: number; restDays: number; injuryAdjustment: number } | undefined
) {
  if (!home || !away) return null;

  const baseHomePoints = (home.offRating + away.defRating) / 2;
  const baseAwayPoints = (away.offRating + home.defRating) / 2;
  const paceAdjustedTotal = (baseHomePoints + baseAwayPoints) * 0.94;
  const restAdjustment = ((home.restDays ?? 1) + (away.restDays ?? 1) - 2) * 0.6;
  const injuryAdjustment = ((home.injuryAdjustment ?? 0) + (away.injuryAdjustment ?? 0)) * 0.5;

  return Number((paceAdjustedTotal + restAdjustment + injuryAdjustment).toFixed(1));
}

function buildMatchupPairKey(homeTeam: string | null | undefined, awayTeam: string | null | undefined) {
  return [homeTeam ?? "", awayTeam ?? ""].sort((a, b) => a.localeCompare(b)).join("::");
}

function buildNbaGameContextRisk(params: {
  homeTeam: string;
  awayTeam: string;
  injuryRows?: NbaInjuryReportRow[] | null;
}) {
  const notes: string[] = [];
  let score = 0;

  const matchingRows = (params.injuryRows ?? []).filter((row) => {
    const team = row.team.toLowerCase();
    return team === params.homeTeam.toLowerCase() || team === params.awayTeam.toLowerCase();
  });

  for (const row of matchingRows) {
    if (!isNbaHighRiskStatus(row.status) || row.impactScore <= 0) continue;

    const playerRisk =
      row.status === "out" || row.status === "inactive" || row.status === "suspended"
        ? row.impactScore * 4
        : row.status === "doubtful"
        ? row.impactScore * 3
        : row.impactScore * 2;

    score += playerRisk;

    if (row.impactScore >= 3) {
      notes.push(`${row.playerName} ${row.statusLabel.toLowerCase()} for ${row.team}`);
    }
  }

  return {
    score: Math.round(Math.min(score, 40)),
    notes: notes.slice(0, 4),
  };
}

function getMoneylineLabel(edgePercent: number | null, projectedWinner: "home" | "away" | null) {
  if (edgePercent === null || projectedWinner === null) return "Pass";
  if (edgePercent >= 2.5) return "Home moneyline value";
  if (edgePercent <= -2.5) return "Away moneyline value";
  if (projectedWinner === "home" && edgePercent >= 0.75) return "Home moneyline lean";
  if (projectedWinner === "away" && edgePercent <= -0.75) return "Away moneyline lean";
  return "Pass";
}

export function capNbaMoneylineEdge(edgePercent: number | null | undefined) {
  if (edgePercent === null || edgePercent === undefined) return null;
  return Number(
    Math.max(
      -NBA_MONEYLINE_EDGE_CAP_PERCENT,
      Math.min(NBA_MONEYLINE_EDGE_CAP_PERCENT, edgePercent)
    ).toFixed(1)
  );
}

function getTotalLabel(edge: number | null) {
  if (edge === null) return "Pass";
  if (edge >= 2) return "Over value";
  if (edge <= -2) return "Under value";
  if (edge >= 0.75) return "Over lean";
  if (edge <= -0.75) return "Under lean";
  return "Pass";
}

export function getEdgeLabel(edge: number | null) {
  if (edge === null) return "No model";
  if (edge >= 1.5) return "Home value";
  if (edge <= -1.5) return "Away value";
  return "Pass";
}

export function getTopPickScore(edge: number | null, oddsTaken: number | null) {
  const confidenceScore = edge === null ? null : Math.min(Math.abs(edge) * 20, 100);
  return getNbaTeamTopPickScore({
    marketType: "spread",
    edge,
    confidenceScore,
    oddsTaken,
  });
}

function deriveProjectedScores(projectedHomeSpread: number | null, marketTotal: number | null) {
  if (projectedHomeSpread === null || marketTotal === null) {
    return {
      projectedHomeScore: null,
      projectedAwayScore: null,
    };
  }

  // sportsbook spread sign: home -6.5 means home expected margin is +6.5
  const projectedHomeMargin = -projectedHomeSpread;

  const projectedHomeScore = Number(((marketTotal + projectedHomeMargin) / 2).toFixed(1));
  const projectedAwayScore = Number(((marketTotal - projectedHomeMargin) / 2).toFixed(1));

  return {
    projectedHomeScore,
    projectedAwayScore,
  };
}

function buildAdjustedTeamContext(params: {
  teamName: string;
  base: { offRating: number; defRating: number; restDays: number; injuryAdjustment: number } | undefined;
  learningProfile?: NbaLearningProfile | null;
  injuryAdjustments?: Record<string, ReturnType<typeof buildNbaTeamInjuryAdjustments>[string]>;
}) {
  const { teamName, base, learningProfile, injuryAdjustments } = params;
  if (!base) return undefined;

  const learningAdjustment = learningProfile?.teams?.[teamName];
  const injuryAdjustment = injuryAdjustments?.[teamName];

  const adjusted = {
    ...base,
    offRating:
      base.offRating +
      (learningAdjustment?.offenseDelta ?? 0) -
      (injuryAdjustment?.offensePenalty ?? 0),
    defRating:
      base.defRating -
      (learningAdjustment?.defenseDelta ?? 0) +
      (injuryAdjustment?.defensePenalty ?? 0),
  };

  return adjusted;
}

export function evaluateTeamGames(
  games: any[],
  options?: {
    learningProfile?: NbaLearningProfile | null;
    injuryRows?: NbaInjuryReportRow[] | null;
  }
) {
  const injuryAdjustments = buildNbaTeamInjuryAdjustments(options?.injuryRows);
  return (games ?? []).map((game: any) => {
    const book = game.bookmakers?.[0];
    const spreads = book?.markets?.find((m: any) => m.key === "spreads");
    const totals = book?.markets?.find((m: any) => m.key === "totals");
    const moneyline = book?.markets?.find((m: any) => m.key === "h2h");

    const home = buildAdjustedTeamContext({
      teamName: game.home_team,
      base: teamRatings[game.home_team],
      learningProfile: options?.learningProfile,
      injuryAdjustments,
    });
    const away = buildAdjustedTeamContext({
      teamName: game.away_team,
      base: teamRatings[game.away_team],
      learningProfile: options?.learningProfile,
      injuryAdjustments,
    });
    const contextRisk = buildNbaGameContextRisk({
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      injuryRows: options?.injuryRows ?? null,
    });

    const rawProjectedHomeSpread =
      home && away
        ? projectHomeSpread(
            { ...home, homeCourt: 2.5 },
            { ...away, homeCourt: 0 }
          )
        : null;
    const matchupAdjustment =
      options?.learningProfile?.matchupAdjustments?.[buildMatchupPairKey(game.home_team, game.away_team)] ?? null;
    const matchupHomeMarginDelta = matchupAdjustment?.homeTeamBias?.[game.home_team]?.marginDelta ?? 0;
    const projectedHomeSpread =
      rawProjectedHomeSpread === null || rawProjectedHomeSpread === undefined
        ? null
        : Number(
            (
              rawProjectedHomeSpread -
              (options?.learningProfile?.globalHomeBiasPoints ?? 0) -
              matchupHomeMarginDelta
            ).toFixed(1)
          );
    const projectedHomeMargin =
      projectedHomeSpread === null || projectedHomeSpread === undefined
        ? null
        : Number((-projectedHomeSpread).toFixed(1));
    const rawProjectedTotal = projectTotalPoints(home, away);
    const projectedTotal =
      rawProjectedTotal === null || rawProjectedTotal === undefined
        ? null
        : Number(
            (
              rawProjectedTotal +
              (options?.learningProfile?.globalTotalBiasPoints ?? 0) +
              (matchupAdjustment?.totalDelta ?? 0)
            ).toFixed(1)
          );

    const homeOutcome = spreads?.outcomes?.find((o: any) => o.name === game.home_team);
    const awayOutcome = spreads?.outcomes?.find((o: any) => o.name === game.away_team);
    const homeMoneylineOutcome = moneyline?.outcomes?.find((o: any) => o.name === game.home_team);
    const awayMoneylineOutcome = moneyline?.outcomes?.find((o: any) => o.name === game.away_team);

    const overOutcome = totals?.outcomes?.find((o: any) => o.name === "Over");
    const underOutcome = totals?.outcomes?.find((o: any) => o.name === "Under");
    const marketTotal = overOutcome?.point ?? totals?.outcomes?.[0]?.point ?? null;

    const marketHomeSpread = homeOutcome?.point;
    const homeSpreadPrice = homeOutcome?.price ?? null;
    const awaySpreadPrice = awayOutcome?.price ?? null;
    const awaySpreadPoint = awayOutcome?.point ?? null;
    const marketHomeMoneyline = homeMoneylineOutcome?.price ?? null;
    const marketAwayMoneyline = awayMoneylineOutcome?.price ?? null;
    const overPrice = overOutcome?.price ?? null;
    const underPrice = underOutcome?.price ?? null;

    const spreadEdge =
      projectedHomeSpread !== null && marketHomeSpread !== undefined
        ? Number((marketHomeSpread - projectedHomeSpread).toFixed(1))
        : null;

    const signal = getEdgeLabel(spreadEdge);
    const isHomeValue = signal === "Home value";

    const officialSide =
      signal === "Pass"
        ? null
        : isHomeValue
        ? `${game.home_team} ${marketHomeSpread}`
        : `${game.away_team} ${awaySpreadPoint}`;

    const officialLine =
      signal === "Pass" ? null : isHomeValue ? marketHomeSpread : awaySpreadPoint;

    const officialOdds =
      signal === "Pass" ? null : isHomeValue ? homeSpreadPrice : awaySpreadPrice;

    const confidenceScore =
      spreadEdge === null ? null : Math.min(Number((Math.abs(spreadEdge) * 12).toFixed(1)), 88);
    const topPickScore = getTopPickScore(spreadEdge, officialOdds);

    const { projectedHomeScore, projectedAwayScore } = deriveProjectedScores(
      projectedHomeSpread,
      projectedTotal
    );
    const projectedWinner =
      projectedHomeMargin === null ? null : projectedHomeMargin >= 0 ? "home" : "away";
    const homeWinProb = projectedHomeWinProbFromMargin(projectedHomeMargin);
    const awayWinProb =
      homeWinProb === null ? null : Number((100 - homeWinProb).toFixed(1));
    const marketHomeWinProb =
      marketHomeMoneyline === null ? null : americanToImpliedProb(marketHomeMoneyline);
    const rawMoneylineEdgePercent =
      homeWinProb === null || marketHomeWinProb === null
        ? null
        : Number((homeWinProb - marketHomeWinProb).toFixed(1));
    const moneylineEdgePercent = capNbaMoneylineEdge(rawMoneylineEdgePercent);
    const moneylineSignal = getMoneylineLabel(moneylineEdgePercent, projectedWinner);
    const moneylineSide =
      moneylineSignal === "Pass"
        ? "Pass"
        : moneylineSignal.startsWith("Home")
          ? `${game.home_team} ML`
          : `${game.away_team} ML`;
    const moneylineOdds =
      moneylineSignal === "Pass"
        ? null
        : moneylineSignal.startsWith("Home")
          ? marketHomeMoneyline
          : marketAwayMoneyline;
    const moneylineConfidenceScore =
      moneylineEdgePercent === null || projectedHomeMargin === null
        ? null
        : Math.min(
            90,
            Number((Math.abs(moneylineEdgePercent) * 10 + Math.abs(projectedHomeMargin) * 2.5).toFixed(1))
          );
    const totalEdge =
      projectedTotal === null || marketTotal === null
        ? null
        : Number((projectedTotal - marketTotal).toFixed(1));
    const totalSignal = getTotalLabel(totalEdge);
    const totalSide =
      totalSignal === "Pass"
        ? "Pass"
        : totalSignal.startsWith("Over")
          ? `Over ${marketTotal}`
          : `Under ${marketTotal}`;
    const totalOdds =
      totalSignal === "Pass"
        ? null
        : totalSignal.startsWith("Over")
          ? overPrice
          : underPrice;
    const totalConfidenceScore =
      totalEdge === null ? null : Math.min(86, Number((Math.abs(totalEdge) * 18).toFixed(1)));

    return {
      game,
      spreads,
      totals,
      moneyline,
      marketTotal,
      projectedHomeSpread,
      projectedHomeMargin,
      projectedTotal,
      projectedHomeScore,
      projectedAwayScore,
      marketHomeSpread,
      marketHomeMoneyline,
      marketAwayMoneyline,
      homeSpreadPrice,
      awaySpreadPrice,
      awaySpreadPoint,
      spreadEdge,
      signal,
      officialSide,
      officialLine,
      officialOdds,
      confidenceScore,
      topPickScore,
      projectedWinner,
      homeWinProb,
      awayWinProb,
      fairHomeMoneyline: homeWinProb === null ? null : probabilityToAmerican(homeWinProb),
      fairAwayMoneyline: awayWinProb === null ? null : probabilityToAmerican(awayWinProb),
      moneylineEdgePercent,
      moneylineSignal,
      moneylineSide,
      moneylineOdds,
      moneylineConfidenceScore,
      totalEdge,
      totalSignal,
      totalSide,
      totalOdds,
      totalConfidenceScore,
      overPrice,
      underPrice,
      contextRiskScore: contextRisk.score,
      contextRiskNotes: contextRisk.notes,
      regulationModelNote: "NBA score and total projections are regulation baseline; OT is handled in postgame learning review.",
    };
  });
}
