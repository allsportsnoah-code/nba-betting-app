import { NextRequest, NextResponse } from "next/server";
import { setCachedData } from "@/lib/cache";
import { getExpectedMlbBusinessDate, type MlbOddsCacheDay } from "@/lib/mlbOddsCache";
import { requireSyncAccess } from "@/lib/ownerAuth";

type MlbScheduleGame = {
  gamePk?: number;
  gameDate?: string;
  teams?: {
    away?: { team?: { name?: string } };
    home?: { team?: { name?: string } };
  };
  status?: {
    abstractGameState?: string;
    detailedState?: string;
  };
};

type MlbScheduleResponse = {
  dates?: Array<{
    games?: MlbScheduleGame[];
  }>;
};

type MlbBoxscorePlayer = {
  person?: {
    fullName?: string;
  };
  stats?: {
    batting?: Record<string, string | number | undefined>;
    pitching?: Record<string, string | number | undefined>;
  };
};

type MlbFeedResponse = {
  gameData?: {
    status?: {
      abstractGameState?: string;
      detailedState?: string;
    };
  };
  liveData?: {
    linescore?: {
      teams?: {
        away?: { runs?: number };
        home?: { runs?: number };
      };
    };
    boxscore?: {
      teams?: {
        away?: {
          players?: Record<string, MlbBoxscorePlayer>;
        };
        home?: {
          players?: Record<string, MlbBoxscorePlayer>;
        };
      };
    };
  };
};

type PlayerPropResultRow = {
  gamePk: number;
  gameLabel: string;
  finalScore: string;
  playerName: string;
  team: string;
  opponent: string;
  teamSide: "away" | "home";
  role: "batter" | "pitcher";
  propResults: Record<string, number>;
  rawStats: Record<string, number | string | null>;
};

function normalizeDay(value: string | null): MlbOddsCacheDay {
  if (value === "tomorrow" || value === "yesterday") return value;
  return "today";
}

function getDateParam(req: NextRequest) {
  const explicitDate =
    req.nextUrl.searchParams.get("pickDate") ?? req.nextUrl.searchParams.get("date");
  if (explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) return explicitDate;

  return getExpectedMlbBusinessDate(normalizeDay(req.nextUrl.searchParams.get("day")));
}

function isFinalStatus(abstractState: string | undefined, detailedState: string | undefined) {
  const abstract = (abstractState ?? "").toLowerCase();
  const detailed = (detailedState ?? "").toLowerCase();
  return abstract === "final" || abstract === "completed" || detailed.includes("final");
}

function isPostponedStatus(abstractState: string | undefined, detailedState: string | undefined) {
  const abstract = (abstractState ?? "").toLowerCase();
  const detailed = (detailedState ?? "").toLowerCase();
  return (
    abstract.includes("postponed") ||
    detailed.includes("postponed") ||
    detailed.includes("cancelled") ||
    detailed.includes("canceled")
  );
}

function numericStat(stats: Record<string, string | number | undefined> | undefined, key: string) {
  const value = Number(stats?.[key] ?? NaN);
  return Number.isFinite(value) ? value : 0;
}

function nullableNumericStat(
  stats: Record<string, string | number | undefined> | undefined,
  key: string
) {
  const value = Number(stats?.[key] ?? NaN);
  return Number.isFinite(value) ? value : null;
}

function parseBaseballInnings(value: string | number | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  const [wholeRaw, partialRaw] = text.split(".");
  const whole = Number(wholeRaw);
  const partial = Number(partialRaw ?? "0");

  if (!Number.isFinite(whole) || !Number.isFinite(partial)) return null;
  return whole + partial / 3;
}

function pitcherOuts(stats: Record<string, string | number | undefined> | undefined) {
  const innings = parseBaseballInnings(stats?.inningsPitched);
  return innings === null ? null : Math.round(innings * 3);
}

