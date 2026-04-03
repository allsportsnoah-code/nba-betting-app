import { projectHomeSpread } from "@/lib/projections";

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

export function getEdgeLabel(edge: number | null) {
  if (edge === null) return "No model";
  if (edge >= 1.5) return "Home value";
  if (edge <= -1.5) return "Away value";
  return "Pass";
}

export function getTopPickScore(edge: number | null, oddsTaken: number | null) {
  if (edge === null || oddsTaken === null) return 0;

  const edgeScore = Math.abs(edge) * 18;

  let payoutFit = 0;
  if (oddsTaken >= -130 && oddsTaken <= +110) payoutFit = 20;
  else if (oddsTaken >= -150 && oddsTaken <= +130) payoutFit = 14;
  else payoutFit = 8;

  const hitProbFit = 100 - Math.abs(americanToImpliedProb(oddsTaken) - 54);

  return Number((edgeScore + payoutFit + hitProbFit * 0.2).toFixed(1));
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

export function evaluateTeamGames(games: any[]) {
  return (games ?? []).map((game: any) => {
    const book = game.bookmakers?.[0];
    const spreads = book?.markets?.find((m: any) => m.key === "spreads");
    const totals = book?.markets?.find((m: any) => m.key === "totals");
    const moneyline = book?.markets?.find((m: any) => m.key === "h2h");

    const home = teamRatings[game.home_team];
    const away = teamRatings[game.away_team];

    const projectedHomeSpread =
      home && away
        ? projectHomeSpread(
            { ...home, homeCourt: 2.5 },
            { ...away, homeCourt: 0 }
          )
        : null;

    const homeOutcome = spreads?.outcomes?.find((o: any) => o.name === game.home_team);
    const awayOutcome = spreads?.outcomes?.find((o: any) => o.name === game.away_team);

    const overOutcome = totals?.outcomes?.find((o: any) => o.name === "Over");
    const marketTotal = overOutcome?.point ?? totals?.outcomes?.[0]?.point ?? null;

    const marketHomeSpread = homeOutcome?.point;
    const homeSpreadPrice = homeOutcome?.price ?? null;
    const awaySpreadPrice = awayOutcome?.price ?? null;
    const awaySpreadPoint = awayOutcome?.point ?? null;

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

    const topPickScore = getTopPickScore(spreadEdge, officialOdds);

    const { projectedHomeScore, projectedAwayScore } = deriveProjectedScores(
      projectedHomeSpread,
      marketTotal
    );

    return {
      game,
      spreads,
      totals,
      moneyline,
      marketTotal,
      projectedHomeSpread,
      projectedHomeScore,
      projectedAwayScore,
      marketHomeSpread,
      homeSpreadPrice,
      awaySpreadPrice,
      awaySpreadPoint,
      spreadEdge,
      signal,
      officialSide,
      officialLine,
      officialOdds,
      confidenceScore: spreadEdge === null ? null : Math.min(Math.abs(spreadEdge) * 20, 100),
      topPickScore,
    };
  });
}