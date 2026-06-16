import { getMlbDoubleheaderGameLabels, isMlbDoubleheaderGameLabel } from "@/lib/mlbDoubleheader";
import type { EvaluatedMlbGame } from "@/lib/mlbModel";
import { americanToImpliedProb } from "@/lib/mlbModel";
import type { MlbLearningProfile } from "@/lib/mlbLearning";
import { americanToProfitPerUnit } from "@/lib/units";
import { getConfidenceStars } from "@/lib/starRatings";

export type MlbTeamMarketType =
  | "moneyline"
  | "spread"
  | "total"
  | "team_total"
  | "f5_moneyline"
  | "f5_spread"
  | "f5_total";

export type MlbCandidate = {
  game: EvaluatedMlbGame["game"];
  marketType: MlbTeamMarketType;
  side: string;
  sideTeam: string | null;
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
  projectedSideMargin?: number | null;
  coverBuffer?: number | null;
  contextRiskScore?: number;
  contextRiskNotes?: string[];
  betRecommendation: "bet" | "lean" | "pass";
  reasonLabels: string[];
  riskFlags: string[];
};

export type SavedMlbTeamBoardRow = {
  id?: number;
  external_event_id?: string | null;
  game_label?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  market_type?: MlbTeamMarketType | null;
  side: string;
  line_taken?: number | null;
  odds_taken?: number | null;
  confidence_score?: number | null;
  projected_line?: number | null;
  market_line?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  projected_side_margin?: number | null;
  cover_buffer?: number | null;
  game_start_time?: string | null;
};

export function labelForGame(game: EvaluatedMlbGame["game"]) {
  return `${game.away_team} @ ${game.home_team}`;
}

export function candidateKey(candidate: MlbCandidate) {
  return `${labelForGame(candidate.game)}::${candidate.marketType}`;
}

export function savedMlbTeamBoardKey(row: Pick<SavedMlbTeamBoardRow, "game_label" | "market_type">) {
  return `${row.game_label ?? ""}::${row.market_type ?? ""}`;
}

function getSavedProjectedMargin(row: SavedMlbTeamBoardRow) {
  if (row.projected_home_score === null || row.projected_home_score === undefined) return null;
  if (row.projected_away_score === null || row.projected_away_score === undefined) return null;

  return Number(row.projected_home_score) - Number(row.projected_away_score);
}

function getSavedSideTeam(row: SavedMlbTeamBoardRow) {
  if (row.market_type === "total" || row.market_type === "f5_total") return null;

  if (row.market_type === "team_total") {
    if (row.home_team && row.side.includes(row.home_team)) return row.home_team;
    if (row.away_team && row.side.includes(row.away_team)) return row.away_team;
  }

  const normalizedSide = row.side.replace(/\s*[+-]?\d+(\.\d+)?$/, "").trim();
  if (row.home_team && normalizedSide === row.home_team) return row.home_team;
  if (row.away_team && normalizedSide === row.away_team) return row.away_team;

  return normalizedSide || null;
}

function getSavedProjectedSideMargin(row: SavedMlbTeamBoardRow) {
  if (row.projected_side_margin !== null && row.projected_side_margin !== undefined) {
    return Number(row.projected_side_margin);
  }

  const projectedMargin = getSavedProjectedMargin(row);
  if (projectedMargin === null) return null;

  const sideTeam = getSavedSideTeam(row);
  if (sideTeam && row.home_team && sideTeam === row.home_team) return projectedMargin;
  if (sideTeam && row.away_team && sideTeam === row.away_team) return projectedMargin * -1;

  return null;
}

function getSavedCoverBuffer(row: SavedMlbTeamBoardRow) {
  if (row.cover_buffer !== null && row.cover_buffer !== undefined) {
    return Number(row.cover_buffer);
  }

  if (
    row.market_type !== "spread" &&
    row.market_type !== "f5_spread" ||
    row.line_taken === null ||
    row.line_taken === undefined
  ) {
    return null;
  }

  const projectedSideMargin = getSavedProjectedSideMargin(row);
  if (projectedSideMargin === null) return null;

  return Number((projectedSideMargin + Number(row.line_taken)).toFixed(2));
}

