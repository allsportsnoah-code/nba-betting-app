import type { MlbGameContext, MlbStarterContext } from "@/lib/mlbContext";
import type { MlbLearningProfile } from "@/lib/mlbLearning";

export type MlbTeamProfile = {
  name: string;
  offenseVsRhp: number;
  offenseVsLhp: number;
  bullpen: number;
  startingPitching?: number;
};

export type MlbStarterProfile = {
  name: string;
  hand: "R" | "L";
  rating: number;
  confirmed?: boolean;
  statsSummary?: string;
};

export type MlbGameInput = {
  homeTeam: MlbTeamProfile;
  awayTeam: MlbTeamProfile;
  homeStarter?: MlbStarterProfile;
  awayStarter?: MlbStarterProfile;
  parkFactor: number;
  homeFieldRuns?: number;
};

export type MlbProjection = {
  projectedHomeRuns: number;
  projectedAwayRuns: number;
  projectedTotal: number;
  projectedMargin: number;
  projectedWinner: string;
  homeWinProb: number;
  awayWinProb: number;
  fairHomeMoneyline: number;
  fairAwayMoneyline: number;
};

type OddsOutcome = {
  name: string;
  description?: string | null;
  price?: number | null;
  point?: number | null;
};

type OddsMarket = {
  key: string;
  outcomes?: OddsOutcome[];
};

type OddsBookmaker = {
  markets?: OddsMarket[];
};

export type MlbOddsGame = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: OddsBookmaker[];
};

export type EvaluatedMlbGame = {
  game: MlbOddsGame;
  context?: MlbGameContext | null;
  spreads?: OddsMarket;
  totals?: OddsMarket;
  moneyline?: OddsMarket;
  teamTotals?: OddsMarket;
  firstFiveMoneyline?: OddsMarket;
  firstFiveSpreads?: OddsMarket;
  firstFiveTotals?: OddsMarket;
  missingModel?: boolean;
  projectedHomeRuns?: number;
  projectedAwayRuns?: number;
  projectedTotal?: number;
  projectedMargin?: number;
  projectedWinner?: string;
  homeWinProb?: number;
  awayWinProb?: number;
  fairHomeMoneyline?: number;
  fairAwayMoneyline?: number;
  marketHomeMoneyline?: number | null;
  marketAwayMoneyline?: number | null;
  marketHomeRunLine?: number | null;
  marketAwayRunLine?: number | null;
  homeRunLinePrice?: number | null;
  awayRunLinePrice?: number | null;
  marketTotal?: number | null;
  overPrice?: number | null;
  underPrice?: number | null;
  moneylineEdgePercent?: number | null;
  runLineEdge?: number | null;
  totalEdge?: number | null;
  moneylineSignal?: string;
  runLineSignal?: string;
  totalSignal?: string;
  homeAdjustmentNote?: string;
  awayAdjustmentNote?: string;
  weatherNote?: string | null;
  contextRiskScore?: number;
  contextRiskNotes?: string[];
};

function round1(value: number) {
  return Number(value.toFixed(1));
}

