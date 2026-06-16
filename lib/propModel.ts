export const PROP_MARKET_MAP = {
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
  threes: {
    marketKey: "player_threes",
    statKey: "threes",
    label: "3-Pointers",
  },
  blocks: {
    marketKey: "player_blocks",
    statKey: "blocks",
    label: "Blocks",
  },
  steals: {
    marketKey: "player_steals",
    statKey: "steals",
    label: "Steals",
  },
  blocks_steals: {
    marketKey: "player_blocks_steals",
    statKey: "blocks_steals",
    label: "Blocks + Steals",
  },
  turnovers: {
    marketKey: "player_turnovers",
    statKey: "turnovers",
    label: "Turnovers",
  },
  points_rebounds: {
    marketKey: "player_points_rebounds",
    statKey: "points_rebounds",
    label: "Points + Rebounds",
  },
  points_assists: {
    marketKey: "player_points_assists",
    statKey: "points_assists",
    label: "Points + Assists",
  },
  rebounds_assists: {
    marketKey: "player_rebounds_assists",
    statKey: "rebounds_assists",
    label: "Rebounds + Assists",
  },
  field_goals: {
    marketKey: "player_field_goals",
    statKey: "field_goals_made",
    label: "Field Goals",
  },
  free_throws_made: {
    marketKey: "player_frees_made",
    statKey: "free_throws_made",
    label: "Free Throws Made",
  },
  free_throws_attempted: {
    marketKey: "player_frees_attempts",
    statKey: "free_throws_attempted",
    label: "Free Throws Attempted",
  },
} as const;

export type NbaPropType = keyof typeof PROP_MARKET_MAP;
export const NBA_PROP_TYPES = Object.keys(PROP_MARKET_MAP) as NbaPropType[];

export function isNbaPropType(value: string | null | undefined): value is NbaPropType {
  return Boolean(value && value in PROP_MARKET_MAP);
}

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

function buildGroupedPropRows(eventOdds: any, propType: string) {
  const bookmakers = eventOdds?.bookmakers ?? [];
  const book = bookmakers[0];
  if (!book) return [];
  if (!isNbaPropType(propType)) return [];

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

  return Array.from(grouped.values());
}

export function parsePropMenuFromEventOdds(eventOdds: any, propType: string) {
  return buildGroupedPropRows(eventOdds, propType);
}

export function parsePropsFromEventOdds(eventOdds: any, propType: string) {
  const rows = buildGroupedPropRows(eventOdds, propType).flatMap((row: any) => {
    const sideRows = [
      { side: "Over" as const, odds: row.over_odds },
      { side: "Under" as const, odds: row.under_odds },
    ].filter((entry) => entry.odds !== null && entry.odds !== undefined);

    const favoriteSide =
      row.over_odds === null || row.over_odds === undefined
        ? "Under"
        : row.under_odds === null || row.under_odds === undefined
        ? "Over"
        : americanToImpliedProb(row.over_odds) >= americanToImpliedProb(row.under_odds)
        ? "Over"
        : "Under";

    return sideRows.map((entry) => ({
      ...row,
      official_side: entry.side,
      official_odds: entry.odds,
      market_score: buildPropMarketScore(entry.odds, row.line),
      signal: entry.side === favoriteSide ? "Market favorite" : "Market underdog side",
    }));
  });

  return rows.sort((a: any, b: any) => b.market_score - a.market_score);
}
