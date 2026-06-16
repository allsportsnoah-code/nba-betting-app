import { NextRequest, NextResponse } from "next/server";
import { getCachedData, setCachedData } from "@/lib/cache";
import { analyzeNbaGameForLearning } from "@/lib/nbaGameReview";
import { analyzeMlbPickGameReview } from "@/lib/mlbGameReview";
import type {
  NbaBoardRecheckPick,
  NbaBoardRecheckPickResult,
  NbaBoardRecheckResultComparison,
  NbaInjurySyncData,
  NbaInjuryTriggerPlayer,
  NbaInjuryTriggerPlayerResult,
} from "@/lib/nbaInjuries";
import type { MlbOddsGame } from "@/lib/mlbModel";
import { getPitcherPropResultDetailsFromFeed } from "@/lib/mlbPitcherPropDetails";
import { isMlbFirstFiveMarketType, isMlbTeamTotalMarketType } from "@/lib/mlbTeamMarketExpansion";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { settleUnits } from "@/lib/units";
import { recordManualSyncUsage, requireSyncAccess } from "@/lib/ownerAuth";
import { getRequestUrl } from "@/lib/requestOrigin";

type PendingPick = {
  id: number;
  pick_date?: string | null;
  sport: string;
  market_scope: string | null;
  market_type: string | null;
  status: string | null;
  game_label?: string | null;
  home_team: string | null;
  away_team: string | null;
  side: string | null;
  line_taken: number | null;
  odds_taken: number | null;
  edge_label?: string | null;
  stake_units: number | null;
  game_start_time: string | null;
  player_name: string | null;
  prop_stat_key: string | null;
  final_score?: string | null;
};

type RecheckOutcomePickRow = {
  id: number;
  pick_date?: string | null;
  game_label?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  status?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  units_result?: number | null;
  game_start_time?: string | null;
};

type RecheckCacheRow = {
  cache_key: string;
  data: NbaInjurySyncData | null;
};

type EspnNbaCompetitor = {
  homeAway?: string;
  score?: string;
  team?: {
    displayName?: string;
    shortDisplayName?: string;
    abbreviation?: string;
  };
};

type EspnNbaCompetition = {
  competitors?: EspnNbaCompetitor[];
  status?: {
    type?: {
      completed?: boolean;
      detail?: string;
      state?: string;
      name?: string;
    };
  };
};

type EspnNbaEvent = {
  id?: string;
  date?: string;
  competitions?: EspnNbaCompetition[];
};

type EspnNbaScoreboardResponse = {
  events?: EspnNbaEvent[];
};

type EspnSoccerCompetitor = {
  homeAway?: string;
  score?: string;
  team?: {
    displayName?: string;
    shortDisplayName?: string;
    abbreviation?: string;
  };
};

type EspnSoccerCompetition = {
  competitors?: EspnSoccerCompetitor[];
  status?: {
    type?: {
      completed?: boolean;
      detail?: string;
      shortDetail?: string;
      state?: string;
      name?: string;
      description?: string;
    };
  };
};

type EspnSoccerEvent = {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  competitions?: EspnSoccerCompetition[];
};

type EspnSoccerScoreboardResponse = {
  events?: EspnSoccerEvent[];
};

type EspnNbaAthlete = {
  athlete?: {
    displayName?: string;
  };
  didNotPlay?: boolean;
  stats?: string[];
};

type EspnNbaPlayerStatGroup = {
  keys?: string[];
  athletes?: EspnNbaAthlete[];
};

type EspnNbaBoxscoreTeam = {
  statistics?: EspnNbaPlayerStatGroup[];
};

type EspnNbaSummaryResponse = {
  boxscore?: {
    players?: EspnNbaBoxscoreTeam[];
  };
};

