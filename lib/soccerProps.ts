import type { SoccerCompetitionKey, SoccerOddsGame } from "@/lib/soccerModel";

export type SoccerTrackedPropCategory =
  | "team"
  | "corners"
  | "cards"
  | "shots"
  | "goals"
  | "keeper"
  | "defense";

export type SoccerPropMarketDefinition = {
  key: string;
  label: string;
  category: SoccerTrackedPropCategory;
  priority: "core" | "watch";
};

export type SoccerPropSnapshotRow = {
  snapshotId: string;
  competition: SoccerCompetitionKey;
  businessDate: string;
  eventId: string;
  gameLabel: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  bookmaker: string;
  marketKey: string;
  marketLabel: string;
  category: SoccerTrackedPropCategory;
  playerName: string | null;
  side: string;
  point: number | null;
  price: number;
  lastUpdate: string | null;
  capturedAt: string;
};

export type SoccerCoverageCandidate = {
  id: string;
  competition: SoccerCompetitionKey;
  businessDate: string;
  eventId: string;
  gameLabel: string;
  commenceTime: string;
  coverage: "home_or_draw" | "away_or_draw" | "home_or_away";
  label: string;
  bookSide: string | null;
  bookOdds: number | null;
  manualLegs: Array<{
    side: string;
    odds: number;
    stakeShare: number;
  }>;
  manualProfitIfFirstWins: number | null;
  manualProfitIfSecondWins: number | null;
  bookProfitPerUnit: number | null;
  betterPrice: "double_chance" | "manual_split" | "unavailable";
  coveredOutcomes: string[];
  uncoveredOutcome: string;
  notes: string[];
};

export type SoccerPropSnapshot = {
  competition: SoccerCompetitionKey;
  businessDate: string;
  capturedAt: string;
  games: Array<{
    eventId: string;
    gameLabel: string;
    commenceTime: string;
    availableMarketKeys: string[];
    syncedMarketKeys: string[];
    reusedFromSnapshot?: boolean;
    skippedReason?: string;
  }>;
  rows: SoccerPropSnapshotRow[];
  coverageCandidates?: SoccerCoverageCandidate[];
};

export const SOCCER_TRACKED_PROP_MARKETS: SoccerPropMarketDefinition[] = [
  { key: "btts", label: "Both Teams To Score", category: "team", priority: "core" },
  { key: "double_chance", label: "Double Chance", category: "team", priority: "core" },
  { key: "draw_no_bet", label: "Draw No Bet", category: "team", priority: "core" },
  { key: "alternate_spreads", label: "Alternate Handicap", category: "team", priority: "watch" },
  { key: "alternate_team_totals", label: "Alternate Team Totals", category: "team", priority: "watch" },
  { key: "alternate_spreads_corners", label: "Corner Handicap", category: "corners", priority: "core" },
  { key: "alternate_totals_corners", label: "Total Corners", category: "corners", priority: "core" },
  { key: "alternate_totals_corners_h1", label: "First Half Corners", category: "corners", priority: "watch" },
  { key: "alternate_spreads_cards", label: "Card Handicap", category: "cards", priority: "core" },
  { key: "alternate_totals_cards", label: "Total Cards", category: "cards", priority: "core" },
  { key: "player_to_receive_card", label: "Player Card", category: "cards", priority: "core" },
  { key: "player_to_receive_red_card", label: "Player Red Card", category: "cards", priority: "watch" },
  { key: "player_shots_alternate", label: "Player Shots", category: "shots", priority: "core" },
  { key: "player_shots_on_target_alternate", label: "Player Shots On Target", category: "shots", priority: "core" },
  { key: "player_goal_scorer_anytime", label: "Anytime Goalscorer", category: "goals", priority: "core" },
  { key: "player_goals_alternate", label: "Player Goals", category: "goals", priority: "watch" },
  { key: "player_first_goal_scorer", label: "First Goalscorer", category: "goals", priority: "watch" },
  { key: "player_last_goal_scorer", label: "Last Goalscorer", category: "goals", priority: "watch" },
  { key: "player_goalie_saves_alternate", label: "Goalkeeper Saves", category: "keeper", priority: "core" },
  { key: "player_tackles_alternate", label: "Player Tackles", category: "defense", priority: "core" },
  { key: "player_fouls", label: "Player Fouls", category: "defense", priority: "core" },
];

export const SOCCER_CORE_PROP_MARKET_KEYS = SOCCER_TRACKED_PROP_MARKETS
  .filter((market) => market.priority === "core")
  .map((market) => market.key);

const marketByKey = new Map(SOCCER_TRACKED_PROP_MARKETS.map((market) => [market.key, market]));

export function getSoccerPropSnapshotCacheKey(competition: SoccerCompetitionKey, businessDate: string) {
  return `soccer_prop_snapshot_${competition}_${businessDate}`;
}

export function getSoccerPropMarketDefinition(marketKey: string) {
  return marketByKey.get(marketKey) ?? {
    key: marketKey,
    label: marketKey.replace(/_/g, " "),
    category: "team" as const,
    priority: "watch" as const,
  };
}

export function labelForSoccerGame(game: SoccerOddsGame) {
  return `${game.away_team} @ ${game.home_team}`;
}

export function getSoccerPropCategoryLabel(category: SoccerTrackedPropCategory) {
  if (category === "team") return "Team / Match";
  if (category === "corners") return "Corners";
  if (category === "cards") return "Cards";
  if (category === "shots") return "Shots";
  if (category === "goals") return "Goals";
  if (category === "keeper") return "Keeper";
  return "Defensive Work";
}
