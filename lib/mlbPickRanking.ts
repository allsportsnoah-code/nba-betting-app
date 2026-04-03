import type { EvaluatedMlbGame } from "@/lib/mlbModel";
import { americanToImpliedProb } from "@/lib/mlbModel";
import { americanToProfitPerUnit } from "@/lib/units";
import { getConfidenceStars } from "@/lib/starRatings";

export type MlbCandidate = {
  game: EvaluatedMlbGame["game"];
  marketType: "moneyline" | "spread" | "total";
  side: string;
  lineTaken: number | null;
  oddsTaken: number;
  projectedLine: number | null;
  marketLine: number | null;
  edge: number;
  edgeLabel: string;
  confidenceScore: number;
  projectedHomeScore: number;
  projectedAwayScore: number;
  topPickScore: number;
  selectedImpliedProb: number;
  payoutPerUnit: number;
};

export function labelForGame(game: EvaluatedMlbGame["game"]) {
  return `${game.away_team} @ ${game.home_team}`;
}

export function candidateKey(candidate: MlbCandidate) {
  return `${labelForGame(candidate.game)}::${candidate.marketType}`;
}

function buildTopPickScore(candidate: {
  marketType: "moneyline" | "spread" | "total";
  confidenceScore: number;
  selectedImpliedProb: number;
  payoutPerUnit: number;
  oddsTaken: number;
}) {
  const marketStabilityBonus =
    candidate.marketType === "spread" ? 16 : candidate.marketType === "total" ? 8 : 0;
  const favoriteBonus =
    candidate.oddsTaken < 0 ? Math.min(Math.abs(candidate.oddsTaken) / 20, 14) : 0;
  const plusMoneyPenalty =
    candidate.payoutPerUnit > 0.95 ? Math.min((candidate.payoutPerUnit - 0.95) * 22, 18) : 0;

  return Number(
    (
      candidate.confidenceScore * 1.2 +
      candidate.selectedImpliedProb * 140 +
      marketStabilityBonus +
      favoriteBonus -
      plusMoneyPenalty
    ).toFixed(1)
  );
}

