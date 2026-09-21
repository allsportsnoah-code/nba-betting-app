import type { NflPropMarket } from "@/lib/nflPropsModel";
import type { NflOddsGame } from "@/lib/nflOddsCache";

const PRIZEPICKS_STAT_MAP: Record<string, string> = {
  "Pass Yards": "player_pass_yds",
  "Pass Attempts": "player_pass_attempts",
  "Pass Completions": "player_pass_completions",
  "Pass TDs": "player_pass_tds",
  "Rush Yards": "player_rush_yds",
  "Rush Attempts": "player_rush_attempts",
  "Receiving Yards": "player_reception_yds",
  "Receptions": "player_receptions",
  "Player Touchdowns": "player_anytime_td",
  "Kicking Points": "player_kicking_points",
};

const ABBR_TO_TEAM: Record<string, string> = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LV: "Las Vegas Raiders",
  LAC: "Los Angeles Chargers",
  LAR: "Los Angeles Rams",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SF: "San Francisco 49ers",
  SEA: "Seattle Seahawks",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
};

type PpProjection = {
  id: string;
  type: string;
  attributes: {
    stat_type: string;
    line_score: number;
    description: string;
    allowed_wager_types: string;
    end_time: string;
    in_game: boolean;
    is_live: boolean;
  };
  relationships: {
    new_player?: { data: { id: string } | null };
    game?: { data: { id: string } | null };
  };
};

type PpIncluded = {
  type: string;
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: Record<string, any>;
};

type PpResponse = {
  data: PpProjection[];
  included: PpIncluded[];
};

export async function fetchPrizePicksProps(
  games: NflOddsGame[]
): Promise<{ byGameId: Map<string, NflPropMarket[]>; totalProjections: number; error?: string }> {
  let raw: PpResponse;
  try {
    const res = await fetch(
      "https://partner-api.prizepicks.com/projections?league_id=9&per_page=500&single_stat=true",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
          Referer: "https://prizepicks.com",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) {
      return { byGameId: new Map(), totalProjections: 0, error: `PrizePicks returned ${res.status}` };
    }
    raw = (await res.json()) as PpResponse;
  } catch (e) {
    return { byGameId: new Map(), totalProjections: 0, error: e instanceof Error ? e.message : "fetch failed" };
  }

  // Build player + game lookups from included
  const playerById = new Map<string, { name: string; team: string; position: string }>();
  for (const item of raw.included ?? []) {
    if (item.type === "new_player") {
      playerById.set(item.id, {
        name: String(item.attributes.name ?? ""),
        team: String(item.attributes.team ?? ""),
        position: String(item.attributes.position ?? ""),
      });
    }
  }

  // Build a lookup: full team name → our NflOddsGame
  const teamToGame = new Map<string, NflOddsGame>();
  for (const g of games) {
    teamToGame.set(g.home_team, g);
    teamToGame.set(g.away_team, g);
  }

  // Accumulate: ourGameId → marketKey → player → { line, wagerTypes }
  type PlayerEntry = { line: number; wagerTypes: string };
  const acc = new Map<string, Map<string, Map<string, PlayerEntry>>>();

  let totalProjections = 0;

  for (const proj of raw.data ?? []) {
    const { stat_type, line_score, in_game, is_live, allowed_wager_types } = proj.attributes;
    if (in_game || is_live) continue;
    if (!line_score) continue;

    const marketKey = PRIZEPICKS_STAT_MAP[stat_type];
    if (!marketKey) continue;

    const playerId = proj.relationships.new_player?.data?.id;
    if (!playerId) continue;

    const player = playerById.get(playerId);
    if (!player?.name || !player?.team) continue;

    const fullTeam = ABBR_TO_TEAM[player.team];
    if (!fullTeam) continue;

    const ourGame = teamToGame.get(fullTeam);
    if (!ourGame) continue;

    if (!acc.has(ourGame.id)) acc.set(ourGame.id, new Map());
    const marketMap = acc.get(ourGame.id)!;

    if (!marketMap.has(marketKey)) marketMap.set(marketKey, new Map());
    const playerMap = marketMap.get(marketKey)!;

    // Keep only one line per player per market (last write wins; they're the same)
    playerMap.set(player.name, { line: line_score, wagerTypes: allowed_wager_types ?? "over" });
    totalProjections++;
  }

  // Convert to NflPropMarket[]
  const byGameId = new Map<string, NflPropMarket[]>();

  for (const [gameId, marketMap] of acc) {
    const markets: NflPropMarket[] = [];
    for (const [marketKey, playerMap] of marketMap) {
      const outcomes: NflPropMarket["outcomes"] = [];
      for (const [playerName, { line, wagerTypes }] of playerMap) {
        // player_anytime_td uses "yes"/"no" direction, not "over"/"under"
        const sideName = marketKey === "player_anytime_td" ? "Yes" : "Over";
        outcomes.push({ name: sideName, description: playerName, price: -110, point: line });
        if (wagerTypes === "both" && marketKey !== "player_anytime_td") {
          outcomes.push({ name: "Under", description: playerName, price: -110, point: line });
        }
      }
      if (outcomes.length > 0) {
        markets.push({ key: marketKey as NflPropMarket["key"], outcomes });
      }
    }
    if (markets.length > 0) byGameId.set(gameId, markets);
  }

  return { byGameId, totalProjections };
}