type MlbScheduleGame = {
  gamePk?: number;
  gameDate?: string;
  teams?: {
    home?: { team?: { name?: string } };
    away?: { team?: { name?: string } };
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

type MlbScheduledGameMatch = {
  gamePk: number | null;
  abstractState: string;
  detailedState: string;
};

type MlbBoxscoreResponse = {
  teams?: {
    home?: {
      players?: Record<
        string,
        {
          person?: { fullName?: string };
          stats?: {
            batting?: Record<string, number | string | undefined>;
            pitching?: Record<string, number | string | undefined>;
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
            batting?: Record<string, number | string | undefined>;
            pitching?: Record<string, number | string | undefined>;
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
    linescore?: {
      currentInning?: number;
      innings?: Array<{
        home?: { runs?: number };
        away?: { runs?: number };
      }>;
      teams?: {
        home?: { runs?: number };
        away?: { runs?: number };
      };
    };
    boxscore?: MlbBoxscoreResponse;
  };
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

function normalizeLookupText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeSoccerTeamName(value: string | null | undefined) {
  return normalizeLookupText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(fc|cf|sc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function soccerTeamMatches(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeSoccerTeamName(left);
  const normalizedRight = normalizeSoccerTeamName(right);
  const compactLeft = normalizedLeft.replace(/\s+/g, "");
  const compactRight = normalizedRight.replace(/\s+/g, "");

  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight || compactLeft === compactRight) return true;
  return normalizedLeft.length > 4 && normalizedRight.length > 4
    ? normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
    : false;
}

function parseBaseballInnings(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const [wholePart, outPart = "0"] = String(value).split(".");
  const whole = Number(wholePart);
  const outs = Number(outPart.slice(0, 1) || 0);

  if (!Number.isFinite(whole) || !Number.isFinite(outs)) return null;
  return whole + Math.min(Math.max(outs, 0), 2) / 3;
}

function getBoxscoreStatValue(stats: Record<string, number | string | undefined> | undefined, key: string) {
  const value = Number(stats?.[key] ?? NaN);
  return Number.isFinite(value) ? value : null;
}

function shouldRedirectAfterNativeSubmit(req: NextRequest) {
  return req.nextUrl.searchParams.get("native") === "1";
}

function getNativeReturnUrl(req: NextRequest) {
  const referer = req.headers.get("referer");
  if (referer) return referer;

  return getRequestUrl(req, "/");
}

function gradeResponse(
  req: NextRequest,
  payload: {
    ok: boolean;
    updated?: number;
    checked?: number;
    removedFromSlate?: number;
    message?: string;
    error?: string;
  },
  init?: ResponseInit
) {
  if (!shouldRedirectAfterNativeSubmit(req)) {
    return NextResponse.json(payload, init);
  }

  const target = new URL(getNativeReturnUrl(req));
  target.searchParams.set("gradeStatus", payload.ok ? "done" : "error");

  if (payload.updated !== undefined) {
    target.searchParams.set("graded", String(payload.updated));
  }

  if (payload.error) {
    target.searchParams.set("gradeError", payload.error.slice(0, 120));
  }

  return NextResponse.redirect(target, { status: 303 });
}

function gradeSpreadPick(params: {
  selectedTeam: string;
  homeTeam: string;
  homeScore: number;
  awayScore: number;
  lineTaken: number;
}) {
  const { selectedTeam, homeTeam, homeScore, awayScore, lineTaken } = params;

  const selectedIsHome = normalizeTeamName(selectedTeam) === normalizeTeamName(homeTeam);
  const selectedScore = selectedIsHome ? homeScore : awayScore;
  const opponentScore = selectedIsHome ? awayScore : homeScore;
  const resultValue = selectedScore - opponentScore + lineTaken;

  if (resultValue > 0) return "win" as const;
  if (resultValue < 0) return "loss" as const;
  return "push" as const;
}

function gradeMoneylinePick(params: {
  selectedTeam: string;
  homeTeam: string;
  homeScore: number;
  awayScore: number;
}) {
  const { selectedTeam, homeTeam, homeScore, awayScore } = params;

  const selectedIsHome = normalizeTeamName(selectedTeam) === normalizeTeamName(homeTeam);
  const selectedScore = selectedIsHome ? homeScore : awayScore;
  const opponentScore = selectedIsHome ? awayScore : homeScore;

  if (selectedScore > opponentScore) return "win" as const;
  if (selectedScore < opponentScore) return "loss" as const;
  return "push" as const;
}

function gradeSoccerMoneylinePick(params: {
  side: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}) {
  const side = params.side.trim();
  const isDrawPick = normalizeLookupText(side) === "draw";

  if (params.homeScore === params.awayScore) {
    return isDrawPick ? "win" as const : "loss" as const;
  }

  if (isDrawPick) return "loss" as const;

  const winner = params.homeScore > params.awayScore ? params.homeTeam : params.awayTeam;
  return soccerTeamMatches(side, winner) ? "win" as const : "loss" as const;
}

function gradeTotalPick(params: {
  side: string;
  lineTaken: number;
  homeScore: number;
  awayScore: number;
}) {
  const totalScore = params.homeScore + params.awayScore;
  const wantsOver = params.side.trim().toLowerCase().startsWith("over");

  if (totalScore === params.lineTaken) return "push" as const;
  if (wantsOver) return totalScore > params.lineTaken ? "win" as const : "loss" as const;
  return totalScore < params.lineTaken ? "win" as const : "loss" as const;
}

function gradeTeamTotalPick(params: {
  selectedTeam: string;
  homeTeam: string;
  lineTaken: number;
  side: string;
  homeScore: number;
  awayScore: number;
}) {
  const selectedIsHome = normalizeTeamName(params.selectedTeam) === normalizeTeamName(params.homeTeam);
  const selectedScore = selectedIsHome ? params.homeScore : params.awayScore;
  const wantsOver = params.side.trim().toLowerCase().includes("over");

  if (selectedScore === params.lineTaken) return "push" as const;
  if (wantsOver) return selectedScore > params.lineTaken ? "win" as const : "loss" as const;
  return selectedScore < params.lineTaken ? "win" as const : "loss" as const;
}

function getSelectedTeamFromPick(pick: PendingPick) {
  const side = pick.side ?? "";
  const homeTeam = pick.home_team ?? "";
  const awayTeam = pick.away_team ?? "";

  if (normalizeTeamName(side).includes(normalizeTeamName(homeTeam))) return homeTeam;
  if (normalizeTeamName(side).includes(normalizeTeamName(awayTeam))) return awayTeam;

  return homeTeam;
}

function formatEspnDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/-/g, "");
}

function getEspnCompetition(event: EspnNbaEvent) {
  return event.competitions?.[0] ?? null;
}

function getEspnEventScores(event: EspnNbaEvent) {
  const competition = getEspnCompetition(event);
  const homeCompetitor = competition?.competitors?.find(
    (competitor) => competitor.homeAway === "home"
  );
  const awayCompetitor = competition?.competitors?.find(
    (competitor) => competitor.homeAway === "away"
  );

  const homeScore = Number(homeCompetitor?.score ?? NaN);
  const awayScore = Number(awayCompetitor?.score ?? NaN);

  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return null;
  return { homeScore, awayScore };
}

function isEspnEventCompleted(event: EspnNbaEvent) {
  return Boolean(getEspnCompetition(event)?.status?.type?.completed);
}

function findMatchingEspnEvent(pick: PendingPick, events: EspnNbaEvent[]) {
  const matching = events.filter((event) => {
    const competition = getEspnCompetition(event);
    const homeCompetitor = competition?.competitors?.find(
      (competitor) => competitor.homeAway === "home"
    );
    const awayCompetitor = competition?.competitors?.find(
      (competitor) => competitor.homeAway === "away"
    );

    return (
      normalizeTeamName(homeCompetitor?.team?.displayName) === normalizeTeamName(pick.home_team) &&
      normalizeTeamName(awayCompetitor?.team?.displayName) === normalizeTeamName(pick.away_team)
    );
  });

  if (matching.length <= 1) return matching[0];
  if (!pick.game_start_time) return matching[0];

  const pickStart = new Date(pick.game_start_time).getTime();

  return (
    matching
      .map((event) => ({
        event,
        diff: Math.abs(pickStart - new Date(event.date ?? pick.game_start_time ?? 0).getTime()),
      }))
      .sort((a, b) => a.diff - b.diff)[0]?.event ?? null
  );
}

function getEspnSoccerCompetition(event: EspnSoccerEvent) {
  return event.competitions?.[0] ?? null;
}

function getEspnSoccerEventScores(event: EspnSoccerEvent) {
  const competition = getEspnSoccerCompetition(event);
  const homeCompetitor = competition?.competitors?.find(
    (competitor) => competitor.homeAway === "home"
  );
  const awayCompetitor = competition?.competitors?.find(
    (competitor) => competitor.homeAway === "away"
  );

  const homeScore = Number(homeCompetitor?.score ?? NaN);
  const awayScore = Number(awayCompetitor?.score ?? NaN);

  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return null;
  return { homeScore, awayScore };
}

function isEspnSoccerEventCompleted(event: EspnSoccerEvent) {
  return Boolean(getEspnSoccerCompetition(event)?.status?.type?.completed);
}

function isEspnSoccerEventPostponed(event: EspnSoccerEvent) {
  const status = getEspnSoccerCompetition(event)?.status?.type;
  const label = [
    status?.name,
    status?.state,
    status?.detail,
    status?.shortDetail,
    status?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    label.includes("postponed") ||
    label.includes("canceled") ||
    label.includes("cancelled") ||
    label.includes("abandoned")
  );
}

function competitorMatchesSoccerTeam(
  competitor: EspnSoccerCompetitor | undefined,
  teamName: string | null | undefined
) {
  return (
    soccerTeamMatches(competitor?.team?.displayName, teamName) ||
    soccerTeamMatches(competitor?.team?.shortDisplayName, teamName) ||
    soccerTeamMatches(competitor?.team?.abbreviation, teamName)
  );
}

function findMatchingEspnSoccerEvent(pick: PendingPick, events: EspnSoccerEvent[]) {
  const matching = events.filter((event) => {
    const competition = getEspnSoccerCompetition(event);
    const homeCompetitor = competition?.competitors?.find(
      (competitor) => competitor.homeAway === "home"
    );
    const awayCompetitor = competition?.competitors?.find(
      (competitor) => competitor.homeAway === "away"
    );

    return (
      competitorMatchesSoccerTeam(homeCompetitor, pick.home_team) &&
      competitorMatchesSoccerTeam(awayCompetitor, pick.away_team)
    );
  });

  if (matching.length <= 1) return matching[0];
  if (!pick.game_start_time) return matching[0];

  const pickStart = new Date(pick.game_start_time).getTime();

  return (
    matching
      .map((event) => ({
        event,
        diff: Math.abs(pickStart - new Date(event.date ?? pick.game_start_time ?? 0).getTime()),
      }))
      .sort((a, b) => a.diff - b.diff)[0]?.event ?? null
  );
}

function getEspnSoccerLeagueKeysForPick(pick: PendingPick) {
  const label = `${pick.edge_label ?? ""} ${pick.game_label ?? ""}`.toLowerCase();
  if (label.includes("mls")) return ["usa.1"];
  if (label.includes("world cup")) return ["fifa.world"];
  return ["fifa.world", "usa.1"];
}

function getResolvedPickStatus(resultStatus: "win" | "loss" | "push" | "postponed" | null) {
  return resultStatus;
}

function gradePlayerPropPick(params: {
  side: string;
  lineTaken: number;
  actualStat: number;
}) {
  const wantsOver = params.side.trim().toLowerCase().startsWith("over");

  if (params.actualStat === params.lineTaken) return "push" as const;
  if (wantsOver) return params.actualStat > params.lineTaken ? "win" as const : "loss" as const;
  return params.actualStat < params.lineTaken ? "win" as const : "loss" as const;
}

async function fetchMlbScheduledGameForPick(pick: PendingPick): Promise<MlbScheduledGameMatch | null> {
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

  const matching: MlbScheduleGame[] = [];
  for (const date of searchDates) {
    const data = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`,
      { cache: "no-store" }
    ).then((res) => res.json() as Promise<MlbScheduleResponse>);

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
  const pickStart = new Date(pick.game_start_time).getTime();

  const matchedGame =
    matching.length === 1
      ? matching[0] ?? null
      : matching
          .map((game) => ({
            game,
            diff: Math.abs(
              pickStart - new Date(game.gameDate ?? pick.game_start_time ?? 0).getTime()
            ),
          }))
          .sort((a, b) => a.diff - b.diff)[0]?.game ?? null;

  if (!matchedGame) return null;

  return {
    gamePk: matchedGame.gamePk ?? null,
    abstractState: matchedGame.status?.abstractGameState ?? "",
    detailedState: matchedGame.status?.detailedState ?? "",
  };
}

async function fetchMlbGamePkForPick(pick: PendingPick) {
  const scheduledGame = await fetchMlbScheduledGameForPick(pick);
  return scheduledGame?.gamePk ?? null;
}

function findPlayerStatValue(boxscore: MlbBoxscoreResponse, playerName: string, statKey: string) {
  const players = [
    ...Object.values(boxscore.teams?.home?.players ?? {}),
    ...Object.values(boxscore.teams?.away?.players ?? {}),
  ];

  const player = players.find(
    (entry) => normalizePlayerName(entry.person?.fullName) === normalizePlayerName(playerName)
  );

  if (!player) return null;

  if (statKey === "pitcher_strikeouts") {
    const value = Number(player.stats?.pitching?.strikeOuts ?? NaN);
    return Number.isFinite(value) ? value : null;
  }

  if (statKey === "pitcher_outs") {
    const innings = parseBaseballInnings(player.stats?.pitching?.inningsPitched);
    return innings === null ? null : Math.round(innings * 3);
  }

  if (statKey === "batter_hits") {
    const value = Number(player.stats?.batting?.hits ?? NaN);
    return Number.isFinite(value) ? value : null;
  }

  if (statKey === "batter_total_bases") {
    const value = Number(player.stats?.batting?.totalBases ?? NaN);
    return Number.isFinite(value) ? value : null;
  }

  if (statKey === "batter_rbis") {
    return getBoxscoreStatValue(player.stats?.batting, "rbi");
  }

  if (statKey === "batter_runs_scored") {
    return getBoxscoreStatValue(player.stats?.batting, "runs");
  }

  if (statKey === "batter_hits_runs_rbis") {
    const hits = getBoxscoreStatValue(player.stats?.batting, "hits");
    const runs = getBoxscoreStatValue(player.stats?.batting, "runs");
    const rbis = getBoxscoreStatValue(player.stats?.batting, "rbi");
    if (hits === null || runs === null || rbis === null) return null;
    return hits + runs + rbis;
  }

  return null;
}

function isMlbGameFinal(feed: MlbLiveFeedResponse | null) {
  const abstractState = feed?.gameData?.status?.abstractGameState?.toLowerCase() ?? "";
  const detailedState = feed?.gameData?.status?.detailedState?.toLowerCase() ?? "";

  return (
    abstractState === "final" ||
    abstractState === "completed" ||
    detailedState.includes("final")
  );
}

function isMlbGamePostponed(feed: MlbLiveFeedResponse | null) {
  const abstractState = feed?.gameData?.status?.abstractGameState?.toLowerCase() ?? "";
  const detailedState = feed?.gameData?.status?.detailedState?.toLowerCase() ?? "";

  return (
    abstractState.includes("postponed") ||
    detailedState.includes("postponed") ||
    detailedState.includes("cancelled") ||
    detailedState.includes("canceled")
  );
}

function isMlbScheduleGamePostponed(game: MlbScheduledGameMatch | null) {
  const abstractState = game?.abstractState?.toLowerCase() ?? "";
  const detailedState = game?.detailedState?.toLowerCase() ?? "";

  return (
    abstractState.includes("postponed") ||
    detailedState.includes("postponed") ||
    detailedState.includes("cancelled") ||
    detailedState.includes("canceled")
  );
}

function getMlbLiveScores(feed: MlbLiveFeedResponse | null) {
  const homeScore = Number(feed?.liveData?.linescore?.teams?.home?.runs ?? NaN);
  const awayScore = Number(feed?.liveData?.linescore?.teams?.away?.runs ?? NaN);

  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return null;
  return { homeScore, awayScore };
}

function getMlbFirstFiveScores(feed: MlbLiveFeedResponse | null) {
  const innings = feed?.liveData?.linescore?.innings ?? [];
  if (innings.length < 5) return null;

  const firstFive = innings.slice(0, 5);
  const homeScore = firstFive.reduce((sum, inning) => sum + Number(inning.home?.runs ?? 0), 0);
  const awayScore = firstFive.reduce((sum, inning) => sum + Number(inning.away?.runs ?? 0), 0);

  return { homeScore, awayScore };
}

function getMlbFinalInnings(feed: MlbLiveFeedResponse | null) {
  const inningCount = feed?.liveData?.linescore?.innings?.length;
  if (typeof inningCount === "number" && inningCount > 0) return inningCount;

  const currentInning = Number(feed?.liveData?.linescore?.currentInning ?? NaN);
  if (Number.isFinite(currentInning) && currentInning > 0) return currentInning;

  return null;
}

function formatMlbFinalScore(
  pick: PendingPick,
  homeScore: number,
  awayScore: number,
  innings: number | null
) {
  const base = `${pick.away_team} ${awayScore} - ${pick.home_team} ${homeScore}`;
  if (innings && innings > 9) {
    return `${base} (F/${innings})`;
  }
  return base;
}

function formatSoccerFinalScore(
  pick: PendingPick,
  homeScore: number,
  awayScore: number
) {
  return `${pick.away_team} ${awayScore} - ${pick.home_team} ${homeScore}`;
}

async function formatNbaFinalScore(
  pick: PendingPick,
  homeScore: number,
  awayScore: number
) {
  const base = `${pick.away_team} ${awayScore} - ${pick.home_team} ${homeScore}`;

  if (!pick.pick_date || !pick.home_team || !pick.away_team) {
    return base;
  }

  try {
    const review = await analyzeNbaGameForLearning({
      pickDate: pick.pick_date,
      gameLabel: pick.game_label ?? undefined,
      homeTeam: pick.home_team,
      awayTeam: pick.away_team,
      gameStartTime: pick.game_start_time ?? null,
    });
    const flow = review.gameFlow;

    if (
      !flow ||
      flow.overtimeCount <= 0 ||
      flow.regulationHomeScore === null ||
      flow.regulationAwayScore === null
    ) {
      return base;
    }

    const overtimeLabel = flow.overtimeCount === 1 ? "OT" : `${flow.overtimeCount}OT`;
    return `${base} (${overtimeLabel}; Reg ${pick.away_team} ${flow.regulationAwayScore} - ${pick.home_team} ${flow.regulationHomeScore})`;
  } catch {
    return base;
  }
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

async function pruneFinalMlbSlateCache(cacheKey: string) {
  const cachedRow = await getCachedData(cacheKey);
  const payload =
    (cachedRow?.data as
      | {
          data?: MlbOddsGame[];
          [key: string]: unknown;
        }
      | null) ?? null;

  if (!payload?.data?.length) return 0;

  const now = new Date();
  const nextGames: MlbOddsGame[] = [];
  let removedCount = 0;
  const gamePkCache = new Map<string, number | null>();
  const liveFeedCache = new Map<number, MlbLiveFeedResponse | null>();

  for (const game of payload.data) {
    const gameStart = new Date(game.commence_time);
    if (Number.isNaN(gameStart.getTime()) || gameStart > now) {
      nextGames.push(game);
      continue;
    }

    const tempPick: PendingPick = {
      id: 0,
      pick_date: null,
      sport: "MLB",
      market_scope: "team",
      market_type: null,
      status: "pending",
      home_team: game.home_team,
      away_team: game.away_team,
      side: null,
      line_taken: null,
      odds_taken: null,
      stake_units: null,
      game_start_time: game.commence_time,
      player_name: null,
      prop_stat_key: null,
      final_score: null,
    };

    const gameCacheKey = `${game.home_team ?? ""}|${game.away_team ?? ""}|${game.commence_time ?? ""}`;
    let gamePk = gamePkCache.get(gameCacheKey);

    if (gamePk === undefined) {
      gamePk = await fetchMlbGamePkForPick(tempPick);
      gamePkCache.set(gameCacheKey, gamePk);
    }

    if (!gamePk) {
      nextGames.push(game);
      continue;
    }

    let liveFeed = liveFeedCache.get(gamePk);
    if (liveFeed === undefined) {
      liveFeed = await fetchMlbLiveFeed(gamePk);
      liveFeedCache.set(gamePk, liveFeed);
    }

    if (isMlbGameFinal(liveFeed)) {
      removedCount += 1;
      continue;
    }

    nextGames.push(game);
  }

  if (removedCount > 0) {
    await setCachedData(cacheKey, {
      ...payload,
      data: nextGames,
    });
  }

  return removedCount;
}

async function fetchEspnNbaScoreboard(dateKey: string) {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateKey}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`ESPN scoreboard failed for ${dateKey}: ${res.status}`);
  }

  return res.json() as Promise<EspnNbaScoreboardResponse>;
}

async function fetchEspnSoccerScoreboard(leagueKey: string, dateKey: string) {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueKey}/scoreboard?dates=${dateKey}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`ESPN soccer scoreboard failed for ${leagueKey} ${dateKey}: ${res.status}`);
  }

  return res.json() as Promise<EspnSoccerScoreboardResponse>;
}

async function fetchEspnNbaSummary(eventId: string) {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`ESPN summary failed for event ${eventId}: ${res.status}`);
  }

  return res.json() as Promise<EspnNbaSummaryResponse>;
}

function findEspnPlayerStatValue(
  summary: EspnNbaSummaryResponse,
  playerName: string,
  statKey: string
) {
  const normalizedTarget = normalizePlayerName(playerName);

  for (const teamBlock of summary.boxscore?.players ?? []) {
    for (const statGroup of teamBlock.statistics ?? []) {
      const athlete = statGroup.athletes?.find(
        (entry) => normalizePlayerName(entry.athlete?.displayName) === normalizedTarget
      );

      if (!athlete) continue;
      if (athlete.didNotPlay) return null;

      const keys = statGroup.keys ?? [];
      const stats = athlete.stats ?? [];

      const readNumber = (keyName: string) => {
        const index = keys.indexOf(keyName);
        if (index < 0) return null;
        const value = Number(stats[index] ?? NaN);
        return Number.isFinite(value) ? value : null;
      };
      const readMadeAttempted = (keyName: string, part: "made" | "attempted") => {
        const index = keys.indexOf(keyName);
        if (index < 0) return null;
        const [made, attempted] = String(stats[index] ?? "").split("-").map(Number);
        const value = part === "made" ? made : attempted;
        return Number.isFinite(value) ? value : null;
      };

      const points = readNumber("points");
      const rebounds = readNumber("rebounds");
      const assists = readNumber("assists");
      const steals = readNumber("steals");
      const blocks = readNumber("blocks");
      const turnovers = readNumber("turnovers");

      if (statKey === "points") return points;
      if (statKey === "rebounds") return rebounds;
      if (statKey === "assists") return assists;
      if (statKey === "steals") return steals;
      if (statKey === "blocks") return blocks;
      if (statKey === "turnovers") return turnovers;
      if (statKey === "threes") return readMadeAttempted("threePointFieldGoalsMade-threePointFieldGoalsAttempted", "made");
      if (statKey === "field_goals_made") return readMadeAttempted("fieldGoalsMade-fieldGoalsAttempted", "made");
      if (statKey === "free_throws_made") return readMadeAttempted("freeThrowsMade-freeThrowsAttempted", "made");
      if (statKey === "free_throws_attempted") return readMadeAttempted("freeThrowsMade-freeThrowsAttempted", "attempted");
      if (statKey === "pra") {
        if (points === null || rebounds === null || assists === null) return null;
        return points + rebounds + assists;
      }
      if (statKey === "blocks_steals") {
        if (blocks === null || steals === null) return null;
        return blocks + steals;
      }
      if (statKey === "points_rebounds") {
        if (points === null || rebounds === null) return null;
        return points + rebounds;
      }
      if (statKey === "points_assists") {
        if (points === null || assists === null) return null;
        return points + assists;
      }
      if (statKey === "rebounds_assists") {
        if (rebounds === null || assists === null) return null;
        return rebounds + assists;
      }
    }
  }

  return null;
}

function getEspnPlayerAvailability(
  summary: EspnNbaSummaryResponse | null,
  playerName: string
): Pick<NbaInjuryTriggerPlayerResult, "played" | "availability" | "finalNote"> {
  if (!summary) {
    return {
      played: null,
      availability: "unknown",
      finalNote: "ESPN boxscore was unavailable.",
    };
  }

  const normalizedTarget = normalizePlayerName(playerName);

  for (const teamBlock of summary.boxscore?.players ?? []) {
    for (const statGroup of teamBlock.statistics ?? []) {
      const athlete = statGroup.athletes?.find(
        (entry) => normalizePlayerName(entry.athlete?.displayName) === normalizedTarget
      );

      if (!athlete) continue;

      if (athlete.didNotPlay) {
        return {
          played: false,
          availability: "did_not_play",
          finalNote: `${playerName} was listed as did not play in the ESPN boxscore.`,
        };
      }

      const hasStatLine = (athlete.stats ?? []).some((value) => String(value ?? "").trim().length > 0);
      return {
        played: hasStatLine,
        availability: hasStatLine ? "played" : "unknown",
        finalNote: hasStatLine
          ? `${playerName} appeared in the ESPN boxscore.`
          : `${playerName} was found in the ESPN boxscore, but no stat line was available.`,
      };
    }
  }

  return {
    played: null,
    availability: "not_found",
    finalNote: `${playerName} was not found in the ESPN boxscore.`,
  };
}

function collectRecheckPickIds(data: NbaInjurySyncData) {
  const ids = new Set<number>();

  for (const change of data.boardRecheck?.changes ?? []) {
    if (change.before?.id) ids.add(change.before.id);
    if (change.after?.id) ids.add(change.after.id);
  }

  return [...ids];
}

function toRecheckPickResult(
  pick: NbaBoardRecheckPick | null,
  rowById: Map<number, RecheckOutcomePickRow>
): NbaBoardRecheckPickResult | null {
  if (!pick) return null;
  const row = pick.id ? rowById.get(pick.id) ?? null : null;

  return {
    ...pick,
    finalStatus: row?.status ?? pick.status ?? null,
    unitsResult:
      row?.units_result === null || row?.units_result === undefined
        ? null
        : Number(row.units_result),
    finalScore: row?.final_score ?? null,
    finalStat:
      row?.final_stat === null || row?.final_stat === undefined
        ? null
        : Number(row.final_stat),
  };
}

function isSettledRecheckStatus(status: string | null | undefined) {
  return ["win", "loss", "push", "postponed", "voided"].includes(status ?? "");
}

function formatRecheckResult(pick: NbaBoardRecheckPickResult | null) {
  if (!pick) return "empty";
  const units =
    pick.unitsResult === null || pick.unitsResult === undefined
      ? "pending units"
      : `${pick.unitsResult > 0 ? "+" : ""}${pick.unitsResult.toFixed(2)}u`;
  return `${pick.label} - ${pick.side ?? "pick"} (${pick.finalStatus ?? "pending"}, ${units})`;
}

function buildRecheckResultComparisons(
  data: NbaInjurySyncData,
  rowById: Map<number, RecheckOutcomePickRow>
) {
  const comparisons: NbaBoardRecheckResultComparison[] = [];

  for (const change of data.boardRecheck?.changes ?? []) {
    if (change.changeType !== "changed" && change.changeType !== "added" && change.changeType !== "removed") {
      continue;
    }

    const before = toRecheckPickResult(change.before, rowById);
    const after = toRecheckPickResult(change.after, rowById);
    const beforeSettled = before ? isSettledRecheckStatus(before.finalStatus) : true;
    const afterSettled = after ? isSettledRecheckStatus(after.finalStatus) : true;

    if (!beforeSettled || !afterSettled) {
      comparisons.push({
        board: change.board,
        slotNumber: change.slotNumber,
        before,
        after,
        verdict: "pending",
        summary: `Waiting on final results for ${formatRecheckResult(before)} vs ${formatRecheckResult(after)}.`,
      });
      continue;
    }

    const beforeUnits = before?.unitsResult ?? 0;
    const afterUnits = after?.unitsResult ?? 0;
    const verdict =
      afterUnits > beforeUnits
        ? "replacement_better"
        : beforeUnits > afterUnits
          ? "original_better"
          : "same";

    comparisons.push({
      board: change.board,
      slotNumber: change.slotNumber,
      before,
      after,
      verdict,
      summary:
        verdict === "replacement_better"
          ? `Replacement beat the original: ${formatRecheckResult(after)} vs ${formatRecheckResult(before)}.`
          : verdict === "original_better"
            ? `Original beat the replacement: ${formatRecheckResult(before)} vs ${formatRecheckResult(after)}.`
            : `Original and replacement finished even: ${formatRecheckResult(before)} vs ${formatRecheckResult(after)}.`,
    });
  }

  return comparisons;
}

function getRelevantRowsForTriggerPlayer(
  player: NbaInjuryTriggerPlayer,
  rowById: Map<number, RecheckOutcomePickRow>
) {
  const rows = [...rowById.values()];
  const team = normalizeLookupText(player.team);
  const matchingTeamRows = rows.filter(
    (row) => normalizeLookupText(row.home_team) === team || normalizeLookupText(row.away_team) === team
  );

  return matchingTeamRows.length > 0 ? matchingTeamRows : rows;
}

async function buildTriggerPlayerResults(params: {
  data: NbaInjurySyncData;
  rowById: Map<number, RecheckOutcomePickRow>;
  scoreboardCache: Map<string, EspnNbaEvent[]>;
  summaryCache: Map<string, EspnNbaSummaryResponse | null>;
}) {
  const results: NbaInjuryTriggerPlayerResult[] = [];

  for (const player of params.data.boardRecheck?.triggerPlayers ?? []) {
    const candidateRows = getRelevantRowsForTriggerPlayer(player, params.rowById);
    let availability: Pick<NbaInjuryTriggerPlayerResult, "played" | "availability" | "finalNote"> = {
      played: null,
      availability: "unknown",
      finalNote: "No changed board game was available for this trigger player.",
    };

    for (const row of candidateRows) {
      if (!row.home_team || !row.away_team) continue;

      const pickStartDate = row.game_start_time ? new Date(row.game_start_time) : new Date(`${params.data.businessDate}T19:00:00-04:00`);
      const searchDates = Array.from(
        new Set(
          [
            params.data.businessDate.replace(/-/g, ""),
            formatEspnDate(pickStartDate),
            pickStartDate.toISOString().slice(0, 10).replace(/-/g, ""),
          ].filter(Boolean)
        )
      ) as string[];

      const matchingEvents: EspnNbaEvent[] = [];
      for (const dateKey of searchDates) {
        let events = params.scoreboardCache.get(dateKey);
        if (!events) {
          const scoreboard = await fetchEspnNbaScoreboard(dateKey);
          events = scoreboard.events ?? [];
          params.scoreboardCache.set(dateKey, events);
        }
        matchingEvents.push(...events);
      }

      const tempPick: PendingPick = {
        id: row.id,
        pick_date: params.data.businessDate,
        sport: "NBA",
        market_scope: "team",
        market_type: null,
        status: row.status ?? null,
        game_label: row.game_label ?? null,
        home_team: row.home_team,
        away_team: row.away_team,
        side: null,
        line_taken: null,
        odds_taken: null,
        stake_units: null,
        game_start_time: row.game_start_time ?? null,
        player_name: null,
        prop_stat_key: null,
      };

      const matchingEvent = findMatchingEspnEvent(tempPick, matchingEvents);
      if (!matchingEvent?.id) continue;

      let summary = params.summaryCache.get(matchingEvent.id) ?? null;
      if (!summary) {
        summary = await fetchEspnNbaSummary(matchingEvent.id);
        params.summaryCache.set(matchingEvent.id, summary);
      }

      availability = getEspnPlayerAvailability(summary, player.playerName);
      if (availability.availability !== "not_found" && availability.availability !== "unknown") {
        break;
      }
    }

    results.push({
      ...player,
      ...availability,
      checkedAt: new Date().toISOString(),
    });
  }

  return results;
}

async function updateNbaInjuryRecheckOutcomes(
  supabase: ReturnType<typeof getSupabaseServer>,
  pickDates?: string[]
) {
  const dateKeys = Array.from(new Set((pickDates ?? []).filter(Boolean)));
  const query = supabase
    .from("cached_market_data")
    .select("cache_key, data")
    .like("cache_key", "nba_injury_report_20%")
    .order("updated_at", { ascending: false })
    .limit(dateKeys.length > 0 ? Math.max(dateKeys.length, 10) : 10);

  if (dateKeys.length > 0) {
    query.in("cache_key", dateKeys.map((date) => `nba_injury_report_${date}`));
  }

  const { data: cacheRows } = await query;
  const rows = ((cacheRows ?? []) as RecheckCacheRow[]).filter(
    (row) => row.data?.boardRecheck && row.data.boardRecheck.changes.length > 0
  );

  let updatedReports = 0;
  const scoreboardCache = new Map<string, EspnNbaEvent[]>();
  const summaryCache = new Map<string, EspnNbaSummaryResponse | null>();

  for (const cacheRow of rows) {
    const syncData = cacheRow.data;
    if (!syncData?.boardRecheck) continue;

    const ids = collectRecheckPickIds(syncData);
    if (ids.length === 0) continue;

    const { data: pickRows } = await supabase
      .from("picks")
      .select("id, pick_date, game_label, home_team, away_team, status, final_score, final_stat, units_result, game_start_time")
      .in("id", ids);

    const rowById = new Map(
      ((pickRows ?? []) as RecheckOutcomePickRow[]).map((row) => [row.id, row])
    );

    const nextData: NbaInjurySyncData = {
      ...syncData,
      boardRecheck: {
        ...syncData.boardRecheck,
        resultComparisons: buildRecheckResultComparisons(syncData, rowById),
        triggerPlayerResults: await buildTriggerPlayerResults({
          data: syncData,
          rowById,
          scoreboardCache,
          summaryCache,
        }),
        outcomeUpdatedAt: new Date().toISOString(),
      },
    };

    await setCachedData(cacheRow.cache_key, nextData);
    updatedReports += 1;
  }

  return updatedReports;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req, { countAgainstLimit: true });
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();

    const { data: pendingRows, error: pendingError } = await supabase
      .from("picks")
      .select("*")
      .in("sport", ["NBA", "MLB", "SOCCER"])
      .in("market_scope", ["team", "player_prop"])
      .eq("status", "pending")
      .order("pick_date", { ascending: false });

    if (pendingError) {
      return NextResponse.json({ ok: false, error: pendingError.message }, { status: 500 });
    }

    const pendingPicks = (pendingRows ?? []) as PendingPick[];

    if (pendingPicks.length === 0) {
      const recheckReportsUpdated = await updateNbaInjuryRecheckOutcomes(supabase);
      return gradeResponse(req, {
        ok: true,
        updated: 0,
        message:
          recheckReportsUpdated > 0
            ? `No pending picks. Updated ${recheckReportsUpdated} NBA injury-switch report(s).`
            : "No pending picks.",
      });
    }

    let updated = 0;
    const now = new Date();
    const mlbScheduledGameCache = new Map<string, MlbScheduledGameMatch | null>();
    const mlbLiveFeedCache = new Map<number, MlbLiveFeedResponse | null>();
    const nbaScoreboardCache = new Map<string, EspnNbaEvent[]>();
    const nbaSummaryCache = new Map<string, EspnNbaSummaryResponse | null>();
    const soccerScoreboardCache = new Map<string, EspnSoccerEvent[]>();

    for (const pick of pendingPicks) {
      if (pick.game_start_time && new Date(pick.game_start_time) > now) {
        continue;
      }

      let resultStatus: "win" | "loss" | "push" | null = null;
      let homeScore: number | null = null;
      let awayScore: number | null = null;
      let firstFiveHomeScore: number | null = null;
      let firstFiveAwayScore: number | null = null;
      let actualStat: number | null = null;
      let mlbLiveFeed: MlbLiveFeedResponse | null = null;
      let mlbGamePk: number | null = null;

      if (pick.sport === "MLB") {
        const cacheKey = `${pick.home_team ?? ""}|${pick.away_team ?? ""}|${pick.game_start_time ?? ""}`;
        let scheduledGame = mlbScheduledGameCache.get(cacheKey);

        if (scheduledGame === undefined) {
          scheduledGame = await fetchMlbScheduledGameForPick(pick);
          mlbScheduledGameCache.set(cacheKey, scheduledGame);
        }

        const gamePk = scheduledGame?.gamePk ?? null;
        mlbGamePk = gamePk;

        if (isMlbScheduleGamePostponed(scheduledGame)) {
          const finalScoreLabel = scheduledGame?.detailedState || "Postponed";
          const { error: updateError } = await supabase
            .from("picks")
            .update({
              status: "postponed",
              final_score: finalScoreLabel,
              final_stat: null,
              units_result: 0,
              graded_at: new Date().toISOString(),
            })
            .eq("id", pick.id);

          if (!updateError) {
            updated += 1;
          }

          continue;
        }

        if (!gamePk) continue;

        mlbLiveFeed = mlbLiveFeedCache.get(gamePk) ?? null;
        if (mlbLiveFeed === null) {
          mlbLiveFeed = await fetchMlbLiveFeed(gamePk);
          mlbLiveFeedCache.set(gamePk, mlbLiveFeed);
        }

        if (isMlbGamePostponed(mlbLiveFeed)) {
          const detailedState = mlbLiveFeed?.gameData?.status?.detailedState ?? "Postponed";
          const { error: updateError } = await supabase
            .from("picks")
            .update({
              status: "postponed",
              final_score: detailedState,
              final_stat: null,
              units_result: 0,
              graded_at: new Date().toISOString(),
            })
            .eq("id", pick.id);

          if (!updateError) {
            updated += 1;
          }

          continue;
        }

        if (!isMlbGameFinal(mlbLiveFeed)) continue;

        const scores = getMlbLiveScores(mlbLiveFeed);
        if (!scores) continue;

        homeScore = scores.homeScore;
        awayScore = scores.awayScore;
        const firstFiveScores = getMlbFirstFiveScores(mlbLiveFeed);
        firstFiveHomeScore = firstFiveScores?.homeScore ?? null;
        firstFiveAwayScore = firstFiveScores?.awayScore ?? null;

        if (pick.market_scope === "player_prop") {
          if (!pick.player_name || !pick.prop_stat_key) continue;
          const boxscore = mlbLiveFeed?.liveData?.boxscore ?? {};
          actualStat = findPlayerStatValue(
            boxscore,
            pick.player_name,
            pick.prop_stat_key
          );
        }
      } else {
        const pickStartDate = pick.game_start_time ? new Date(pick.game_start_time) : now;
        const searchDates = Array.from(
          new Set(
            [
              (pick.pick_date ?? "").replace(/-/g, ""),
              formatEspnDate(pickStartDate),
              pickStartDate.toISOString().slice(0, 10).replace(/-/g, ""),
            ].filter(Boolean)
          )
        ) as string[];

        const matchingEvents: EspnNbaEvent[] = [];
        for (const dateKey of searchDates) {
          let events = nbaScoreboardCache.get(dateKey);
          if (!events) {
            const scoreboard = await fetchEspnNbaScoreboard(dateKey);
            events = scoreboard.events ?? [];
            nbaScoreboardCache.set(dateKey, events);
          }
          matchingEvents.push(...events);
        }

        const matchingEvent = findMatchingEspnEvent(pick, matchingEvents);
        if (!matchingEvent || !isEspnEventCompleted(matchingEvent)) continue;

        const scores = getEspnEventScores(matchingEvent);
        if (!scores) continue;

        homeScore = scores.homeScore;
        awayScore = scores.awayScore;

        if (pick.market_scope === "player_prop") {
          if (!pick.player_name || !pick.prop_stat_key || !matchingEvent.id) continue;

          let summary = nbaSummaryCache.get(matchingEvent.id) ?? null;
          if (!summary) {
            summary = await fetchEspnNbaSummary(matchingEvent.id);
            nbaSummaryCache.set(matchingEvent.id, summary);
          }

          actualStat = findEspnPlayerStatValue(summary, pick.player_name, pick.prop_stat_key);
        }
      }

      if (homeScore === null || awayScore === null) continue;

      if (pick.sport === "NBA" && pick.market_type === "moneyline") {
        resultStatus = gradeMoneylinePick({
          selectedTeam: getSelectedTeamFromPick(pick),
          homeTeam: pick.home_team ?? "",
          homeScore,
          awayScore,
        });
      }

      if (pick.sport === "NBA" && pick.market_type === "spread") {
        resultStatus = gradeSpreadPick({
          selectedTeam: getSelectedTeamFromPick(pick),
          homeTeam: pick.home_team ?? "",
          homeScore,
          awayScore,
          lineTaken: Number(pick.line_taken ?? 0),
        });
      }

      if (pick.sport === "NBA" && pick.market_type === "total") {
        resultStatus = gradeTotalPick({
          side: pick.side ?? "",
          lineTaken: Number(pick.line_taken ?? 0),
          homeScore,
          awayScore,
        });
      }

      if (pick.sport === "MLB" && pick.market_type === "moneyline") {
        resultStatus = gradeMoneylinePick({
          selectedTeam: getSelectedTeamFromPick(pick),
          homeTeam: pick.home_team ?? "",
          homeScore,
          awayScore,
        });
      }

      if (pick.sport === "MLB" && pick.market_type === "spread") {
        resultStatus = gradeSpreadPick({
          selectedTeam: getSelectedTeamFromPick(pick),
          homeTeam: pick.home_team ?? "",
          homeScore,
          awayScore,
          lineTaken: Number(pick.line_taken ?? 0),
        });
      }

      if (pick.sport === "MLB" && pick.market_type === "total") {
        resultStatus = gradeTotalPick({
          side: pick.side ?? "",
          lineTaken: Number(pick.line_taken ?? 0),
          homeScore,
          awayScore,
        });
      }

      if (pick.sport === "MLB" && isMlbTeamTotalMarketType(pick.market_type)) {
        resultStatus = gradeTeamTotalPick({
          selectedTeam: getSelectedTeamFromPick(pick),
          homeTeam: pick.home_team ?? "",
          lineTaken: Number(pick.line_taken ?? 0),
          side: pick.side ?? "",
          homeScore,
          awayScore,
        });
      }

      if (
        pick.sport === "MLB" &&
        isMlbFirstFiveMarketType(pick.market_type) &&
        firstFiveHomeScore !== null &&
        firstFiveAwayScore !== null
      ) {
        if (pick.market_type === "f5_moneyline") {
          resultStatus = gradeMoneylinePick({
            selectedTeam: getSelectedTeamFromPick(pick),
            homeTeam: pick.home_team ?? "",
            homeScore: firstFiveHomeScore,
            awayScore: firstFiveAwayScore,
          });
        } else if (pick.market_type === "f5_spread") {
          resultStatus = gradeSpreadPick({
            selectedTeam: getSelectedTeamFromPick(pick),
            homeTeam: pick.home_team ?? "",
            homeScore: firstFiveHomeScore,
            awayScore: firstFiveAwayScore,
            lineTaken: Number(pick.line_taken ?? 0),
          });
        } else if (pick.market_type === "f5_total") {
          resultStatus = gradeTotalPick({
            side: pick.side ?? "",
            lineTaken: Number(pick.line_taken ?? 0),
            homeScore: firstFiveHomeScore,
            awayScore: firstFiveAwayScore,
          });
        }
      }

      if (!resultStatus && pick.market_scope === "player_prop") {
        if (actualStat === null) {
          resultStatus = "push";
        } else {
          resultStatus = gradePlayerPropPick({
            side: pick.side ?? "",
            lineTaken: Number(pick.line_taken ?? 0),
            actualStat,
          });
        }

        const unitsResult = settleUnits(
          Number(pick.odds_taken ?? -110),
          Number(pick.stake_units ?? 1),
          resultStatus
        );
        const finalScore =
          pick.sport === "MLB"
            ? formatMlbFinalScore(pick, homeScore, awayScore, getMlbFinalInnings(mlbLiveFeed))
            : await formatNbaFinalScore(pick, homeScore, awayScore);

        const { error: updateError } = await supabase
          .from("picks")
          .update({
            status: getResolvedPickStatus(resultStatus),
            final_score: finalScore,
            final_stat: actualStat,
            units_result: unitsResult,
            graded_at: new Date().toISOString(),
          })
          .eq("id", pick.id);

        if (!updateError) {
          if (pick.sport === "MLB" && pick.market_type === "pitcher_strikeouts") {
            const pitcherDetails = getPitcherPropResultDetailsFromFeed(mlbLiveFeed, pick.player_name);
            await setCachedData(`mlb_pitcher_prop_details_${pick.id}`, {
              ...pitcherDetails,
              finalStrikeouts:
                pitcherDetails.finalStrikeouts === null || pitcherDetails.finalStrikeouts === undefined
                  ? actualStat
                  : pitcherDetails.finalStrikeouts,
              updatedAt: new Date().toISOString(),
            });
          }
          updated += 1;
        }

        continue;
      }

      if (!resultStatus) continue;

      const unitsResult = settleUnits(
        Number(pick.odds_taken ?? -110),
        Number(pick.stake_units ?? 1),
        resultStatus
      );

      const finalScore =
        pick.sport === "MLB"
          ? formatMlbFinalScore(pick, homeScore, awayScore, getMlbFinalInnings(mlbLiveFeed))
          : await formatNbaFinalScore(pick, homeScore, awayScore);

      const { error: updateError } = await supabase
        .from("picks")
        .update({
          status: resultStatus,
          final_score: finalScore,
          final_stat: null,
          units_result: unitsResult,
          graded_at: new Date().toISOString(),
        })
        .eq("id", pick.id);

      if (!updateError) {
        if (pick.sport === "MLB" && pick.market_scope === "team") {
          try {
            await analyzeMlbPickGameReview({
              pickId: pick.id,
              pickDate: pick.pick_date ?? null,
              gameLabel: pick.game_label ?? null,
              homeTeam: pick.home_team,
              awayTeam: pick.away_team,
              gameStartTime: pick.game_start_time,
              side: pick.side,
              lineTaken: pick.line_taken,
              marketType: pick.market_type,
              resultStatus,
              gamePk: mlbGamePk,
              liveFeed: mlbLiveFeed,
            });
          } catch {
            // Game-flow review is helpful for learning, but grading the pick result comes first.
          }
        }
        updated += 1;
      }
    }

    if (access.access === "owner") {
      await recordManualSyncUsage("grade-picks");
    }

    const removedToday = await pruneFinalMlbSlateCache("mlb_odds_today");
    const removedTomorrow = await pruneFinalMlbSlateCache("mlb_odds_tomorrow");
    const nbaPickDates = Array.from(
      new Set(pendingPicks.filter((pick) => pick.sport === "NBA").map((pick) => pick.pick_date).filter(Boolean))
    ) as string[];
    const recheckReportsUpdated = await updateNbaInjuryRecheckOutcomes(supabase, nbaPickDates);

    return gradeResponse(req, {
      ok: true,
      updated,
      checked: pendingPicks.length,
      removedFromSlate: removedToday + removedTomorrow,
      message:
        recheckReportsUpdated > 0
          ? `Updated ${recheckReportsUpdated} NBA injury-switch report(s).`
          : undefined,
    });
  } catch (error) {
    return gradeResponse(
      req,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
