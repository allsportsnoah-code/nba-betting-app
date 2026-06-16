type SupportedSport = "NBA" | "MLB" | "SOCCER";

type PickLike = {
  sport?: string | null;
  market_type?: string | null;
  edge?: number | null;
  confidence_score?: number | null;
  projected_side_margin?: number | null;
  cover_buffer?: number | null;
  game_start_time?: string | null;
};

function starsFromConfidenceScore(score: number | null | undefined) {
  if (score === null || score === undefined) return 0;
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 45) return 2;
  if (score >= 25) return 1;
  return 0;
}

function starsFromNbaEdge(edge: number | null | undefined) {
  const value = Math.abs(edge ?? 0);
  if (value >= 10) return 5;
  if (value >= 7) return 4;
  if (value >= 4.5) return 3;
  if (value >= 2.5) return 2;
  if (value >= 1.5) return 1;
  return 0;
}

function starsFromMlbMoneylineEdge(edge: number | null | undefined) {
  const value = Math.abs(edge ?? 0);
  if (value >= 10) return 5;
  if (value >= 7.5) return 4;
  if (value >= 4.5) return 3;
  if (value >= 3) return 2;
  if (value >= 1.5) return 1;
  return 0;
}

function starsFromMlbRunLineEdge(edge: number | null | undefined) {
  const value = Math.abs(edge ?? 0);
  if (value >= 1.35) return 5;
  if (value >= 1.0) return 4;
  if (value >= 0.6) return 3;
  if (value >= 0.35) return 2;
  if (value >= 0.2) return 1;
  return 0;
}

function starsFromMlbTotalEdge(edge: number | null | undefined) {
  const value = Math.abs(edge ?? 0);
  if (value >= 1.7) return 5;
  if (value >= 1.25) return 4;
  if (value >= 0.8) return 3;
  if (value >= 0.4) return 2;
  if (value >= 0.2) return 1;
  return 0;
}

function starsFromSoccerEdge(edge: number | null | undefined) {
  const value = Math.abs(edge ?? 0);
  if (value >= 16) return 5;
  if (value >= 11) return 4;
  if (value >= 7) return 3;
  if (value >= 4) return 2;
  if (value >= 2) return 1;
  return 0;
}

function isMlbPropMarket(marketType: string | null | undefined) {
  return (
    marketType === "pitcher_strikeouts" ||
    marketType === "pitcher_outs" ||
    marketType === "batter_hits" ||
    marketType === "batter_total_bases" ||
    marketType === "batter_rbis" ||
    marketType === "batter_runs_scored" ||
    marketType === "batter_hits_runs_rbis"
  );
}

function hasStarted(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now();
}

function starsFromMlbPropConfidence(score: number | null | undefined, lockedStarted: boolean) {
  const value = score ?? 0;
  if (lockedStarted) {
    if (value >= 82) return 5;
    if (value >= 68) return 4;
  } else {
    if (value >= 78) return 5;
    if (value >= 64) return 4;
  }
  if (value >= 54) return 3;
  if (value >= 42) return 2;
  if (value >= 28) return 1;
  return 0;
}

function starsFromMlbPropEdge(edge: number | null | undefined, lockedStarted: boolean) {
  const value = Math.abs(edge ?? 0);
  if (lockedStarted) {
    if (value >= 2.2) return 5;
    if (value >= 1.6) return 4;
  } else {
    if (value >= 2.0) return 5;
    if (value >= 1.45) return 4;
  }
  if (value >= 1.1) return 3;
  if (value >= 0.7) return 2;
  if (value >= 0.35) return 1;
  return 0;
}

function starsFromMlbPropProfile(
  confidenceScore: number | null | undefined,
  edge: number | null | undefined,
  lockedStarted: boolean
) {
  const confidenceStars = starsFromMlbPropConfidence(confidenceScore, lockedStarted);
  const edgeStars = starsFromMlbPropEdge(edge, lockedStarted);

  if (confidenceStars >= 5 && edgeStars >= 4) return 5;
  if (confidenceStars >= 4 && edgeStars >= 3) return 4;
  if (confidenceStars >= 3 && edgeStars >= 2) return 3;
  if (confidenceStars >= 2 && edgeStars >= 1) return 2;
  return 1;
}

function adjustMlbMoneylineStars(
  stars: number,
  projectedSideMargin: number | null | undefined
) {
  const margin = projectedSideMargin ?? 0;
  if (margin <= 0) return 1;
  if (margin < 0.35) return Math.min(stars, 2);
  if (margin < 0.75) return Math.min(stars, 3);
  if (margin < 1.05) return Math.min(stars, 4);
  return stars;
}

function adjustMlbRunLineStars(
  stars: number,
  coverBuffer: number | null | undefined
) {
  const buffer = coverBuffer ?? 0;
  if (buffer <= 0) return 1;
  if (buffer < 0.35) return Math.min(stars, 2);
  if (buffer < 0.7) return Math.min(stars, 3);
  if (buffer < 1.0) return Math.min(stars, 4);
  return stars;
}

export function getConfidenceStars({
  sport,
  marketType,
  edge,
  confidenceScore,
  projectedSideMargin,
  coverBuffer,
  gameStartTime,
}: {
  sport?: string | null;
  marketType?: string | null;
  edge?: number | null;
  confidenceScore?: number | null;
  projectedSideMargin?: number | null;
  coverBuffer?: number | null;
  gameStartTime?: string | null;
}) {
  const normalizedSport = sport as SupportedSport | undefined;
  let stars = 1;

  if (normalizedSport === "NBA") {
    stars = Math.max(starsFromConfidenceScore(confidenceScore), starsFromNbaEdge(edge));
    return Math.max(1, stars);
  }

  if (normalizedSport === "MLB") {
    if (isMlbPropMarket(marketType)) {
      const lockedStarted = hasStarted(gameStartTime);
      stars = starsFromMlbPropProfile(confidenceScore, edge, lockedStarted);
    } else if (marketType === "moneyline" || marketType === "f5_moneyline") {
      stars = adjustMlbMoneylineStars(
        starsFromMlbMoneylineEdge(edge),
        projectedSideMargin
      );
    } else if (marketType === "total" || marketType === "team_total" || marketType === "f5_total") {
      stars = starsFromMlbTotalEdge(edge);
    } else {
      stars = adjustMlbRunLineStars(
        starsFromMlbRunLineEdge(edge),
        coverBuffer
      );
    }

    return Math.max(1, stars);
  }

  if (normalizedSport === "SOCCER") {
    stars = Math.max(starsFromConfidenceScore(confidenceScore), starsFromSoccerEdge(edge));
    return Math.max(1, Math.min(5, stars));
  }

  stars = starsFromConfidenceScore(confidenceScore);
  return Math.max(1, stars);
}

export function getConfidenceLabel(stars: number) {
  if (stars <= 1) return "1 Star";
  return `${stars} Stars`;
}

export function getPickConfidenceStars(pick: PickLike) {
  return getConfidenceStars({
    sport: pick.sport,
    marketType: pick.market_type,
    edge: pick.edge,
    confidenceScore: pick.confidence_score,
    projectedSideMargin: pick.projected_side_margin,
    coverBuffer: pick.cover_buffer,
    gameStartTime: pick.game_start_time,
  });
}