function buildTopPickScore(
  candidate: {
    marketType: MlbTeamMarketType;
    confidenceScore: number;
    edge: number;
    selectedImpliedProb: number;
    payoutPerUnit: number;
    oddsTaken: number;
    lineTaken?: number | null;
    projectedSideMargin?: number | null;
    coverBuffer?: number | null;
    contextRiskScore?: number;
  },
  learningProfile?: MlbLearningProfile | null
) {
  const isSpreadMarket = candidate.marketType === "spread" || candidate.marketType === "f5_spread";
  const isTotalMarket =
    candidate.marketType === "total" ||
    candidate.marketType === "team_total" ||
    candidate.marketType === "f5_total";
  const isMoneylineMarket =
    candidate.marketType === "moneyline" || candidate.marketType === "f5_moneyline";
  const marketStabilityBonus =
    isSpreadMarket ? 10 : isTotalMarket ? 4 : 0;
  const favoriteBonus =
    candidate.oddsTaken < 0 ? Math.min(Math.abs(candidate.oddsTaken) / 20, 14) : 0;
  const plusMoneyPenalty =
    candidate.payoutPerUnit > 0.95 ? Math.min((candidate.payoutPerUnit - 0.95) * 22, 18) : 0;
  let supportAdjustment = 0;

  if (isSpreadMarket) {
    const coverBuffer = candidate.coverBuffer ?? 0;
    supportAdjustment += Math.min(Math.max(coverBuffer, 0), 2.2) * 14;

    if ((candidate.lineTaken ?? 0) > 0 && (candidate.projectedSideMargin ?? 0) < 0.4) {
      supportAdjustment += 10;
    }
  }

  if (isMoneylineMarket) {
    const projectedSideMargin = candidate.projectedSideMargin ?? 0;

    if (projectedSideMargin < 1.1) supportAdjustment -= 18;
    if (projectedSideMargin < 0.75) supportAdjustment -= 14;
    if (candidate.edge < 6.5) supportAdjustment -= 12;
    if (candidate.payoutPerUnit > 1.0) {
      supportAdjustment -= Math.min((candidate.payoutPerUnit - 1) * 20, 22);
    }
  }

  if (isTotalMarket) {
    if (candidate.edge < 1.4) supportAdjustment -= 14;
    if (candidate.edge < 1.15) supportAdjustment -= 12;
    if (candidate.selectedImpliedProb < 0.54) supportAdjustment -= 10;
    if (candidate.payoutPerUnit > 0.95) {
      supportAdjustment -= Math.min((candidate.payoutPerUnit - 0.95) * 14, 8);
    }
  }

  const marketPreferences = learningProfile?.marketPreferences;
  if (marketPreferences) {
    if (isMoneylineMarket) {
      supportAdjustment += marketPreferences.moneyline;
    } else if (isTotalMarket) {
      supportAdjustment += marketPreferences.total;
    } else if (isSpreadMarket) {
      supportAdjustment += marketPreferences.spread;

      if ((candidate.lineTaken ?? 0) > 0) {
        supportAdjustment += marketPreferences.plusRunLine;
      } else if ((candidate.lineTaken ?? 0) < 0) {
        supportAdjustment += marketPreferences.minusRunLine;
      }
    }
  }

  const topPickPreferences = learningProfile?.topPickPreferences;
  if (topPickPreferences) {
    if (isMoneylineMarket) {
      supportAdjustment += topPickPreferences.moneyline;
    } else if (isSpreadMarket) {
      supportAdjustment += topPickPreferences.spread;
    } else if (isTotalMarket) {
      supportAdjustment += topPickPreferences.total;
    }
  }

  const starRatingPreferences = learningProfile?.starRatingPreferences;
  if (starRatingPreferences) {
    if (candidate.confidenceScore >= 100) {
      supportAdjustment += starRatingPreferences.fiveStar;
    } else if (candidate.confidenceScore >= 80) {
      supportAdjustment += starRatingPreferences.fourStar;
    }
  }

  const lossReviewAdjustments = learningProfile?.lossReviewAdjustments;
  if (lossReviewAdjustments) {
    if (isSpreadMarket) {
      supportAdjustment -= lossReviewAdjustments.teamSpreadTopPickPenalty;
    } else if (isTotalMarket) {
      supportAdjustment -= lossReviewAdjustments.teamTotalTopPickPenalty;
    }
  }

  return Number(
    (
      candidate.confidenceScore * 1.2 +
      candidate.selectedImpliedProb * 140 +
      marketStabilityBonus +
      favoriteBonus -
      plusMoneyPenalty +
      supportAdjustment -
      (candidate.contextRiskScore ?? 0) * 0.65
    ).toFixed(1)
  );
}

