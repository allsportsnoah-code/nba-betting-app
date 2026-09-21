import { nflTeamProfiles, NFL_HOME_FIELD_ADVANTAGE, NFL_BASE_PPG, NFL_SCORE_STD_DEV } from "@/lib/nflRatings";
import { buildNflBetProfile, getNflTopPickScore, isNflCandidateTopPickEligible, type NflCandidate } from "@/lib/nflMarkets";
import type { NflOddsGame } from "@/lib/nflOddsCache";
import type { NflGameContext } from "@/lib/nflContext";
import { americanToProfitPerUnit } from "@/lib/units";

export type NflProjection = {
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedMargin: number;
  homeWinProb: number;
  awayWinProb: number;
  fairHomeMoneyline: number;
  fairAwayMoneyline: number;
};

export type EvaluatedNflGame = {
  game: NflOddsGame;
  context?: NflGameContext | null;
  missingModel?: boolean;
  projection?: NflProjection;
  marketHomeMoneyline?: number | null;
  marketAwayMoneyline?: number | null;
  marketSpread?: number | null;
  homeSpreadPrice?: number | null;
  awaySpreadPrice?: number | null;
  marketTotal?: number | null;
  overPrice?: number | null;
  underPrice?: number | null;
  moneylineEdge?: number | null;
  spreadEdge?: number | null;
  totalEdge?: number | null;
  candidates: NflCandidate[];
};

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422820 * Math.exp((-z * z) / 2);
  const prob =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z > 0 ? 1 - prob : prob;
}

function probToAmerican(prob: number): number {
  const clamped = Math.max(0.01, Math.min(0.99, prob));
  if (clamped >= 0.5) return -Math.round((clamped / (1 - clamped)) * 100);
  return Math.round(((1 - clamped) / clamped) * 100);
}

