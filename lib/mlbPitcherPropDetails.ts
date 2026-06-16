import { getCachedData, setCachedData } from "@/lib/cache";

export type MlbPitcherPropPickLike = {
  id?: number | null;
  pick_date?: string | null;
  market_type?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  game_start_time?: string | null;
  player_name?: string | null;
  edge_label?: string | null;
  status?: string | null;
  final_stat?: number | null;
};

type MlbScheduleResponse = {
  dates?: Array<{
    games?: Array<{
      gamePk?: number;
      gameDate?: string;
      teams?: {
        home?: { team?: { name?: string } };
        away?: { team?: { name?: string } };
      };
    }>;
  }>;
};

type MlbBoxscorePlayerStats = {
  inningsPitched?: string | number;
  pitchesThrown?: number | string;
  numberOfPitches?: number | string;
  strikeOuts?: number | string;
};

type MlbBoxscoreResponse = {
  teams?: {
    home?: {
      players?: Record<
        string,
        {
          person?: { fullName?: string };
          stats?: {
            pitching?: MlbBoxscorePlayerStats;
          };
        }
      >;
    };
    away?: {
      players?: Record<
        string,
        {
          person?: { fullName?: string };
          stats?: {
            pitching?: MlbBoxscorePlayerStats;
          };
        }
      >;
    };
  };
};

type MlbLiveFeedResponse = {
  gameData?: {
    status?: {
      abstractGameState?: string;
      detailedState?: string;
    };
  };
  liveData?: {
    boxscore?: MlbBoxscoreResponse;
  };
};

export type MlbPitcherPropDetails = {
  projectedInnings: number | null;
  finalInningsPitched: string | null;
  finalPitchesThrown: number | null;
  finalStrikeouts: number | null;
  updatedAt?: string;
};

function normalizeTeamName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

function normalizePlayerName(name: string | null | undefined) {
  return (name ?? "")
    .split(" - ")[0]
    ?.trim()
    .toLowerCase();
}

function isMlbGameFinal(feed: MlbLiveFeedResponse | null) {
  const abstractState = feed?.gameData?.status?.abstractGameState?.toLowerCase() ?? "";
  const detailedState = feed?.gameData?.status?.detailedState?.toLowerCase() ?? "";

  return abstractState === "final" || abstractState === "completed" || detailedState.includes("final");
}

function toNullableNumber(value: number | string | undefined) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractProjectedPitcherInnings(edgeLabel: string | null | undefined) {
  const match = (edgeLabel ?? "").match(/proj\s+(\d+(?:\.\d+)?)\s+IP/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getPitcherPropResultDetailsFromFeed(
  feed: MlbLiveFeedResponse | null,
  playerName: string | null | undefined
) {
  const players = [
    ...Object.values(feed?.liveData?.boxscore?.teams?.home?.players ?? {}),
    ...Object.values(feed?.liveData?.boxscore?.teams?.away?.players ?? {}),
  ];

  const player = players.find(
    (entry) => normalizePlayerName(entry.person?.fullName) === normalizePlayerName(playerName)
  );
  const pitching = player?.stats?.pitching;

  if (!pitching) {
    return {
      finalInningsPitched: null,
      finalPitchesThrown: null,
      finalStrikeouts: null,
    };
  }

  return {
    finalInningsPitched:
      pitching.inningsPitched === undefined || pitching.inningsPitched === null
        ? null
        : String(pitching.inningsPitched),
    finalPitchesThrown: toNullableNumber(pitching.pitchesThrown ?? pitching.numberOfPitches),
    finalStrikeouts: toNullableNumber(pitching.strikeOuts),
  };
}

async function fetchMlbGamePkForPick(pick: MlbPitcherPropPickLike) {
  if (!pick.home_team || !pick.away_team || !pick.game_start_time) return null;

  const gameDate = new Date(pick.game_start_time);
  const etDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(gameDate);
  const searchDates = Array.from(
    new Set([pick.pick_date, etDate, gameDate.toISOString().slice(0, 10)].filter(Boolean))
  ) as string[];

  const matching = [];
  for (const date of searchDates) {
    const data = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`, {
      cache: "no-store",
    }).then((res) => res.json() as Promise<MlbScheduleResponse>);

    const games = data.dates?.flatMap((entry) => entry.games ?? []) ?? [];
    matching.push(
      ...games.filter(
        (game) =>
          normalizeTeamName(game.teams?.home?.team?.name) === normalizeTeamName(pick.home_team) &&
          normalizeTeamName(game.teams?.away?.team?.name) === normalizeTeamName(pick.away_team)
      )
    );
  }

  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0]?.gamePk ?? null;

  const pickStart = new Date(pick.game_start_time).getTime();
  return (
    matching
      .map((game) => ({
        gamePk: game.gamePk ?? null,
        diff: Math.abs(pickStart - new Date(game.gameDate ?? pick.game_start_time ?? 0).getTime()),
      }))
      .sort((a, b) => a.diff - b.diff)[0]?.gamePk ?? null
  );
}

async function fetchMlbLiveFeed(gamePk: number) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`MLB live feed failed for game ${gamePk}: ${res.status}`);
  }

  return res.json() as Promise<MlbLiveFeedResponse>;
}

export async function getMlbPitcherPropDetails(pick: MlbPitcherPropPickLike) {
  if (pick.market_type !== "pitcher_strikeouts") return null;

  const projectedInnings = extractProjectedPitcherInnings(pick.edge_label);
  const baseDetails: MlbPitcherPropDetails = {
    projectedInnings,
    finalInningsPitched: null,
    finalPitchesThrown: null,
    finalStrikeouts:
      pick.final_stat === null || pick.final_stat === undefined ? null : Number(pick.final_stat),
  };

  if (!pick.id) return baseDetails;

  const cacheKey = `mlb_pitcher_prop_details_${pick.id}`;
  const cached = await getCachedData(cacheKey);
  const cachedData = (cached?.data as Partial<MlbPitcherPropDetails> | null) ?? null;
  if (cachedData) {
    return {
      ...baseDetails,
      ...cachedData,
      projectedInnings,
      finalStrikeouts:
        cachedData.finalStrikeouts === null || cachedData.finalStrikeouts === undefined
          ? baseDetails.finalStrikeouts
          : cachedData.finalStrikeouts,
    };
  }

  if (!pick.status || pick.status === "pending") return baseDetails;

  const gamePk = await fetchMlbGamePkForPick(pick);
  if (!gamePk) return baseDetails;

  const feed = await fetchMlbLiveFeed(gamePk);
  if (!isMlbGameFinal(feed)) return baseDetails;

  const finalDetails = getPitcherPropResultDetailsFromFeed(feed, pick.player_name);
  const details: MlbPitcherPropDetails = {
    ...baseDetails,
    ...finalDetails,
    finalStrikeouts:
      finalDetails.finalStrikeouts === null || finalDetails.finalStrikeouts === undefined
        ? baseDetails.finalStrikeouts
        : finalDetails.finalStrikeouts,
    updatedAt: new Date().toISOString(),
  };

  await setCachedData(cacheKey, details);
  return details;
}