function formatSigned(value: number) {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function isMoneylineMarketType(marketType: MlbTeamMarketType) {
  return marketType === "moneyline" || marketType === "f5_moneyline";
}

function isSpreadMarketType(marketType: MlbTeamMarketType) {
  return marketType === "spread" || marketType === "f5_spread";
}

function isTotalMarketType(marketType: MlbTeamMarketType) {
  return marketType === "total" || marketType === "team_total" || marketType === "f5_total";
}

function isCoreBoardMarketType(marketType: MlbTeamMarketType) {
  return marketType === "moneyline" || marketType === "spread" || marketType === "total";
}

function buildTeamBetProfile(candidate: Omit<MlbCandidate, "betRecommendation" | "reasonLabels" | "riskFlags">) {
  const reasonLabels: string[] = [];
  const riskFlags: string[] = [];
  const payout = candidate.payoutPerUnit;
  const edge = Math.abs(candidate.edge);
  const contextRiskScore = candidate.contextRiskScore ?? 0;

  if (payout >= 0.63) {
    reasonLabels.push(`pays ${payout.toFixed(2)}u+`);
  } else {
    riskFlags.push(`low payout ${payout.toFixed(2)}u`);
  }

  if (isMoneylineMarketType(candidate.marketType)) {
    const margin = candidate.projectedSideMargin ?? 0;

    if (margin >= 1.05) {
      reasonLabels.push(`model favors side by ${margin.toFixed(1)}`);
    } else if (margin >= 0.75) {
      reasonLabels.push(`model supports side by ${margin.toFixed(1)}`);
    } else if (margin >= 0.35) {
      riskFlags.push(`thin ML support ${margin.toFixed(1)}`);
    } else {
      riskFlags.push("projection barely supports ML side");
    }

    if (edge >= 7.5) reasonLabels.push(`${edge.toFixed(1)}% ML edge`);
    else if (edge < 3) riskFlags.push("small ML edge");
  }

  if (isSpreadMarketType(candidate.marketType)) {
    const buffer = candidate.coverBuffer ?? 0;

    if (buffer >= 1) {
      reasonLabels.push(`${formatSigned(buffer)} run cover buffer`);
    } else if (buffer >= 0.7) {
      reasonLabels.push(`${formatSigned(buffer)} run support`);
    } else if (buffer >= 0.35) {
      riskFlags.push(`thin run-line buffer ${formatSigned(buffer)}`);
    } else {
      riskFlags.push("run-line buffer too thin");
    }

    if (edge >= 1) reasonLabels.push(`${edge.toFixed(1)} run edge`);
    else if (edge < 0.6) riskFlags.push("small run-line edge");
  }

  if (isTotalMarketType(candidate.marketType)) {
    if (edge >= 1.25) reasonLabels.push(`${edge.toFixed(1)} run total edge`);
    else if (edge >= 0.8) reasonLabels.push(`${edge.toFixed(1)} run total lean`);
    else riskFlags.push("total edge too thin");
  }

  if (candidate.selectedImpliedProb >= 0.56) {
    reasonLabels.push(`${(candidate.selectedImpliedProb * 100).toFixed(0)}% implied hit profile`);
  } else if (candidate.selectedImpliedProb < 0.48) {
    riskFlags.push("plus-money longshot profile");
  }

  if (contextRiskScore >= 18) {
    riskFlags.push(`high context risk ${contextRiskScore}/40`);
  } else if (contextRiskScore >= 10) {
    riskFlags.push(`context watch ${contextRiskScore}/40`);
  }

  for (const note of candidate.contextRiskNotes ?? []) {
    riskFlags.push(note);
  }

  let betRecommendation: MlbCandidate["betRecommendation"] = "lean";
  const hasHardRisk =
    riskFlags.some((flag) =>
      flag.includes("too thin") ||
      flag.includes("barely") ||
      flag.includes("small") ||
      flag.includes("longshot") ||
      flag.includes("high context risk")
    );

  if (!hasHardRisk && candidate.confidenceScore >= 60 && payout >= 0.5) {
    betRecommendation = "bet";
  } else if (candidate.confidenceScore < 40 || hasHardRisk) {
    betRecommendation = "pass";
  }

  return {
    betRecommendation,
    reasonLabels,
    riskFlags,
  };
}

function withTeamBetProfile(candidate: Omit<MlbCandidate, "betRecommendation" | "reasonLabels" | "riskFlags">) {
  const profile = buildTeamBetProfile(candidate);
  const labelParts = [
    candidate.edgeLabel,
    profile.reasonLabels.length > 0 ? `Reasons: ${profile.reasonLabels.join(", ")}` : null,
    profile.riskFlags.length > 0 ? `Watch: ${profile.riskFlags.join(", ")}` : null,
  ].filter(Boolean);

  return {
    ...candidate,
    ...profile,
    edgeLabel: labelParts.join(" | "),
  };
}

export function isMlbCandidateBetEligible(candidate: MlbCandidate) {
  return candidate.betRecommendation === "bet";
}

export function isMlbCandidateTopPickEligible(candidate: MlbCandidate) {
  if (!isCoreBoardMarketType(candidate.marketType)) return false;
  if (candidate.betRecommendation !== "bet") return false;

  if (candidate.marketType === "moneyline") {
    return (
      (candidate.projectedSideMargin ?? 0) >= 1 &&
      candidate.edge >= 6 &&
      candidate.confidenceScore >= 68 &&
      (candidate.payoutPerUnit <= 1 || (candidate.confidenceScore >= 80 && candidate.edge >= 7.5))
    );
  }

  if (candidate.marketType === "spread") {
    return (
      (candidate.coverBuffer ?? 0) >= 1.1 &&
      candidate.edge >= 1.25 &&
      candidate.payoutPerUnit >= 0.58 &&
      candidate.confidenceScore >= 80
    );
  }

  if (candidate.marketType === "total") {
    return (
      candidate.edge >= 1.35 &&
      candidate.payoutPerUnit >= 0.6 &&
      candidate.confidenceScore >= 80 &&
      candidate.selectedImpliedProb >= 0.54
    );
  }

  return false;
}

export function isMlbCandidateBestValueEligible(candidate: MlbCandidate) {
  if (!isCoreBoardMarketType(candidate.marketType)) return false;
  return candidate.betRecommendation === "bet";
}

function winProbabilityFromRuns(homeRuns: number, awayRuns: number) {
  const homePower = Math.pow(Math.max(homeRuns, 0.1), 1.83);
  const awayPower = Math.pow(Math.max(awayRuns, 0.1), 1.83);
  return homePower / (homePower + awayPower);
}

function getMarketOutcome(
  market: EvaluatedMlbGame["teamTotals"],
  predicate: (
    outcome: NonNullable<NonNullable<EvaluatedMlbGame["teamTotals"]>["outcomes"]>[number]
  ) => boolean
) {
  return market?.outcomes?.find(predicate) ?? null;
}

function buildShadowTeamCandidate(params: {
  game: EvaluatedMlbGame;
  marketType: MlbTeamMarketType;
  side: string;
  sideTeam: string | null;
  lineTaken: number | null;
  oddsTaken: number;
  projectedLine: number | null;
  marketLine: number | null;
  edge: number;
  edgeLabel: string;
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedSideMargin?: number | null;
  coverBuffer?: number | null;
  learningProfile?: MlbLearningProfile | null;
}) {
  const selectedImpliedProb = americanToImpliedProb(params.oddsTaken);
  const payoutPerUnit = americanToProfitPerUnit(params.oddsTaken);
  const confidenceScore =
    getConfidenceStars({
      sport: "MLB",
      marketType: params.marketType,
      edge: params.edge,
      projectedSideMargin: params.projectedSideMargin,
      coverBuffer: params.coverBuffer,
    }) * 20;

  return withTeamBetProfile({
    game: params.game.game,
    marketType: params.marketType,
    side: params.side,
    sideTeam: params.sideTeam,
    lineTaken: params.lineTaken,
    oddsTaken: params.oddsTaken,
    projectedLine: params.projectedLine,
    marketLine: params.marketLine,
    edge: Math.abs(params.edge),
    edgeLabel: params.edgeLabel,
    confidenceScore,
    projectedHomeScore: params.projectedHomeScore,
    projectedAwayScore: params.projectedAwayScore,
    selectedImpliedProb,
    payoutPerUnit,
    projectedSideMargin: params.projectedSideMargin ?? null,
    coverBuffer: params.coverBuffer ?? null,
    contextRiskScore: params.game.contextRiskScore ?? 0,
    contextRiskNotes: params.game.contextRiskNotes ?? [],
    topPickScore: buildTopPickScore({
      marketType: params.marketType,
      confidenceScore,
      edge: Math.abs(params.edge),
      selectedImpliedProb,
      payoutPerUnit,
      oddsTaken: params.oddsTaken,
      lineTaken: params.lineTaken,
      projectedSideMargin: params.projectedSideMargin ?? null,
      coverBuffer: params.coverBuffer ?? null,
      contextRiskScore: params.game.contextRiskScore ?? 0,
    }, params.learningProfile),
  });
}

export function buildMlbCandidates(
  games: EvaluatedMlbGame[],
  now: Date,
  learningProfile?: MlbLearningProfile | null
) {
  const candidates: MlbCandidate[] = [];

  for (const game of games) {
    if (game.missingModel) continue;
    if (new Date(game.game.commence_time) <= now) continue;
    if (game.projectedHomeRuns === undefined || game.projectedAwayRuns === undefined) continue;
    const projectedHomeRuns = game.projectedHomeRuns;
    const projectedAwayRuns = game.projectedAwayRuns;

    if (game.marketHomeMoneyline != null && game.marketAwayMoneyline != null) {
      const homeEdge = game.moneylineEdgePercent ?? 0;
      const takeHome = homeEdge >= 0;
      const projectedWinnerSupportsSide = takeHome
        ? game.projectedHomeRuns >= game.projectedAwayRuns
        : game.projectedAwayRuns >= game.projectedHomeRuns;

      if (projectedWinnerSupportsSide) {
        const oddsTaken = takeHome ? game.marketHomeMoneyline : game.marketAwayMoneyline;
        const confidenceScore =
          getConfidenceStars({
            sport: "MLB",
            marketType: "moneyline",
            edge: homeEdge,
            projectedSideMargin: takeHome ? game.projectedMargin ?? null : (game.projectedMargin ?? 0) * -1,
          }) * 20;
        const selectedImpliedProb = americanToImpliedProb(oddsTaken);
        const payoutPerUnit = americanToProfitPerUnit(oddsTaken);

        candidates.push(withTeamBetProfile({
          game: game.game,
          marketType: "moneyline",
          side: takeHome ? game.game.home_team : game.game.away_team,
          sideTeam: takeHome ? game.game.home_team : game.game.away_team,
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
          projectedSideMargin: takeHome ? game.projectedMargin ?? null : (game.projectedMargin ?? 0) * -1,
          coverBuffer: null,
          contextRiskScore: game.contextRiskScore ?? 0,
          contextRiskNotes: game.contextRiskNotes ?? [],
          topPickScore: buildTopPickScore({
            marketType: "moneyline",
            confidenceScore,
            edge: Math.abs(homeEdge),
            selectedImpliedProb,
            payoutPerUnit,
            oddsTaken,
            projectedSideMargin: takeHome ? game.projectedMargin ?? null : (game.projectedMargin ?? 0) * -1,
            contextRiskScore: game.contextRiskScore ?? 0,
          }, learningProfile),
        }));
      }
    }

    if (
      game.marketHomeRunLine != null &&
      game.marketAwayRunLine != null &&
      game.homeRunLinePrice != null &&
      game.awayRunLinePrice != null &&
      game.projectedMargin !== undefined
    ) {
      const homeRunLineEdge = game.runLineEdge ?? 0;
      const takeHome = homeRunLineEdge >= 0;
      const oddsTaken = takeHome ? game.homeRunLinePrice : game.awayRunLinePrice;
      const lineTaken = takeHome ? game.marketHomeRunLine : game.marketAwayRunLine;
      const projectedSideMargin = takeHome ? game.projectedMargin : game.projectedMargin * -1;
      const coverBuffer =
        lineTaken === null || lineTaken === undefined ? null : Number((projectedSideMargin + lineTaken).toFixed(2));
      const confidenceScore =
        getConfidenceStars({
          sport: "MLB",
          marketType: "spread",
          edge: homeRunLineEdge,
          coverBuffer,
        }) * 20;
      const selectedImpliedProb = americanToImpliedProb(oddsTaken);
      const payoutPerUnit = americanToProfitPerUnit(oddsTaken);

      candidates.push(withTeamBetProfile({
        game: game.game,
        marketType: "spread",
        side: `${takeHome ? game.game.home_team : game.game.away_team} ${lineTaken}`,
        sideTeam: takeHome ? game.game.home_team : game.game.away_team,
        lineTaken,
        oddsTaken,
        projectedLine: game.projectedMargin,
        marketLine: lineTaken,
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
        projectedSideMargin,
        coverBuffer,
        contextRiskScore: game.contextRiskScore ?? 0,
        contextRiskNotes: game.contextRiskNotes ?? [],
        topPickScore: buildTopPickScore({
          marketType: "spread",
          confidenceScore,
          edge: Math.abs(homeRunLineEdge),
          selectedImpliedProb,
          payoutPerUnit,
          oddsTaken,
          projectedSideMargin,
          coverBuffer,
          contextRiskScore: game.contextRiskScore ?? 0,
        }, learningProfile),
      }));
    }

    if (
      game.marketTotal != null &&
      game.overPrice != null &&
      game.underPrice != null &&
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

      candidates.push(withTeamBetProfile({
        game: game.game,
        marketType: "total",
        side: `${takeOver ? "Over" : "Under"} ${game.marketTotal}`,
        sideTeam: null,
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
        projectedSideMargin: null,
        coverBuffer: null,
        contextRiskScore: game.contextRiskScore ?? 0,
        contextRiskNotes: [
          ...(game.contextRiskNotes ?? []),
          ...(game.weatherNote ? [`weather: ${game.weatherNote}`] : []),
        ],
        topPickScore: buildTopPickScore({
          marketType: "total",
          confidenceScore,
          edge: Math.abs(totalEdge),
          selectedImpliedProb,
          payoutPerUnit,
          oddsTaken,
          contextRiskScore: game.contextRiskScore ?? 0,
        }, learningProfile),
      }));
    }

    if (game.teamTotals?.outcomes?.length) {
      const teamTotalCandidates = [game.game.home_team, game.game.away_team]
        .flatMap((team) => {
          const projectedRuns = team === game.game.home_team ? projectedHomeRuns : projectedAwayRuns;
          if (projectedRuns === undefined) return [];

          return ["Over", "Under"].flatMap((direction) => {
            const outcome = getMarketOutcome(
              game.teamTotals,
              (entry) =>
                entry.name === direction &&
                (entry.description === team || entry.description === `${team} Total`)
            );
            if (!outcome?.price || outcome.point === null || outcome.point === undefined) return [];

            const signedEdge = Number(
              (direction === "Over" ? projectedRuns - outcome.point : outcome.point - projectedRuns).toFixed(1)
            );
            return [
              buildShadowTeamCandidate({
                game,
                marketType: "team_total",
                side: `${team} ${direction} ${outcome.point}`,
                sideTeam: team,
                lineTaken: outcome.point,
                oddsTaken: outcome.price,
                projectedLine: projectedRuns,
                marketLine: outcome.point,
                edge: signedEdge,
                edgeLabel: `${team} team total ${direction.toLowerCase()} lean`,
                projectedHomeScore: projectedHomeRuns,
                projectedAwayScore: projectedAwayRuns,
                learningProfile,
              }),
            ];
          });
        })
        .sort((a, b) => b.edge - a.edge);

      if (teamTotalCandidates[0]) {
        candidates.push(teamTotalCandidates[0]);
      }
    }

    const f5ProjectedHomeRuns = Number((projectedHomeRuns * 0.56).toFixed(1));
    const f5ProjectedAwayRuns = Number((projectedAwayRuns * 0.56).toFixed(1));
    const f5ProjectedMargin = Number((f5ProjectedHomeRuns - f5ProjectedAwayRuns).toFixed(1));
    const f5ProjectedTotal = Number((f5ProjectedHomeRuns + f5ProjectedAwayRuns).toFixed(1));

    if (game.firstFiveMoneyline?.outcomes?.length) {
      const homeOutcome = getMarketOutcome(game.firstFiveMoneyline, (entry) => entry.name === game.game.home_team);
      const awayOutcome = getMarketOutcome(game.firstFiveMoneyline, (entry) => entry.name === game.game.away_team);

      if (homeOutcome?.price && awayOutcome?.price) {
        const homeWinProb = winProbabilityFromRuns(f5ProjectedHomeRuns, f5ProjectedAwayRuns);
        const homeMarketProb = americanToImpliedProb(homeOutcome.price);
        const awayMarketProb = americanToImpliedProb(awayOutcome.price);
        const homeEdge = Number(((homeWinProb - homeMarketProb) * 100).toFixed(1));
        const awayEdge = Number((((1 - homeWinProb) - awayMarketProb) * 100).toFixed(1));
        const takeHome = homeEdge >= awayEdge;
        const oddsTaken = takeHome ? homeOutcome.price : awayOutcome.price;

        candidates.push(buildShadowTeamCandidate({
          game,
          marketType: "f5_moneyline",
          side: takeHome ? game.game.home_team : game.game.away_team,
          sideTeam: takeHome ? game.game.home_team : game.game.away_team,
          lineTaken: null,
          oddsTaken,
          projectedLine: null,
          marketLine: oddsTaken,
          edge: takeHome ? homeEdge : awayEdge,
          edgeLabel: "First 5 moneyline lean",
          projectedHomeScore: f5ProjectedHomeRuns,
          projectedAwayScore: f5ProjectedAwayRuns,
          projectedSideMargin: takeHome ? f5ProjectedMargin : f5ProjectedMargin * -1,
          learningProfile,
        }));
      }
    }

    if (game.firstFiveSpreads?.outcomes?.length) {
      const homeOutcome = getMarketOutcome(game.firstFiveSpreads, (entry) => entry.name === game.game.home_team);
      const awayOutcome = getMarketOutcome(game.firstFiveSpreads, (entry) => entry.name === game.game.away_team);

      if (
        homeOutcome?.price &&
        homeOutcome.point !== null &&
        homeOutcome.point !== undefined &&
        awayOutcome?.price &&
        awayOutcome.point !== null &&
        awayOutcome.point !== undefined
      ) {
        const homeCoverBuffer = Number((f5ProjectedMargin + homeOutcome.point).toFixed(2));
        const awayCoverBuffer = Number((f5ProjectedMargin * -1 + awayOutcome.point).toFixed(2));
        const takeHome = homeCoverBuffer >= awayCoverBuffer;
        const outcome = takeHome ? homeOutcome : awayOutcome;
        const lineTaken = outcome.point ?? null;
        const oddsTaken = outcome.price ?? null;
        const projectedSideMargin = takeHome ? f5ProjectedMargin : f5ProjectedMargin * -1;
        const coverBuffer = takeHome ? homeCoverBuffer : awayCoverBuffer;

        if (lineTaken !== null && oddsTaken !== null) {
          candidates.push(buildShadowTeamCandidate({
            game,
            marketType: "f5_spread",
            side: `${takeHome ? game.game.home_team : game.game.away_team} ${lineTaken}`,
            sideTeam: takeHome ? game.game.home_team : game.game.away_team,
            lineTaken,
            oddsTaken,
            projectedLine: f5ProjectedMargin,
            marketLine: lineTaken,
            edge: coverBuffer,
            edgeLabel: "First 5 run line lean",
            projectedHomeScore: f5ProjectedHomeRuns,
            projectedAwayScore: f5ProjectedAwayRuns,
            projectedSideMargin,
            coverBuffer,
            learningProfile,
          }));
        }
      }
    }

    if (game.firstFiveTotals?.outcomes?.length) {
      const overOutcome = getMarketOutcome(game.firstFiveTotals, (entry) => entry.name === "Over");
      const underOutcome = getMarketOutcome(game.firstFiveTotals, (entry) => entry.name === "Under");
      const marketTotal = overOutcome?.point ?? underOutcome?.point ?? null;

      if (marketTotal !== null && overOutcome?.price && underOutcome?.price) {
        const totalEdge = Number((f5ProjectedTotal - marketTotal).toFixed(1));
        const takeOver = totalEdge >= 0;

        candidates.push(buildShadowTeamCandidate({
          game,
          marketType: "f5_total",
          side: `${takeOver ? "Over" : "Under"} ${marketTotal}`,
          sideTeam: null,
          lineTaken: marketTotal,
          oddsTaken: takeOver ? overOutcome.price : underOutcome.price,
          projectedLine: f5ProjectedTotal,
          marketLine: marketTotal,
          edge: Math.abs(totalEdge),
          edgeLabel: "First 5 total lean",
          projectedHomeScore: f5ProjectedHomeRuns,
          projectedAwayScore: f5ProjectedAwayRuns,
          learningProfile,
        }));
      }
    }
  }

  return candidates;
}

export function toSavedMlbTeamCandidate(
  row: SavedMlbTeamBoardRow,
  learningProfile?: MlbLearningProfile | null
) {
  if (!row.game_label || !row.home_team || !row.away_team || !row.market_type) return null;
  if (row.odds_taken === null || row.odds_taken === undefined) return null;

  const projectedHomeScore = Number(row.projected_home_score ?? 0);
  const projectedAwayScore = Number(row.projected_away_score ?? 0);
  const projectedSideMargin = getSavedProjectedSideMargin(row);
  const coverBuffer = getSavedCoverBuffer(row);
  const oddsTaken = Number(row.odds_taken);
  const confidenceScore = Number(row.confidence_score ?? 0);
  const selectedImpliedProb = americanToImpliedProb(oddsTaken);
  const payoutPerUnit = americanToProfitPerUnit(oddsTaken);

  return withTeamBetProfile({
    game: {
      id: row.external_event_id ?? `saved-${row.id ?? savedMlbTeamBoardKey(row)}`,
      home_team: row.home_team,
      away_team: row.away_team,
      commence_time: row.game_start_time ?? new Date(0).toISOString(),
    },
    marketType: row.market_type,
    side: row.side,
    sideTeam: getSavedSideTeam(row),
    lineTaken: row.line_taken ?? null,
    oddsTaken,
    projectedLine: row.projected_line ?? null,
    marketLine: row.market_line ?? row.line_taken ?? null,
    edge: Math.abs(Number(row.edge ?? 0)),
    edgeLabel: row.edge_label ?? `${row.market_type} saved`,
    confidenceScore,
    projectedHomeScore,
    projectedAwayScore,
    selectedImpliedProb,
    payoutPerUnit,
    projectedSideMargin,
    coverBuffer,
    contextRiskScore: 0,
    contextRiskNotes: [],
    topPickScore: buildTopPickScore(
      {
        marketType: row.market_type,
        confidenceScore,
        edge: Math.abs(Number(row.edge ?? 0)),
        selectedImpliedProb,
        payoutPerUnit,
        oddsTaken,
        lineTaken: row.line_taken ?? null,
        projectedSideMargin,
        coverBuffer,
        contextRiskScore: 0,
      },
      learningProfile
    ),
  });
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

export function selectDistinctBestValueCandidates(
  candidates: MlbCandidate[],
  topCandidates: MlbCandidate[],
  limit: number,
  learningProfile?: MlbLearningProfile | null
) {
  const topKeys = new Set(topCandidates.map(candidateKey));

  return rankBestValueCandidates(candidates, learningProfile)
    .filter((candidate) => !topKeys.has(candidateKey(candidate)))
    .slice(0, limit);
}

export function rankBestValueCandidates(
  candidates: MlbCandidate[],
  learningProfile?: MlbLearningProfile | null
) {
  const addPreference = (candidate: MlbCandidate, base: number) => {
    const preferences = learningProfile?.marketPreferences;
    if (!preferences) return base;
    if (candidate.marketType === "moneyline") {
      return base + preferences.moneyline;
    }
    if (candidate.marketType === "total") {
      return base + preferences.total;
    }
    let adjusted = base + preferences.spread;
    if ((candidate.lineTaken ?? 0) > 0) adjusted += preferences.plusRunLine;
    if ((candidate.lineTaken ?? 0) < 0) adjusted += preferences.minusRunLine;
    return adjusted;
  };

  return [...candidates].sort((a, b) => {
    const aFinalScore = getMlbTeamBestValueScore(a, learningProfile);
    const bFinalScore = getMlbTeamBestValueScore(b, learningProfile);

    if (bFinalScore !== aFinalScore) return bFinalScore - aFinalScore;

    if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
    if (b.edge !== a.edge) return b.edge - a.edge;
    return b.payoutPerUnit - a.payoutPerUnit;
  });
}

export function getMlbTeamBestValueScore(
  candidate: MlbCandidate,
  learningProfile?: MlbLearningProfile | null
) {
  const spreadBonus = candidate.marketType === "spread" ? (candidate.coverBuffer ?? 0) * 8 : 0;
  const moneylinePenalty =
    candidate.marketType === "moneyline"
      ? Math.max(0, 0.75 - (candidate.projectedSideMargin ?? 0)) * 12
      : 0;
  const contextPenalty = (candidate.contextRiskScore ?? 0) * 0.45;
  const profileScore = candidate.confidenceScore + candidate.edge + spreadBonus - moneylinePenalty - contextPenalty;
  const preferences = learningProfile?.marketPreferences;

  if (!preferences) return profileScore;
  if (candidate.marketType === "moneyline") {
    return profileScore + preferences.moneyline;
  }
  if (candidate.marketType === "total") {
    return profileScore + preferences.total;
  }

  let adjusted = profileScore + preferences.spread;
  if ((candidate.lineTaken ?? 0) > 0) adjusted += preferences.plusRunLine;
  if ((candidate.lineTaken ?? 0) < 0) adjusted += preferences.minusRunLine;
  return adjusted;
}

export function selectMlbTeamBoardCandidates(
  candidates: MlbCandidate[],
  learningProfile?: MlbLearningProfile | null,
  excludedGameLabels: Iterable<string> = []
) {
  const doubleheaderGameLabels = new Set([
    ...Array.from(
      getMlbDoubleheaderGameLabels(
        candidates.map((candidate) => ({
          external_event_id: candidate.game.id,
          game_label: labelForGame(candidate.game),
          game_start_time: candidate.game.commence_time,
        }))
      )
    ),
    ...Array.from(excludedGameLabels),
  ]);
  const boardEligibleCandidates = candidates.filter(
    (candidate) => !isMlbDoubleheaderGameLabel(labelForGame(candidate.game), doubleheaderGameLabels)
  );
  const dedupedBoardCandidates = Array.from(
    boardEligibleCandidates
      .reduce((deduped, candidate) => {
        const key = candidateKey(candidate);
        const existing = deduped.get(key);
        const candidateScore = Math.max(candidate.topPickScore, getMlbTeamBestValueScore(candidate, learningProfile));
        const existingScore = existing
          ? Math.max(existing.topPickScore, getMlbTeamBestValueScore(existing, learningProfile))
          : -Infinity;

        if (!existing || candidateScore > existingScore) {
          deduped.set(key, candidate);
        }

        return deduped;
      }, new Map<string, MlbCandidate>())
      .values()
  );
  const topCandidatePool = dedupedBoardCandidates.filter(isMlbCandidateTopPickEligible);
  const bestValuePool = dedupedBoardCandidates.filter(isMlbCandidateBestValueEligible);
  const topCandidates = rankTopHitRateCandidates(topCandidatePool).slice(0, 3);
  const bestValueCandidates = selectDistinctBestValueCandidates(
    bestValuePool,
    topCandidates,
    3,
    learningProfile
  );

  return {
    topCandidatePool,
    bestValuePool,
    topCandidates,
    bestValueCandidates,
    excludedDoubleheaderGameLabels: Array.from(doubleheaderGameLabels),
  };
}
