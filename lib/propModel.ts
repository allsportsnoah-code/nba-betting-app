export const PROP_MARKET_MAP: Record<
  string,
  { marketKey: string; statKey: string; label: string }
> = {
  points: {
    marketKey: "player_points",
    statKey: "points",
    label: "Points",
  },
  rebounds: {
    marketKey: "player_rebounds",
    statKey: "rebounds",
    label: "Rebounds",
  },
  assists: {
    marketKey: "player_assists",
    statKey: "assists",
    label: "Assists",
  },
  pra: {
    marketKey: "player_points_rebounds_assists",
    statKey: "pra",
    label: "PRA",
  },
};

export function americanToImpliedProb(american: number) {
  if (american > 0) return (100 / (american + 100)) * 100;
  return (Math.abs(american) / (Math.abs(american) + 100)) * 100;
}

export function normalizePlayerName(name: string | null | undefined) {
  return (name ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/ jr$/g, "")
    .replace(/ sr$/g, "")
    .replace(/ ii$/g, "")
    .replace(/ iii$/g, "")
    .replace(/ iv$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPropMarketScore(oddsTaken: number | null, line: number | null) {
  if (oddsTaken === null) return 0;

  const implied = americanToImpliedProb(oddsTaken);

  let payoutFit = 0;
  if (oddsTaken >= -135 && oddsTaken <= +110) payoutFit = 22;
  else if (oddsTaken >= -150 && oddsTaken <= +130) payoutFit = 14;
  else payoutFit = 8;

  const hitFit = 100 - Math.abs(implied - 54);
  const lineFit = line === null ? 0 : 10;

  return Number((hitFit * 0.35 + payoutFit + lineFit).toFixed(1));
}

export function parsePropsFromEventOdds(eventOdds: any, propType: string) {
  const bookmakers = eventOdds?.bookmakers ?? [];
  const book = bookmakers[0];
  if (!book) return [];

  const marketKey = PROP_MARKET_MAP[propType]?.marketKey;
  const market = book.markets?.find((m: any) => m.key === marketKey);
  if (!market) return [];

  const grouped = new Map<string, any>();

  for (const outcome of market.outcomes ?? []) {
    const rawPlayer =
      outcome.description ??
      outcome.participant ??
      outcome.player ??
      outcome.name ??
      "";

    const rawSide =
      outcome.name === "Over" || outcome.name === "Under"
        ? outcome.name
        : outcome.label === "Over" || outcome.label === "Under"
        ? outcome.label
        : null;

    const playerName =
      rawSide === "Over" || rawSide === "Under"
        ? rawPlayer
        : outcome.description ?? rawPlayer;

    const side =
      rawSide ??
      (String(outcome.name).toLowerCase().includes("over")
        ? "Over"
        : String(outcome.name).toLowerCase().includes("under")
        ? "Under"
        : null);

    if (!playerName || !side) continue;

    const line = outcome.point ?? null;
    const key = `${normalizePlayerName(playerName)}|${line ?? "na"}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        external_event_id: eventOdds.id,
        commence_time: eventOdds.commence_time ?? null,
        game_label: `${eventOdds.away_team} @ ${eventOdds.home_team}`,
        home_team: eventOdds.home_team,
        away_team: eventOdds.away_team,
        player_name: playerName,
        line,
        over_odds: null,
        under_odds: null,
        prop_type: propType,
      });
    }

    const row = grouped.get(key);

    if (side === "Over") row.over_odds = outcome.price ?? null;
    if (side === "Under") row.under_odds = outcome.price ?? null;
  }

  const rows = Array.from(grouped.values()).map((row: any) => {
    const bestSide =
      row.over_odds === null
        ? "Under"
        : row.under_odds === null
        ? "Over"
        : americanToImpliedProb(row.over_odds) >= americanToImpliedProb(row.under_odds)
        ? "Over"
        : "Under";

    const oddsTaken = bestSide === "Over" ? row.over_odds : row.under_odds;
    const score = buildPropMarketScore(oddsTaken, row.line);

    return {
      ...row,
      official_side: bestSide,
      official_odds: oddsTaken,
      market_score: score,
      signal: "Market favorite",
    };
  });

  return rows.sort((a: any, b: any) => b.market_score - a.market_score);
}