function americanToImpliedProb(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function projectGame(homeTeam: string, awayTeam: string): NflProjection | null {
  const home = nflTeamProfiles[homeTeam];
  const away = nflTeamProfiles[awayTeam];
  if (!home || !away) return null;

  const homeScore =
    NFL_BASE_PPG * (home.offense / 100) * (100 / away.defense) + NFL_HOME_FIELD_ADVANTAGE / 2;
  const awayScore =
    NFL_BASE_PPG * (away.offense / 100) * (100 / home.defense) - NFL_HOME_FIELD_ADVANTAGE / 2;

  const projectedHomeScore = Number(homeScore.toFixed(1));
  const projectedAwayScore = Number(awayScore.toFixed(1));
  const projectedTotal = Number((projectedHomeScore + projectedAwayScore).toFixed(1));
  const projectedMargin = Number((projectedHomeScore - projectedAwayScore).toFixed(1));

  const homeWinProb = normalCDF(projectedMargin / NFL_SCORE_STD_DEV);
  const awayWinProb = 1 - homeWinProb;

  return {
    projectedHomeScore,
    projectedAwayScore,
    projectedTotal,
    projectedMargin,
    homeWinProb: Number(homeWinProb.toFixed(4)),
    awayWinProb: Number(awayWinProb.toFixed(4)),
    fairHomeMoneyline: probToAmerican(homeWinProb),
    fairAwayMoneyline: probToAmerican(awayWinProb),
  };
}

function extractMarkets(game: NflOddsGame) {
  const draftkings = game.bookmakers?.find(() => true); // first (only) bookmaker
  if (!draftkings) return {};

  const h2h = draftkings.markets?.find((m) => m.key === "h2h");
  const spreads = draftkings.markets?.find((m) => m.key === "spreads");
  const totals = draftkings.markets?.find((m) => m.key === "totals");

  const homeH2h = h2h?.outcomes?.find((o) => o.name === game.home_team);
  const awayH2h = h2h?.outcomes?.find((o) => o.name === game.away_team);
  const homeSpread = spreads?.outcomes?.find((o) => o.name === game.home_team);
  const awaySpread = spreads?.outcomes?.find((o) => o.name === game.away_team);
  const over = totals?.outcomes?.find((o) => o.name === "Over");
  const under = totals?.outcomes?.find((o) => o.name === "Under");

  const homeSpreadPt = homeSpread?.point ?? null;
  const overPt = over?.point ?? null;

  // Derive implied team totals from spread + game total math:
  // impliedHome = (total - spread) / 2, impliedAway = (total + spread) / 2
  // where spread is the home team's spread line (negative = home favored)
  const homeTeamTotalLine = (homeSpreadPt != null && overPt != null)
    ? Number(((overPt - homeSpreadPt) / 2).toFixed(1))
    : null;
  const awayTeamTotalLine = (homeSpreadPt != null && overPt != null)
    ? Number(((overPt + homeSpreadPt) / 2).toFixed(1))
    : null;

  return {
    marketHomeMoneyline: homeH2h?.price ?? null,
    marketAwayMoneyline: awayH2h?.price ?? null,
    marketSpread: homeSpreadPt,
    homeSpreadPrice: homeSpread?.price ?? null,
    awaySpreadPrice: awaySpread?.price ?? null,
    marketTotal: overPt,
    overPrice: over?.price ?? null,
    underPrice: under?.price ?? null,
    homeTeamTotalLine,
    // Standard -110 juice since these are derived lines, not pulled from bookmaker
    homeTeamOverPrice: homeTeamTotalLine != null ? -110 : null,
    homeTeamUnderPrice: homeTeamTotalLine != null ? -110 : null,
    awayTeamTotalLine,
    awayTeamOverPrice: awayTeamTotalLine != null ? -110 : null,
    awayTeamUnderPrice: awayTeamTotalLine != null ? -110 : null,
  };
}

function buildCandidatesForGame(
  game: NflOddsGame,
  proj: NflProjection,
  markets: ReturnType<typeof extractMarkets>,
  context?: NflGameContext | null
): NflCandidate[] {
  const candidates: NflCandidate[] = [];
  const contextRiskScore = context?.riskScore ?? 0;

  // Moneyline candidates
  if (markets.marketHomeMoneyline !== null && markets.marketHomeMoneyline !== undefined) {
    const marketProb = americanToImpliedProb(markets.marketHomeMoneyline);
    const edge = Number(((proj.homeWinProb - marketProb) * 100).toFixed(1));
    const payout = americanToProfitPerUnit(markets.marketHomeMoneyline);
    const projectedSideMargin = proj.projectedMargin;
    const profile = buildNflBetProfile({
      marketType: "moneyline",
      edge,
      confidenceScore: Math.round(proj.homeWinProb * 100),
      payoutPerUnit: payout,
      projectedSideMargin,
      contextRiskScore,
    });
    const candidate: NflCandidate = {
      marketType: "moneyline",
      side: game.home_team,
      lineTaken: null,
      oddsTaken: markets.marketHomeMoneyline,
      edge,
      confidenceScore: Math.round(proj.homeWinProb * 100),
      projectedLine: null,
      marketLine: null,
      payoutPerUnit: payout,
      selectedImpliedProb: marketProb,
      projectedSideMargin,
      contextRiskScore,
      edgeLabel: profile.reasonLabels.join(" | "),
      ...profile,
    };
    if (candidate.betRecommendation !== "pass") candidates.push(candidate);
  }

  if (markets.marketAwayMoneyline !== null && markets.marketAwayMoneyline !== undefined) {
    const marketProb = americanToImpliedProb(markets.marketAwayMoneyline);
    const edge = Number(((proj.awayWinProb - marketProb) * 100).toFixed(1));
    const payout = americanToProfitPerUnit(markets.marketAwayMoneyline);
    const projectedSideMargin = -proj.projectedMargin;
    const profile = buildNflBetProfile({
      marketType: "moneyline",
      edge,
      confidenceScore: Math.round(proj.awayWinProb * 100),
      payoutPerUnit: payout,
      projectedSideMargin,
      contextRiskScore,
    });
    const candidate: NflCandidate = {
      marketType: "moneyline",
      side: game.away_team,
      lineTaken: null,
      oddsTaken: markets.marketAwayMoneyline,
      edge,
      confidenceScore: Math.round(proj.awayWinProb * 100),
      projectedLine: null,
      marketLine: null,
      payoutPerUnit: payout,
      selectedImpliedProb: marketProb,
      projectedSideMargin,
      contextRiskScore,
      edgeLabel: profile.reasonLabels.join(" | "),
      ...profile,
    };
    if (candidate.betRecommendation !== "pass") candidates.push(candidate);
  }

  // Spread candidates
  if (markets.marketSpread !== null && markets.marketSpread !== undefined) {
    const homeSpreadLine = markets.marketSpread;
    const coverBuffer = Number((proj.projectedMargin + homeSpreadLine).toFixed(1));

    if (markets.homeSpreadPrice !== null && markets.homeSpreadPrice !== undefined) {
      const payout = americanToProfitPerUnit(markets.homeSpreadPrice);
      const edge = Number(coverBuffer.toFixed(1));
      const profile = buildNflBetProfile({
        marketType: "spread",
        edge: Math.abs(edge),
        confidenceScore: Math.round((coverBuffer > 0 ? 55 + Math.min(coverBuffer * 3, 20) : 45 + coverBuffer * 3)),
        payoutPerUnit: payout,
        coverBuffer: coverBuffer > 0 ? coverBuffer : 0,
        contextRiskScore,
      });
      const candidate: NflCandidate = {
        marketType: "spread",
        side: `${game.home_team} ${homeSpreadLine > 0 ? "+" : ""}${homeSpreadLine}`,
        lineTaken: homeSpreadLine,
        oddsTaken: markets.homeSpreadPrice,
        edge: Math.abs(edge),
        confidenceScore: Math.round(coverBuffer > 0 ? 55 + Math.min(coverBuffer * 3, 20) : 45 + coverBuffer * 3),
        projectedLine: proj.projectedMargin,
        marketLine: homeSpreadLine,
        payoutPerUnit: payout,
        selectedImpliedProb: americanToImpliedProb(markets.homeSpreadPrice),
        coverBuffer,
        contextRiskScore,
        edgeLabel: profile.reasonLabels.join(" | "),
        ...profile,
      };
      if (candidate.betRecommendation !== "pass" && coverBuffer > 0) candidates.push(candidate);
    }

    if (markets.awaySpreadPrice !== null && markets.awaySpreadPrice !== undefined) {
      const awayLine = -homeSpreadLine;
      const awayCoverBuffer = Number((proj.projectedMargin * -1 + awayLine).toFixed(1));
      const payout = americanToProfitPerUnit(markets.awaySpreadPrice);
      const profile = buildNflBetProfile({
        marketType: "spread",
        edge: Math.abs(awayCoverBuffer),
        confidenceScore: Math.round(awayCoverBuffer > 0 ? 55 + Math.min(awayCoverBuffer * 3, 20) : 45 + awayCoverBuffer * 3),
        payoutPerUnit: payout,
        coverBuffer: awayCoverBuffer > 0 ? awayCoverBuffer : 0,
        contextRiskScore,
      });
      const candidate: NflCandidate = {
        marketType: "spread",
        side: `${game.away_team} ${awayLine > 0 ? "+" : ""}${awayLine}`,
        lineTaken: awayLine,
        oddsTaken: markets.awaySpreadPrice,
        edge: Math.abs(awayCoverBuffer),
        confidenceScore: Math.round(awayCoverBuffer > 0 ? 55 + Math.min(awayCoverBuffer * 3, 20) : 45 + awayCoverBuffer * 3),
        projectedLine: proj.projectedMargin * -1,
        marketLine: awayLine,
        payoutPerUnit: payout,
        selectedImpliedProb: americanToImpliedProb(markets.awaySpreadPrice),
        coverBuffer: awayCoverBuffer,
        contextRiskScore,
        edgeLabel: profile.reasonLabels.join(" | "),
        ...profile,
      };
      if (candidate.betRecommendation !== "pass" && awayCoverBuffer > 0) candidates.push(candidate);
    }
  }

  // Total candidates
  if (markets.marketTotal !== null && markets.marketTotal !== undefined && markets.overPrice !== null && markets.overPrice !== undefined) {
    const totalEdge = Number((proj.projectedTotal - markets.marketTotal).toFixed(1));

    if (totalEdge > 0 && markets.overPrice !== null && markets.overPrice !== undefined) {
      const payout = americanToProfitPerUnit(markets.overPrice);
      const profile = buildNflBetProfile({
        marketType: "game_total",
        edge: totalEdge,
        confidenceScore: Math.round(52 + Math.min(totalEdge * 2, 15)),
        payoutPerUnit: payout,
        contextRiskScore,
      });
      const candidate: NflCandidate = {
        marketType: "game_total",
        side: `Over ${markets.marketTotal}`,
        lineTaken: markets.marketTotal,
        oddsTaken: markets.overPrice,
        edge: totalEdge,
        confidenceScore: Math.round(52 + Math.min(totalEdge * 2, 15)),
        projectedLine: proj.projectedTotal,
        marketLine: markets.marketTotal,
        payoutPerUnit: payout,
        selectedImpliedProb: americanToImpliedProb(markets.overPrice),
        contextRiskScore,
        edgeLabel: profile.reasonLabels.join(" | "),
        ...profile,
      };
      if (candidate.betRecommendation !== "pass") candidates.push(candidate);
    }

    if (totalEdge < 0 && markets.underPrice !== null && markets.underPrice !== undefined) {
      const underEdge = Math.abs(totalEdge);
      const payout = americanToProfitPerUnit(markets.underPrice);
      const profile = buildNflBetProfile({
        marketType: "game_total",
        edge: underEdge,
        confidenceScore: Math.round(52 + Math.min(underEdge * 2, 15)),
        payoutPerUnit: payout,
        contextRiskScore,
      });
      const candidate: NflCandidate = {
        marketType: "game_total",
        side: `Under ${markets.marketTotal}`,
        lineTaken: markets.marketTotal,
        oddsTaken: markets.underPrice,
        edge: underEdge,
        confidenceScore: Math.round(52 + Math.min(underEdge * 2, 15)),
        projectedLine: proj.projectedTotal,
        marketLine: markets.marketTotal,
        payoutPerUnit: payout,
        selectedImpliedProb: americanToImpliedProb(markets.underPrice),
        contextRiskScore,
        edgeLabel: profile.reasonLabels.join(" | "),
        ...profile,
      };
      if (candidate.betRecommendation !== "pass") candidates.push(candidate);
    }
  }

  // Home team total candidates
  if (markets.homeTeamTotalLine != null && markets.homeTeamOverPrice != null && markets.homeTeamUnderPrice != null) {
    const homeEdge = Number((proj.projectedHomeScore - markets.homeTeamTotalLine).toFixed(1));

    if (homeEdge > 0) {
      const payout = americanToProfitPerUnit(markets.homeTeamOverPrice);
      const profile = buildNflBetProfile({
        marketType: "home_team_total",
        edge: homeEdge,
        confidenceScore: Math.round(52 + Math.min(homeEdge * 2.5, 15)),
        payoutPerUnit: payout,
        contextRiskScore,
      });
      const candidate: NflCandidate = {
        marketType: "home_team_total",
        side: `${game.home_team} Over ${markets.homeTeamTotalLine}`,
        lineTaken: markets.homeTeamTotalLine,
        oddsTaken: markets.homeTeamOverPrice,
        edge: homeEdge,
        confidenceScore: Math.round(52 + Math.min(homeEdge * 2.5, 15)),
        projectedLine: proj.projectedHomeScore,
        marketLine: markets.homeTeamTotalLine,
        payoutPerUnit: payout,
        selectedImpliedProb: americanToImpliedProb(markets.homeTeamOverPrice),
        contextRiskScore,
        edgeLabel: profile.reasonLabels.join(" | "),
        ...profile,
      };
      if (candidate.betRecommendation !== "pass") candidates.push(candidate);
    } else if (homeEdge < 0) {
      const underEdge = Math.abs(homeEdge);
      const payout = americanToProfitPerUnit(markets.homeTeamUnderPrice);
      const profile = buildNflBetProfile({
        marketType: "home_team_total",
        edge: underEdge,
        confidenceScore: Math.round(52 + Math.min(underEdge * 2.5, 15)),
        payoutPerUnit: payout,
        contextRiskScore,
      });
      const candidate: NflCandidate = {
        marketType: "home_team_total",
        side: `${game.home_team} Under ${markets.homeTeamTotalLine}`,
        lineTaken: markets.homeTeamTotalLine,
        oddsTaken: markets.homeTeamUnderPrice,
        edge: underEdge,
        confidenceScore: Math.round(52 + Math.min(underEdge * 2.5, 15)),
        projectedLine: proj.projectedHomeScore,
        marketLine: markets.homeTeamTotalLine,
        payoutPerUnit: payout,
        selectedImpliedProb: americanToImpliedProb(markets.homeTeamUnderPrice),
        contextRiskScore,
        edgeLabel: profile.reasonLabels.join(" | "),
        ...profile,
      };
      if (candidate.betRecommendation !== "pass") candidates.push(candidate);
    }
  }

  // Away team total candidates
  if (markets.awayTeamTotalLine != null && markets.awayTeamOverPrice != null && markets.awayTeamUnderPrice != null) {
    const awayEdge = Number((proj.projectedAwayScore - markets.awayTeamTotalLine).toFixed(1));

    if (awayEdge > 0) {
      const payout = americanToProfitPerUnit(markets.awayTeamOverPrice);
      const profile = buildNflBetProfile({
        marketType: "away_team_total",
        edge: awayEdge,
        confidenceScore: Math.round(52 + Math.min(awayEdge * 2.5, 15)),
        payoutPerUnit: payout,
        contextRiskScore,
      });
      const candidate: NflCandidate = {
        marketType: "away_team_total",
        side: `${game.away_team} Over ${markets.awayTeamTotalLine}`,
        lineTaken: markets.awayTeamTotalLine,
        oddsTaken: markets.awayTeamOverPrice,
        edge: awayEdge,
        confidenceScore: Math.round(52 + Math.min(awayEdge * 2.5, 15)),
        projectedLine: proj.projectedAwayScore,
        marketLine: markets.awayTeamTotalLine,
        payoutPerUnit: payout,
        selectedImpliedProb: americanToImpliedProb(markets.awayTeamOverPrice),
        contextRiskScore,
        edgeLabel: profile.reasonLabels.join(" | "),
        ...profile,
      };
      if (candidate.betRecommendation !== "pass") candidates.push(candidate);
    } else if (awayEdge < 0) {
      const underEdge = Math.abs(awayEdge);
      const payout = americanToProfitPerUnit(markets.awayTeamUnderPrice);
      const profile = buildNflBetProfile({
        marketType: "away_team_total",
        edge: underEdge,
        confidenceScore: Math.round(52 + Math.min(underEdge * 2.5, 15)),
        payoutPerUnit: payout,
        contextRiskScore,
      });
      const candidate: NflCandidate = {
        marketType: "away_team_total",
        side: `${game.away_team} Under ${markets.awayTeamTotalLine}`,
        lineTaken: markets.awayTeamTotalLine,
        oddsTaken: markets.awayTeamUnderPrice,
        edge: underEdge,
        confidenceScore: Math.round(52 + Math.min(underEdge * 2.5, 15)),
        projectedLine: proj.projectedAwayScore,
        marketLine: markets.awayTeamTotalLine,
        payoutPerUnit: payout,
        selectedImpliedProb: americanToImpliedProb(markets.awayTeamUnderPrice),
        contextRiskScore,
        edgeLabel: profile.reasonLabels.join(" | "),
        ...profile,
      };
      if (candidate.betRecommendation !== "pass") candidates.push(candidate);
    }
  }

  return candidates;
}

export function evaluateNflGames(
  games: NflOddsGame[],
  contextByGame: Record<string, NflGameContext> = {}
): EvaluatedNflGame[] {
  return games.map((game) => {
    const markets = extractMarkets(game);
    const proj = projectGame(game.home_team, game.away_team);
    const context = contextByGame[game.id] ?? null;

    if (!proj) {
      return { game, context, missingModel: true, candidates: [], ...markets };
    }

    const candidates = buildCandidatesForGame(game, proj, markets, context);

    return {
      game,
      context,
      projection: proj,
      candidates,
      ...markets,
    };
  });
}

export function selectNflTopPicks(candidates: NflCandidate[], limit = 5): NflCandidate[] {
  return candidates
    .filter(isNflCandidateTopPickEligible)
    .sort((a, b) => {
      const scoreA = getNflTopPickScore({
        marketType: a.marketType,
        edge: a.edge,
        confidenceScore: a.confidenceScore,
        oddsTaken: a.oddsTaken,
        projectedSideMargin: a.projectedSideMargin,
        coverBuffer: a.coverBuffer,
        contextRiskScore: a.contextRiskScore,
      });
      const scoreB = getNflTopPickScore({
        marketType: b.marketType,
        edge: b.edge,
        confidenceScore: b.confidenceScore,
        oddsTaken: b.oddsTaken,
        projectedSideMargin: b.projectedSideMargin,
        coverBuffer: b.coverBuffer,
        contextRiskScore: b.contextRiskScore,
      });
      return scoreB - scoreA;
    })
    .slice(0, limit);
}

export function selectNflBestValue(
  candidates: NflCandidate[],
  topPickSides: Set<string>,
  limit = 3
): NflCandidate[] {
  return candidates
    .filter(
      (c) =>
        !topPickSides.has(c.side) &&
        c.betRecommendation === "bet" &&
        c.payoutPerUnit >= 0.88 &&
        c.edge >= 1.5
    )
    .sort((a, b) => b.payoutPerUnit - a.payoutPerUnit)
    .slice(0, limit);
}