function getOffenseSplit(team: MlbTeamProfile, opposingHand: "R" | "L") {
  return opposingHand === "R" ? team.offenseVsRhp : team.offenseVsLhp;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function americanToImpliedProb(american: number) {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

export function probabilityToAmerican(probability: number) {
  const p = clamp(probability, 0.01, 0.99);
  if (p >= 0.5) {
    return Math.round((-100 * p) / (1 - p));
  }
  return Math.round((100 * (1 - p)) / p);
}

function winProbabilityFromRuns(homeRuns: number, awayRuns: number) {
  const homePower = Math.pow(Math.max(homeRuns, 0.1), 1.83);
  const awayPower = Math.pow(Math.max(awayRuns, 0.1), 1.83);
  return homePower / (homePower + awayPower);
}

export function projectMlbGame(input: MlbGameInput): MlbProjection {
  const homeFieldRuns = input.homeFieldRuns ?? 0.15;
  const awayPitcherHand = input.awayStarter?.hand ?? "R";
  const homePitcherHand = input.homeStarter?.hand ?? "R";
  const awayPitcherRating = input.awayStarter?.rating ?? input.awayTeam.startingPitching ?? 100;
  const homePitcherRating = input.homeStarter?.rating ?? input.homeTeam.startingPitching ?? 100;

  const homeOffense = getOffenseSplit(input.homeTeam, awayPitcherHand);
  const awayOffense = getOffenseSplit(input.awayTeam, homePitcherHand);

  // Simple first-pass MLB scoring model:
  // 4.4 is a rough average run environment baseline.
  // Better offense increases runs.
  // Better opposing starter/bullpen decreases runs.
  // Park factor nudges scoring up/down.
  const projectedHomeRunsRaw =
    4.4 +
    (homeOffense - 100) * 0.03 -
    (awayPitcherRating - 100) * 0.025 -
    (input.awayTeam.bullpen - 100) * 0.015 +
    (input.parkFactor - 1) * 1.2 +
    homeFieldRuns;

  const projectedAwayRunsRaw =
    4.4 +
    (awayOffense - 100) * 0.03 -
    (homePitcherRating - 100) * 0.025 -
    (input.homeTeam.bullpen - 100) * 0.015 +
    (input.parkFactor - 1) * 1.2;

  const projectedHomeRuns = Math.max(2, round1(projectedHomeRunsRaw));
  const projectedAwayRuns = Math.max(2, round1(projectedAwayRunsRaw));
  const projectedTotal = round1(projectedHomeRuns + projectedAwayRuns);
  const projectedMargin = round1(projectedHomeRuns - projectedAwayRuns);
  const homeWinProb = winProbabilityFromRuns(projectedHomeRuns, projectedAwayRuns);
  const awayWinProb = 1 - homeWinProb;

  return {
    projectedHomeRuns,
    projectedAwayRuns,
    projectedTotal,
    projectedMargin,
    projectedWinner:
      projectedHomeRuns >= projectedAwayRuns ? input.homeTeam.name : input.awayTeam.name,
    homeWinProb,
    awayWinProb,
    fairHomeMoneyline: probabilityToAmerican(homeWinProb),
    fairAwayMoneyline: probabilityToAmerican(awayWinProb),
  };
}

function getRunLineLabel(edge: number | null) {
  if (edge === null) return "No model";
  if (edge >= 0.35) return "Home run line value";
  if (edge <= -0.35) return "Away run line value";
  return "Pass";
}

function getTotalLabel(edge: number | null) {
  if (edge === null) return "No model";
  if (edge >= 0.4) return "Over value";
  if (edge <= -0.4) return "Under value";
  return "Pass";
}

function getMoneylineLabel(edgePercent: number | null) {
  if (edgePercent === null) return "No model";
  if (edgePercent >= 3) return "Home moneyline value";
  if (edgePercent <= -3) return "Away moneyline value";
  return "Pass";
}

function getProjectionAlignedMoneylineLabel(
  edgePercent: number | null,
  projectedWinner: string | null | undefined,
  homeTeam: string,
  awayTeam: string
) {
  const rawLabel = getMoneylineLabel(edgePercent);
  if (rawLabel !== "Home moneyline value" && rawLabel !== "Away moneyline value") {
    return rawLabel;
  }

  if (rawLabel === "Home moneyline value") {
    return projectedWinner === homeTeam ? rawLabel : "Pass";
  }

  return projectedWinner === awayTeam ? rawLabel : "Pass";
}

function starterFromContext(starter: MlbStarterContext | null | undefined): MlbStarterProfile | undefined {
  if (!starter) return undefined;

  return {
    name: starter.name,
    hand: starter.hand,
    rating: starter.rating,
    confirmed: starter.confirmed,
    statsSummary: starter.statsSummary,
  };
}

function buildLearningNote(adjustment: {
  offenseRuns?: number;
  defenseRuns?: number;
  homeFieldRuns?: number;
  sampleSize?: number;
} | null | undefined) {
  if (!adjustment || !adjustment.sampleSize) return undefined;

  const parts: string[] = [];
  if (adjustment.offenseRuns && Math.abs(adjustment.offenseRuns) >= 0.08) {
    parts.push(`${adjustment.offenseRuns > 0 ? "+" : ""}${adjustment.offenseRuns.toFixed(2)} off`);
  }
  if (adjustment.defenseRuns && Math.abs(adjustment.defenseRuns) >= 0.08) {
    parts.push(`${adjustment.defenseRuns > 0 ? "+" : ""}${adjustment.defenseRuns.toFixed(2)} def`);
  }
  if (adjustment.homeFieldRuns && Math.abs(adjustment.homeFieldRuns) >= 0.05) {
    parts.push(`${adjustment.homeFieldRuns > 0 ? "+" : ""}${adjustment.homeFieldRuns.toFixed(2)} home`);
  }

  if (parts.length === 0) return undefined;
  return `${parts.join(" | ")} (${adjustment.sampleSize} samples)`;
}

export function evaluateMlbGames(
  games: MlbOddsGame[],
  ratings: Record<string, Omit<MlbTeamProfile, "name">>,
  parkFactors: Record<string, number>,
  contextMap?: Record<string, MlbGameContext>,
  learningProfile?: MlbLearningProfile
) {
  return (games ?? []).map((game): EvaluatedMlbGame => {
    const book = game.bookmakers?.[0];
    const spreads = book?.markets?.find((market) => market.key === "spreads");
    const totals = book?.markets?.find((market) => market.key === "totals");
    const moneyline = book?.markets?.find((market) => market.key === "h2h");
    const teamTotals = book?.markets?.find((market) => market.key === "team_totals");
    const firstFiveMoneyline = book?.markets?.find((market) => market.key === "h2h_1st_5_innings");
    const firstFiveSpreads = book?.markets?.find((market) => market.key === "spreads_1st_5_innings");
    const firstFiveTotals = book?.markets?.find((market) => market.key === "totals_1st_5_innings");

    const homeTeam = ratings[game.home_team] ?? null;
    const awayTeam = ratings[game.away_team] ?? null;

    if (!homeTeam || !awayTeam) {
      return {
        game,
        context: null,
        spreads,
        totals,
        moneyline,
        teamTotals,
        firstFiveMoneyline,
        firstFiveSpreads,
        firstFiveTotals,
        missingModel: true,
      };
    }

    const context = contextMap?.[`${game.away_team} @ ${game.home_team}`] ?? null;
    const homeLearning = learningProfile?.teams?.[game.home_team];
    const awayLearning = learningProfile?.teams?.[game.away_team];
    const globalTotalBias = learningProfile?.globalTotalBiasRuns ?? 0;
    const globalHomeBias = learningProfile?.globalHomeFieldBiasRuns ?? 0;

    const adjustedHomeTeam = {
      ...homeTeam,
      offenseVsRhp: homeTeam.offenseVsRhp + (homeLearning?.offenseRuns ?? 0) * 8,
      offenseVsLhp: homeTeam.offenseVsLhp + (homeLearning?.offenseRuns ?? 0) * 8,
      bullpen: homeTeam.bullpen + (homeLearning?.defenseRuns ?? 0) * 7,
    };

    const adjustedAwayTeam = {
      ...awayTeam,
      offenseVsRhp: awayTeam.offenseVsRhp + (awayLearning?.offenseRuns ?? 0) * 8,
      offenseVsLhp: awayTeam.offenseVsLhp + (awayLearning?.offenseRuns ?? 0) * 8,
      bullpen: awayTeam.bullpen + (awayLearning?.defenseRuns ?? 0) * 7,
    };

    const projection = projectMlbGame({
      homeTeam: { name: game.home_team, ...adjustedHomeTeam },
      awayTeam: { name: game.away_team, ...adjustedAwayTeam },
      homeStarter: starterFromContext(context?.homeStarter),
      awayStarter: starterFromContext(context?.awayStarter),
      parkFactor: parkFactors[game.home_team] ?? 1,
      homeFieldRuns:
        0.15 +
        (homeLearning?.homeFieldRuns ?? 0) +
        globalHomeBias -
        (context?.homeInjuryImpact ?? 0) * 0.35 +
        (context?.awayInjuryImpact ?? 0) * 0.15,
    });

    const adjustedProjection = {
      ...projection,
      projectedHomeRuns: Number(
        Math.max(
          2,
          projection.projectedHomeRuns -
            (context?.homeInjuryImpact ?? 0) +
            (awayLearning?.defenseRuns ?? 0) * -0.15 +
            (homeLearning?.totalBiasRuns ?? 0) * 0.5 +
            globalTotalBias * 0.5
        ).toFixed(1)
      ),
      projectedAwayRuns: Number(
        Math.max(
          2,
          projection.projectedAwayRuns -
            (context?.awayInjuryImpact ?? 0) +
            (homeLearning?.defenseRuns ?? 0) * -0.15 +
            (awayLearning?.totalBiasRuns ?? 0) * 0.5 +
            globalTotalBias * 0.5
        ).toFixed(1)
      ),
    };

    adjustedProjection.projectedTotal = Number(
      (adjustedProjection.projectedHomeRuns + adjustedProjection.projectedAwayRuns).toFixed(1)
    );
    adjustedProjection.projectedMargin = Number(
      (adjustedProjection.projectedHomeRuns - adjustedProjection.projectedAwayRuns).toFixed(1)
    );
    adjustedProjection.homeWinProb = winProbabilityFromRuns(
      adjustedProjection.projectedHomeRuns,
      adjustedProjection.projectedAwayRuns
    );
    adjustedProjection.awayWinProb = 1 - adjustedProjection.homeWinProb;
    adjustedProjection.fairHomeMoneyline = probabilityToAmerican(adjustedProjection.homeWinProb);
    adjustedProjection.fairAwayMoneyline = probabilityToAmerican(adjustedProjection.awayWinProb);
    adjustedProjection.projectedWinner =
      adjustedProjection.projectedHomeRuns >= adjustedProjection.projectedAwayRuns
        ? game.home_team
        : game.away_team;

    const homeMoneyline = moneyline?.outcomes?.find((outcome) => outcome.name === game.home_team);
    const awayMoneyline = moneyline?.outcomes?.find((outcome) => outcome.name === game.away_team);
    const homeRunLine = spreads?.outcomes?.find((outcome) => outcome.name === game.home_team);
    const awayRunLine = spreads?.outcomes?.find((outcome) => outcome.name === game.away_team);
    const overOutcome = totals?.outcomes?.find((outcome) => outcome.name === "Over");
    const underOutcome = totals?.outcomes?.find((outcome) => outcome.name === "Under");

    const marketHomeMoneyline = homeMoneyline?.price ?? null;
    const marketAwayMoneyline = awayMoneyline?.price ?? null;
    const marketHomeRunLine = homeRunLine?.point ?? null;
    const marketAwayRunLine = awayRunLine?.point ?? null;
    const marketTotal = overOutcome?.point ?? underOutcome?.point ?? null;

    const marketHomeWinProb =
      marketHomeMoneyline === null ? null : americanToImpliedProb(marketHomeMoneyline);
    const adjustedMoneylineEdgePercent =
      marketHomeWinProb === null
        ? null
        : Number(((adjustedProjection.homeWinProb - marketHomeWinProb) * 100).toFixed(1));

    const adjustedRunLineEdge =
      marketHomeRunLine === null
        ? null
        : Number((adjustedProjection.projectedMargin + marketHomeRunLine).toFixed(1));

    const adjustedTotalEdge =
      marketTotal === null
        ? null
        : Number((adjustedProjection.projectedTotal - marketTotal).toFixed(1));

    return {
      game,
      context,
      spreads,
      totals,
      moneyline,
      teamTotals,
      firstFiveMoneyline,
      firstFiveSpreads,
      firstFiveTotals,
      ...adjustedProjection,
      marketHomeMoneyline,
      marketAwayMoneyline,
      marketHomeRunLine,
      marketAwayRunLine,
      homeRunLinePrice: homeRunLine?.price ?? null,
      awayRunLinePrice: awayRunLine?.price ?? null,
      marketTotal,
      overPrice: overOutcome?.price ?? null,
      underPrice: underOutcome?.price ?? null,
      moneylineEdgePercent: adjustedMoneylineEdgePercent,
      runLineEdge: adjustedRunLineEdge,
      totalEdge: adjustedTotalEdge,
      moneylineSignal: getProjectionAlignedMoneylineLabel(
        adjustedMoneylineEdgePercent,
        adjustedProjection.projectedWinner,
        game.home_team,
        game.away_team
      ),
      runLineSignal: getRunLineLabel(adjustedRunLineEdge),
      totalSignal: getTotalLabel(adjustedTotalEdge),
      homeAdjustmentNote: buildLearningNote(homeLearning),
      awayAdjustmentNote: buildLearningNote(awayLearning),
      weatherNote: context?.weather?.note ?? null,
      contextRiskScore: context?.contextRiskScore ?? 0,
      contextRiskNotes: context?.contextRiskNotes ?? [],
    };
  });
}