function hasBattingAppearance(stats: Record<string, string | number | undefined> | undefined) {
  return (
    numericStat(stats, "atBats") > 0 ||
    numericStat(stats, "plateAppearances") > 0 ||
    numericStat(stats, "runs") > 0 ||
    numericStat(stats, "hits") > 0 ||
    numericStat(stats, "rbi") > 0 ||
    numericStat(stats, "totalBases") > 0 ||
    numericStat(stats, "baseOnBalls") > 0 ||
    numericStat(stats, "hitByPitch") > 0 ||
    numericStat(stats, "sacFlies") > 0
  );
}

function hasPitchingAppearance(stats: Record<string, string | number | undefined> | undefined) {
  const outs = pitcherOuts(stats);
  return (
    (outs !== null && outs > 0) ||
    numericStat(stats, "battersFaced") > 0 ||
    numericStat(stats, "strikeOuts") > 0 ||
    numericStat(stats, "pitchesThrown") > 0
  );
}

async function fetchMlbSchedule(date: string) {
  const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`MLB schedule failed for ${date}: ${response.status}`);
  }

  return response.json() as Promise<MlbScheduleResponse>;
}

async function fetchMlbFeed(gamePk: number) {
  const response = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`MLB live feed failed for game ${gamePk}: ${response.status}`);
  }

  return response.json() as Promise<MlbFeedResponse>;
}

function collectSideRows(params: {
  gamePk: number;
  gameLabel: string;
  finalScore: string;
  side: "away" | "home";
  team: string;
  opponent: string;
  players: Record<string, MlbBoxscorePlayer>;
}) {
  const rows: PlayerPropResultRow[] = [];

  for (const player of Object.values(params.players)) {
    const playerName = player.person?.fullName;
    if (!playerName) continue;

    const batting = player.stats?.batting;
    if (hasBattingAppearance(batting)) {
      const hits = numericStat(batting, "hits");
      const runs = numericStat(batting, "runs");
      const rbis = numericStat(batting, "rbi");
      const totalBases = numericStat(batting, "totalBases");

      rows.push({
        gamePk: params.gamePk,
        gameLabel: params.gameLabel,
        finalScore: params.finalScore,
        playerName,
        team: params.team,
        opponent: params.opponent,
        teamSide: params.side,
        role: "batter",
        propResults: {
          batter_hits: hits,
          batter_total_bases: totalBases,
          batter_rbis: rbis,
          batter_runs_scored: runs,
          batter_hits_runs_rbis: hits + runs + rbis,
        },
        rawStats: {
          atBats: nullableNumericStat(batting, "atBats"),
          plateAppearances: nullableNumericStat(batting, "plateAppearances"),
          hits,
          totalBases,
          runs,
          rbi: rbis,
          homeRuns: nullableNumericStat(batting, "homeRuns"),
          baseOnBalls: nullableNumericStat(batting, "baseOnBalls"),
          strikeOuts: nullableNumericStat(batting, "strikeOuts"),
        },
      });
    }

    const pitching = player.stats?.pitching;
    if (hasPitchingAppearance(pitching)) {
      const outs = pitcherOuts(pitching) ?? 0;
      const strikeOuts = numericStat(pitching, "strikeOuts");

      rows.push({
        gamePk: params.gamePk,
        gameLabel: params.gameLabel,
        finalScore: params.finalScore,
        playerName,
        team: params.team,
        opponent: params.opponent,
        teamSide: params.side,
        role: "pitcher",
        propResults: {
          pitcher_strikeouts: strikeOuts,
          pitcher_outs: outs,
        },
        rawStats: {
          inningsPitched: pitching?.inningsPitched ?? null,
          outs,
          strikeOuts,
          pitchesThrown: nullableNumericStat(pitching, "pitchesThrown"),
          battersFaced: nullableNumericStat(pitching, "battersFaced"),
          hits: nullableNumericStat(pitching, "hits"),
          earnedRuns: nullableNumericStat(pitching, "earnedRuns"),
          baseOnBalls: nullableNumericStat(pitching, "baseOnBalls"),
        },
      });
    }
  }

  return rows;
}

