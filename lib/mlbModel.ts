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
  spreads?: OddsMarket;
  totals?: OddsMarket;
  moneyline?: OddsMarket;
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

export function evaluateMlbGames(
  games: MlbOddsGame[],
  ratings: Record<string, MlbTeamProfile>,
  parkFactors: Record<string, number>
) {
  return (games ?? []).map((game): EvaluatedMlbGame => {
    const book = game.bookmakers?.[0];
    const spreads = book?.markets?.find((market) => market.key === "spreads");
    const totals = book?.markets?.find((market) => market.key === "totals");
    const moneyline = book?.markets?.find((market) => market.key === "h2h");

    const homeTeam = ratings[game.home_team] ?? null;
    const awayTeam = ratings[game.away_team] ?? null;

    if (!homeTeam || !awayTeam) {
      return {
        game,
        spreads,
        totals,
        moneyline,
        missingModel: true,
      };
    }

    const projection = projectMlbGame({
      homeTeam: { name: game.home_team, ...homeTeam },
      awayTeam: { name: game.away_team, ...awayTeam },
      parkFactor: parkFactors[game.home_team] ?? 1,
    });

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
    const moneylineEdgePercent =
      marketHomeWinProb === null
        ? null
        : Number(((projection.homeWinProb - marketHomeWinProb) * 100).toFixed(1));

    const runLineEdge =
      marketHomeRunLine === null
        ? null
        : Number((projection.projectedMargin + marketHomeRunLine).toFixed(1));

    const totalEdge =
      marketTotal === null
        ? null
        : Number((projection.projectedTotal - marketTotal).toFixed(1));

    return {
      game,
      spreads,
      totals,
      moneyline,
      ...projection,
      marketHomeMoneyline,
      marketAwayMoneyline,
      marketHomeRunLine,
      marketAwayRunLine,
      homeRunLinePrice: homeRunLine?.price ?? null,
      awayRunLinePrice: awayRunLine?.price ?? null,
      marketTotal,
      overPrice: overOutcome?.price ?? null,
      underPrice: underOutcome?.price ?? null,
      moneylineEdgePercent,
      runLineEdge,
      totalEdge,
      moneylineSignal: getMoneylineLabel(moneylineEdgePercent),
      runLineSignal: getRunLineLabel(runLineEdge),
      totalSignal: getTotalLabel(totalEdge),
    };
  });
}