export function buildMlbCandidates(games: EvaluatedMlbGame[], now: Date) {
  const candidates: MlbCandidate[] = [];

  for (const game of games) {
    if (game.missingModel) continue;
    if (new Date(game.game.commence_time) <= now) continue;
    if (game.projectedHomeRuns === undefined || game.projectedAwayRuns === undefined) continue;

    if (game.marketHomeMoneyline !== null && game.marketAwayMoneyline !== null) {
      const homeEdge = game.moneylineEdgePercent ?? 0;
      const takeHome = homeEdge >= 0;
      const oddsTaken = takeHome ? game.marketHomeMoneyline : game.marketAwayMoneyline;
      const confidenceScore =
        getConfidenceStars({
          sport: "MLB",
          marketType: "moneyline",
          edge: homeEdge,
        }) * 20;
      const selectedImpliedProb = americanToImpliedProb(oddsTaken);
      const payoutPerUnit = americanToProfitPerUnit(oddsTaken);

      candidates.push({
        game: game.game,
        marketType: "moneyline",
        side: takeHome ? game.game.home_team : game.game.away_team,
        lineTaken: null,
        oddsTaken,
        projectedLine: takeHome ? game.fairHomeMoneyline ?? null : game.fairAwayMoneyline ?? null,
        marketLine: oddsTaken,
        edge: Math.abs(homeEdge),
        edgeLabel:
          game.moneylineSignal === "Pass"
            ? takeHome
              ? "Home moneyline lean"
              : "Away moneyline lean"
            : game.moneylineSignal ?? "Moneyline lean",
        confidenceScore,
        projectedHomeScore: game.projectedHomeRuns,
        projectedAwayScore: game.projectedAwayRuns,
        selectedImpliedProb,
        payoutPerUnit,
        topPickScore: buildTopPickScore({
          marketType: "moneyline",
          confidenceScore,
          selectedImpliedProb,
          payoutPerUnit,
          oddsTaken,
        }),
      });
    }

    if (
      game.marketHomeRunLine !== null &&
      game.marketAwayRunLine !== null &&
      game.homeRunLinePrice !== null &&
      game.awayRunLinePrice !== null &&
      game.projectedMargin !== undefined
    ) {
      const homeRunLineEdge = game.runLineEdge ?? 0;
      const takeHome = homeRunLineEdge >= 0;
      const oddsTaken = takeHome ? game.homeRunLinePrice : game.awayRunLinePrice;
      const confidenceScore =
        getConfidenceStars({
          sport: "MLB",
          marketType: "spread",
          edge: homeRunLineEdge,
        }) * 20;
      const selectedImpliedProb = americanToImpliedProb(oddsTaken);
      const payoutPerUnit = americanToProfitPerUnit(oddsTaken);

      candidates.push({
        game: game.game,
        marketType: "spread",
        side: `${takeHome ? game.game.home_team : game.game.away_team} ${
          takeHome ? game.marketHomeRunLine : game.marketAwayRunLine
        }`,
        lineTaken: takeHome ? game.marketHomeRunLine : game.marketAwayRunLine,
        oddsTaken,
        projectedLine: game.projectedMargin,
        marketLine: takeHome ? game.marketHomeRunLine : game.marketAwayRunLine,
        edge: Math.abs(homeRunLineEdge),
        edgeLabel:
          game.runLineSignal === "Pass"
            ? takeHome
              ? "Home run line lean"
              : "Away run line lean"
            : game.runLineSignal ?? "Run line lean",
        confidenceScore,
        projectedHomeScore: game.projectedHomeRuns,
        projectedAwayScore: game.projectedAwayRuns,
        selectedImpliedProb,
        payoutPerUnit,
        topPickScore: buildTopPickScore({
          marketType: "spread",
          confidenceScore,
          selectedImpliedProb,
          payoutPerUnit,
          oddsTaken,
        }),
      });
    }

    if (
      game.marketTotal !== null &&
      game.overPrice !== null &&
      game.underPrice !== null &&
      game.projectedTotal !== undefined
    ) {
      const totalEdge = game.totalEdge ?? 0;
      const takeOver = totalEdge >= 0;
      const oddsTaken = takeOver ? game.overPrice : game.underPrice;
      const confidenceScore =
        getConfidenceStars({
          sport: "MLB",
          marketType: "total",
          edge: totalEdge,
        }) * 20;
      const selectedImpliedProb = americanToImpliedProb(oddsTaken);
      const payoutPerUnit = americanToProfitPerUnit(oddsTaken);

      candidates.push({
        game: game.game,
        marketType: "total",
        side: `${takeOver ? "Over" : "Under"} ${game.marketTotal}`,
        lineTaken: game.marketTotal,
        oddsTaken,
        projectedLine: game.projectedTotal,
        marketLine: game.marketTotal,
        edge: Math.abs(totalEdge),
        edgeLabel:
          game.totalSignal === "Pass"
            ? takeOver
              ? "Over lean"
              : "Under lean"
            : game.totalSignal ?? "Total lean",
        confidenceScore,
        projectedHomeScore: game.projectedHomeRuns,
        projectedAwayScore: game.projectedAwayRuns,
        selectedImpliedProb,
        payoutPerUnit,
        topPickScore: buildTopPickScore({
          marketType: "total",
          confidenceScore,
          selectedImpliedProb,
          payoutPerUnit,
          oddsTaken,
        }),
      });
    }
  }

  return candidates;
}

export function rankTopHitRateCandidates(candidates: MlbCandidate[]) {
  return [...candidates].sort((a, b) => {
    if (b.topPickScore !== a.topPickScore) return b.topPickScore - a.topPickScore;
    if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
    if (b.selectedImpliedProb !== a.selectedImpliedProb) {
      return b.selectedImpliedProb - a.selectedImpliedProb;
    }
    return b.edge - a.edge;
  });
}

export function rankBestValueCandidates(candidates: MlbCandidate[]) {
  return [...candidates].sort((a, b) => {
    if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
    if (b.edge !== a.edge) return b.edge - a.edge;
    return b.payoutPerUnit - a.payoutPerUnit;
  });
}