function collectGameRows(game: MlbScheduleGame, feed: MlbFeedResponse) {
  const gamePk = game.gamePk;
  const awayTeam = game.teams?.away?.team?.name ?? "Away";
  const homeTeam = game.teams?.home?.team?.name ?? "Home";
  const awayRuns = feed.liveData?.linescore?.teams?.away?.runs ?? 0;
  const homeRuns = feed.liveData?.linescore?.teams?.home?.runs ?? 0;

  if (!gamePk) return [];

  const gameLabel = `${awayTeam} @ ${homeTeam}`;
  const finalScore = `${awayTeam} ${awayRuns} - ${homeTeam} ${homeRuns}`;
  const boxscore = feed.liveData?.boxscore?.teams;

  return [
    ...collectSideRows({
      gamePk,
      gameLabel,
      finalScore,
      side: "away",
      team: awayTeam,
      opponent: homeTeam,
      players: boxscore?.away?.players ?? {},
    }),
    ...collectSideRows({
      gamePk,
      gameLabel,
      finalScore,
      side: "home",
      team: homeTeam,
      opponent: awayTeam,
      players: boxscore?.home?.players ?? {},
    }),
  ];
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const date = getDateParam(req);
    const schedule = await fetchMlbSchedule(date);
    const games = schedule.dates?.flatMap((entry) => entry.games ?? []) ?? [];
    const finalGames = [];
    const pendingGames = [];
    const postponedGames = [];
    const rows: PlayerPropResultRow[] = [];
    const errors: Array<{ gamePk: number | null; gameLabel: string; error: string }> = [];

    for (const game of games) {
      const gameLabel = `${game.teams?.away?.team?.name ?? "Away"} @ ${game.teams?.home?.team?.name ?? "Home"}`;
      const scheduleIsFinal = isFinalStatus(game.status?.abstractGameState, game.status?.detailedState);

      if (isPostponedStatus(game.status?.abstractGameState, game.status?.detailedState)) {
        postponedGames.push({
          gamePk: game.gamePk ?? null,
          gameLabel,
          status: game.status?.detailedState ?? game.status?.abstractGameState ?? "Postponed",
        });
        continue;
      }

      if (!game.gamePk || !scheduleIsFinal) {
        pendingGames.push({
          gamePk: game.gamePk ?? null,
          gameLabel,
          status: game.status?.detailedState ?? game.status?.abstractGameState ?? "Scheduled",
        });
        continue;
      }

      try {
        const feed = await fetchMlbFeed(game.gamePk);
        if (!isFinalStatus(feed.gameData?.status?.abstractGameState, feed.gameData?.status?.detailedState)) {
          pendingGames.push({
            gamePk: game.gamePk,
            gameLabel,
            status: feed.gameData?.status?.detailedState ?? feed.gameData?.status?.abstractGameState ?? "In Progress",
          });
          continue;
        }

        finalGames.push({
          gamePk: game.gamePk,
          gameLabel,
          status: feed.gameData?.status?.detailedState ?? "Final",
        });
        rows.push(...collectGameRows(game, feed));
      } catch (error) {
        errors.push({
          gamePk: game.gamePk ?? null,
          gameLabel,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const payload = {
      ok: true,
      date,
      updatedAt: new Date().toISOString(),
      totalGames: games.length,
      finalGames,
      pendingGames,
      postponedGames,
      errorGames: errors,
      playerPropRows: rows,
    };
    const cacheKey = `mlb_postgame_player_props_${date}`;

    await setCachedData(cacheKey, payload);
    await setCachedData("mlb_postgame_player_props_latest", payload);

    return NextResponse.json({
      ok: true,
      date,
      cacheKey,
      totalGames: games.length,
      finalGameCount: finalGames.length,
      pendingGameCount: pendingGames.length,
      postponedGameCount: postponedGames.length,
      errorGameCount: errors.length,
      playerRowCount: rows.length,
      finalGames,
      pendingGames,
      postponedGames,
      errorGames: errors,
      data: req.nextUrl.searchParams.get("includeRows") === "1" ? rows : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
