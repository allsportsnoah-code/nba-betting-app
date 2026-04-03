type SupportedSport = "NBA" | "MLB";

type PickLike = {
  sport?: string | null;
  market_type?: string | null;
  edge?: number | null;
  confidence_score?: number | null;
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
  if (value >= 8) return 5;
  if (value >= 6) return 4;
  if (value >= 4.5) return 3;
  if (value >= 3) return 2;
  if (value >= 1.5) return 1;
  return 0;
}

function starsFromMlbRunLineEdge(edge: number | null | undefined) {
  const value = Math.abs(edge ?? 0);
  if (value >= 1.2) return 5;
  if (value >= 0.85) return 4;
  if (value >= 0.6) return 3;
  if (value >= 0.35) return 2;
  if (value >= 0.2) return 1;
  return 0;
}

function starsFromMlbTotalEdge(edge: number | null | undefined) {
  const value = Math.abs(edge ?? 0);
  if (value >= 1.5) return 5;
  if (value >= 1.1) return 4;
  if (value >= 0.8) return 3;
  if (value >= 0.4) return 2;
  if (value >= 0.2) return 1;
  return 0;
}

export function getConfidenceStars({
  sport,
  marketType,
  edge,
  confidenceScore,
}: {
  sport?: string | null;
  marketType?: string | null;
  edge?: number | null;
  confidenceScore?: number | null;
}) {
  const normalizedSport = sport as SupportedSport | undefined;
  let stars = 1;

  if (normalizedSport === "NBA") {
    stars = Math.max(starsFromConfidenceScore(confidenceScore), starsFromNbaEdge(edge));
    return Math.max(1, stars);
  }

  if (normalizedSport === "MLB") {
    if (marketType === "moneyline") stars = starsFromMlbMoneylineEdge(edge);
    else if (marketType === "total") stars = starsFromMlbTotalEdge(edge);
    else stars = starsFromMlbRunLineEdge(edge);

    return Math.max(1, stars);
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
  });
}
