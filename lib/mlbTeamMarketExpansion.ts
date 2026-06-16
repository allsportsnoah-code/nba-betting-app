export const MLB_CORE_TEAM_MARKETS = ["h2h", "spreads", "totals"] as const;

export const MLB_SHADOW_TEAM_MARKETS = [
  "team_totals",
  "h2h_1st_5_innings",
  "spreads_1st_5_innings",
  "totals_1st_5_innings",
] as const;

export const MLB_SHADOW_TEAM_MARKET_TYPES = [
  "team_total",
  "f5_moneyline",
  "f5_spread",
  "f5_total",
] as const;

export type MlbShadowTeamMarketType = (typeof MLB_SHADOW_TEAM_MARKET_TYPES)[number];

export function getMlbTeamOddsMarkets(includeShadowMarkets = false) {
  return includeShadowMarkets
    ? [...MLB_CORE_TEAM_MARKETS, ...MLB_SHADOW_TEAM_MARKETS]
    : [...MLB_CORE_TEAM_MARKETS];
}

export function getMlbTeamOddsMarketParam(includeShadowMarkets = false) {
  return getMlbTeamOddsMarkets(includeShadowMarkets).join(",");
}

export function isMlbTeamTotalMarketType(marketType: string | null | undefined) {
  return marketType === "team_total";
}

export function isMlbFirstFiveMarketType(marketType: string | null | undefined) {
  return (
    marketType === "f5_moneyline" ||
    marketType === "f5_spread" ||
    marketType === "f5_total"
  );
}
