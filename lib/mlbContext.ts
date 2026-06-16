import { getCachedData, setCachedData } from "@/lib/cache";

type MlbSchedulePitcher = {
  id: number;
  fullName: string;
};

type MlbScheduleTeam = {
  team?: {
    id?: number;
    name?: string;
  };
  probablePitcher?: MlbSchedulePitcher;
};

type MlbScheduleGame = {
  gamePk?: number;
  gameDate?: string;
  teams?: {
    home?: MlbScheduleTeam;
    away?: MlbScheduleTeam;
  };
  venue?: {
    name?: string;
  };
};

type MlbScheduleResponse = {
  dates?: Array<{
    games?: MlbScheduleGame[];
  }>;
};

type MlbLiveFeedWeatherResponse = {
  gameData?: {
    weather?: {
      condition?: string;
      temp?: string;
      wind?: string;
    };
  };
};

type MlbPersonResponse = {
  people?: Array<{
    id?: number;
    fullName?: string;
    useName?: string;
    pitchHand?: {
      code?: "R" | "L";
    };
    primaryPosition?: {
      abbreviation?: string;
    };
  }>;
};

type MlbPitcherStatsResponse = {
  stats?: Array<{
    splits?: Array<{
      stat?: {
        era?: string;
        whip?: string;
        inningsPitched?: string;
        strikeOuts?: number;
        baseOnBalls?: number;
      };
    }>;
  }>;
};

type MlbSeasonStatsResponse = {
  stats?: Array<{
    splits?: Array<{
      stat?: Record<string, string | number | undefined>;
    }>;
  }>;
};

type MlbTransactionsResponse = {
  transactions?: Array<{
    typeDesc?: string;
    description?: string;
    person?: {
      id?: number;
      fullName?: string;
    };
  }>;
};

export type MlbStarterContext = {
  id: number | null;
  name: string;
  hand: "R" | "L";
  rating: number;
  confirmed: boolean;
  statsSummary: string;
};

export type MlbInjuryNote = {
  playerId?: number | null;
  playerName: string;
  note: string;
  role?: string;
  impact: number;
  summary?: string | null;
};

export type MlbWeatherContext = {
  condition: string | null;
  tempF: number | null;
  wind: string | null;
  windMph: number | null;
  windDirection: "out" | "in" | "cross" | "unknown";
  note: string | null;
};

export type MlbGameContext = {
  gamePk: number | null;
  gameLabel: string;
  commenceTime: string;
  venueName: string | null;
  homeStarter: MlbStarterContext | null;
  awayStarter: MlbStarterContext | null;
  weather: MlbWeatherContext | null;
  homeInjuries: MlbInjuryNote[];
  awayInjuries: MlbInjuryNote[];
  homeInjuryImpact: number;
  awayInjuryImpact: number;
  contextRiskScore: number;
  contextRiskNotes: string[];
};

export type MlbContextMap = Record<string, MlbGameContext>;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLabel(awayTeam: string, homeTeam: string) {
  return `${awayTeam} @ ${homeTeam}`;
}

function getSeasonFromBusinessDate(businessDate: string) {
  return Number(businessDate.slice(0, 4));
}

function safeNumber(value: string | number | undefined | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePlayerName(name: string | null | undefined) {
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

function getPlateAppearances(stat: Record<string, string | number | undefined>) {
  return (
    safeNumber(stat.plateAppearances) ??
    (safeNumber(stat.atBats) ?? 0) +
      (safeNumber(stat.baseOnBalls) ?? 0) +
      (safeNumber(stat.hitByPitch) ?? 0) +
      (safeNumber(stat.sacFlies) ?? 0)
  );
}

function buildPitcherSummary(era: number | null, whip: number | null, innings: number | null) {
  const parts: string[] = [];
  if (era !== null) parts.push(`ERA ${era.toFixed(2)}`);
  if (whip !== null) parts.push(`WHIP ${whip.toFixed(2)}`);
  if (innings !== null) parts.push(`${innings.toFixed(1)} IP`);
  return parts.join(" | ");
}

function computePitcherRating(stats: {
  era: number | null;
  whip: number | null;
  innings: number | null;
  strikeOuts: number | null;
  walks: number | null;
}) {
  const innings = stats.innings ?? 0;
  const reliability = clamp(innings / 45, 0.2, 1);
  const kPerNine =
    innings > 0 && stats.strikeOuts !== null ? (stats.strikeOuts / innings) * 9 : null;
  const bbPerNine = innings > 0 && stats.walks !== null ? (stats.walks / innings) * 9 : null;

  const eraImpact = stats.era !== null ? (4.1 - stats.era) * 7.5 : 0;
  const whipImpact = stats.whip !== null ? (1.28 - stats.whip) * 24 : 0;
  const strikeoutImpact = kPerNine !== null ? (kPerNine - 8.4) * 1.5 : 0;
  const walkImpact = bbPerNine !== null ? (3 - bbPerNine) * 1.2 : 0;

  return Math.round(clamp(100 + reliability * (eraImpact + whipImpact + strikeoutImpact + walkImpact), 84, 118));
}

type MlbPlayerImpactProfile = {
  playerId: number | null;
  playerName: string;
  role: string;
  impact: number;
  summary: string | null;
};

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`MLB context fetch failed: ${response.status} ${url}`);
  }

  return (await response.json()) as T;
}

async function searchPlayerIdentityByName(playerName: string) {
  const normalized = normalizePlayerName(playerName);
  if (!normalized) return null;

  const cacheKey = `mlb_player_identity_${normalized}`;
  const cached = await getCachedData(cacheKey);
  const cachedData = cached?.data as { id: number; fullName: string; position: string | null } | undefined;
  if (cachedData) {
    return cachedData;
  }

  const params = new URLSearchParams({
    sportId: "1",
    names: playerName,
  });
  const data = await fetchJson<MlbPersonResponse>(
    `https://statsapi.mlb.com/api/v1/people/search?${params.toString()}`
  );

  const person =
    (data.people ?? []).find((entry) => normalizePlayerName(entry.fullName) === normalized) ??
    data.people?.[0];

  if (!person?.id || !person.fullName) return null;

  const resolved = {
    id: person.id,
    fullName: person.fullName,
    position: person.primaryPosition?.abbreviation ?? null,
  };

  await setCachedData(cacheKey, resolved);
  return resolved;
}

async function fetchSeasonStatLine(
  personId: number,
  season: number,
  group: "hitting" | "pitching"
) {
  const cacheKey = `mlb_context_stats_${group}_${season}_${personId}`;
  const cached = await getCachedData(cacheKey);
  const cachedData = cached?.data as Record<string, string | number | undefined> | undefined;
  if (cachedData) {
    return cachedData;
  }

  const data = await fetchJson<MlbSeasonStatsResponse>(
    `https://statsapi.mlb.com/api/v1/people/${personId}/stats?stats=season&group=${group}&season=${season}`
  );
  const stat = data.stats?.[0]?.splits?.[0]?.stat ?? {};
  await setCachedData(cacheKey, stat);
  return stat;
}

function buildHitterImpactProfile(
  playerName: string,
  playerId: number | null,
  stat: Record<string, string | number | undefined>
): MlbPlayerImpactProfile {
  const plateAppearances = getPlateAppearances(stat);
  const ops =
    safeNumber(stat.ops) ??
    ((safeNumber(stat.obp) ?? 0) > 0 && (safeNumber(stat.slg) ?? 0) > 0
      ? (safeNumber(stat.obp) ?? 0) + (safeNumber(stat.slg) ?? 0)
      : null);
  const homeRuns = safeNumber(stat.homeRuns) ?? 0;
  const runsBattedIn = safeNumber(stat.rbi) ?? 0;
  const opsDelta = ops === null ? 0 : clamp(ops - 0.72, -0.1, 0.35);
  const volumeScore = clamp(plateAppearances / 160, 0, 1);
  const powerScore = clamp(homeRuns / 12, 0, 1) * 0.02;
  const runProductionScore = clamp(runsBattedIn / 30, 0, 1) * 0.015;
  const impact = Number(
    clamp(0.02 + Math.max(0, opsDelta) * 0.24 + volumeScore * 0.08 + powerScore + runProductionScore, 0.02, 0.16).toFixed(2)
  );
  const role =
    impact >= 0.12 ? "star bat" : impact >= 0.08 ? "core bat" : impact >= 0.05 ? "regular bat" : "depth bat";
  const summaryParts = [];
  if (ops !== null) summaryParts.push(`OPS ${ops.toFixed(3)}`);
  if (plateAppearances > 0) summaryParts.push(`${plateAppearances.toFixed(0)} PA`);
  if (homeRuns > 0) summaryParts.push(`${homeRuns.toFixed(0)} HR`);

  return {
    playerId,
    playerName,
    role,
    impact,
    summary: summaryParts.join(" | ") || null,
  };
}

function buildPitcherImpactProfile(
  playerName: string,
  playerId: number | null,
  stat: Record<string, string | number | undefined>
): MlbPlayerImpactProfile {
  const innings = safeNumber(stat.inningsPitched) ?? 0;
  const gamesStarted = safeNumber(stat.gamesStarted) ?? 0;
  const saves = safeNumber(stat.saves) ?? 0;
  const era = safeNumber(stat.era);
  const whip = safeNumber(stat.whip);
  const strikeOuts = safeNumber(stat.strikeOuts) ?? 0;
  const starterVolume = clamp(innings / 45, 0, 1);
  const relieverVolume = clamp(innings / 22, 0, 1);
  const runPreventionScore =
    Math.max(0, (4.15 - (era ?? 4.15)) * 0.018) + Math.max(0, (1.28 - (whip ?? 1.28)) * 0.06);
  const kScore =
    innings > 0 ? Math.max(0, ((strikeOuts / innings) * 9 - 8.4) * 0.008) : 0;
  const isStarter = gamesStarted >= 4 || innings >= 24;
  const baseImpact = isStarter ? 0.05 + starterVolume * 0.07 : 0.03 + relieverVolume * 0.04 + clamp(saves / 12, 0, 1) * 0.03;
  const impact = Number(clamp(baseImpact + runPreventionScore + kScore, 0.03, isStarter ? 0.16 : 0.11).toFixed(2));
  const role =
    isStarter ? (impact >= 0.12 ? "front-line starter" : impact >= 0.08 ? "rotation starter" : "depth starter") :
    saves >= 8 ? "late-inning reliever" : "bullpen arm";
  const summaryParts = [];
  if (era !== null) summaryParts.push(`ERA ${era.toFixed(2)}`);
  if (whip !== null) summaryParts.push(`WHIP ${whip.toFixed(2)}`);
  if (innings > 0) summaryParts.push(`${innings.toFixed(1)} IP`);

  return {
    playerId,
    playerName,
    role,
    impact,
    summary: summaryParts.join(" | ") || null,
  };
}

async function getInjuredPlayerImpactProfile(
  season: number,
  playerName: string,
  playerId?: number | null
): Promise<MlbPlayerImpactProfile> {
  const resolvedIdentity =
    playerId && Number.isFinite(playerId)
      ? { id: playerId, fullName: playerName, position: null as string | null }
      : await searchPlayerIdentityByName(playerName);
  const resolvedId = resolvedIdentity?.id ?? playerId ?? null;

  const cacheKey = `mlb_injury_impact_v1_${season}_${resolvedId ?? normalizePlayerName(playerName)}`;
  const cached = await getCachedData(cacheKey);
  const cachedData = cached?.data as MlbPlayerImpactProfile | undefined;
  if (cachedData) {
    return cachedData;
  }

  if (!resolvedId) {
    const fallback = {
      playerId: null,
      playerName,
      role: "unknown",
      impact: 0.04,
      summary: null,
    } satisfies MlbPlayerImpactProfile;
    await setCachedData(cacheKey, fallback);
    return fallback;
  }

  const position = resolvedIdentity?.position ?? null;
  const isPitcher = position === "P";
  const stat = await fetchSeasonStatLine(resolvedId, season, isPitcher ? "pitching" : "hitting");
  const profile = isPitcher
    ? buildPitcherImpactProfile(playerName, resolvedId, stat)
    : buildHitterImpactProfile(playerName, resolvedId, stat);

  await setCachedData(cacheKey, profile);
  return profile;
}

async function getPitcherProfile(personId: number, season: number, fallbackName: string): Promise<MlbStarterContext> {
  const cacheKey = `mlb_pitcher_profile_${season}_${personId}`;
  const cached = await getCachedData(cacheKey);
  const cachedData = cached?.data as MlbStarterContext | undefined;

  if (cachedData) {
    return cachedData;
  }

  const [personData, statData] = await Promise.all([
    fetchJson<MlbPersonResponse>(`https://statsapi.mlb.com/api/v1/people/${personId}`),
    fetchJson<MlbPitcherStatsResponse>(
      `https://statsapi.mlb.com/api/v1/people/${personId}/stats?stats=season&group=pitching&season=${season}`
    ),
  ]);

  const person = personData.people?.[0];
  const stat = statData.stats?.[0]?.splits?.[0]?.stat;

  const era = safeNumber(stat?.era);
  const whip = safeNumber(stat?.whip);
  const innings = safeNumber(stat?.inningsPitched);
  const strikeOuts = safeNumber(stat?.strikeOuts);
  const walks = safeNumber(stat?.baseOnBalls);

  const profile: MlbStarterContext = {
    id: personId,
    name: person?.fullName ?? fallbackName,
    hand: person?.pitchHand?.code === "L" ? "L" : "R",
    rating: computePitcherRating({
      era,
      whip,
      innings,
      strikeOuts,
      walks,
    }),
    confirmed: true,
    statsSummary: buildPitcherSummary(era, whip, innings),
  };

  await setCachedData(cacheKey, profile);
  return profile;
}

async function getRecentTeamInjuries(teamId: number, businessDate: string, season: number) {
  const endDate = new Date(`${businessDate}T12:00:00Z`);
  const startDate = new Date(endDate.getTime() - 14 * ONE_DAY_MS);
  const cacheKey = `mlb_team_injuries_v2_${teamId}_${businessDate}`;
  const cached = await getCachedData(cacheKey);
  const cachedData = cached?.data as MlbInjuryNote[] | undefined;

  if (cachedData) {
    return cachedData;
  }

  const params = new URLSearchParams({
    teamId: String(teamId),
    sportId: "1",
    startDate: startDate.toISOString().slice(0, 10),
    endDate: businessDate,
  });

  const data = await fetchJson<MlbTransactionsResponse>(
    `https://statsapi.mlb.com/api/v1/transactions?${params.toString()}`
  );

  const notes = (data.transactions ?? [])
    .filter((transaction) => {
      const combined = `${transaction.typeDesc ?? ""} ${transaction.description ?? ""}`.toLowerCase();
      return combined.includes("injured") || combined.includes("injury") || combined.includes("bereavement");
    })
    .slice(0, 6);

  const enrichedNotes = await Promise.all(
    notes.map(async (transaction) => {
      const playerName = transaction.person?.fullName ?? "Unknown player";
      const profile = await getInjuredPlayerImpactProfile(season, playerName, transaction.person?.id ?? null);
      const noteParts = [
        transaction.typeDesc ?? transaction.description ?? "Roster issue",
        profile.role !== "unknown" ? `${profile.role} impact ${profile.impact.toFixed(2)}` : null,
        profile.summary,
      ].filter(Boolean);

      return {
        playerId: profile.playerId,
        playerName: profile.playerName,
        note: noteParts.join(" | "),
        role: profile.role,
        impact: profile.impact,
        summary: profile.summary,
      } satisfies MlbInjuryNote;
    })
  );

  const sortedNotes = enrichedNotes
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  await setCachedData(cacheKey, sortedNotes);
  return sortedNotes;
}

function getInjuryImpact(notes: MlbInjuryNote[]) {
  const totalImpact = notes.reduce((sum, note) => sum + Number(note.impact ?? 0), 0);
  return Number(clamp(totalImpact, 0, 0.35).toFixed(2));
}

function parseWindMph(wind: string | null | undefined) {
  const match = (wind ?? "").match(/(\d+(?:\.\d+)?)\s*mph/i);
  if (!match) return null;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseWindDirection(wind: string | null | undefined): MlbWeatherContext["windDirection"] {
  const normalized = (wind ?? "").toLowerCase();
  if (/\bout\b|out to|to (left|center|right)/.test(normalized)) return "out";
  if (/\bin\b|in from|from (left|center|right)/.test(normalized)) return "in";
  if (/\bcross\b|left to right|right to left/.test(normalized)) return "cross";
  return "unknown";
}

function buildWeatherNote(weather: MlbWeatherContext | null) {
  if (!weather) return null;

  const parts = [
    weather.condition,
    weather.tempF !== null ? `${weather.tempF}F` : null,
    weather.wind,
  ].filter(Boolean);

  if (parts.length === 0) return null;
  return parts.join(" | ");
}

async function fetchGameWeather(gamePk: number | null | undefined, businessDate: string) {
  if (!gamePk) return null;

  const cacheKey = `mlb_game_weather_v1_${businessDate}_${gamePk}`;
  const cached = await getCachedData(cacheKey);
  const cachedData = cached?.data as MlbWeatherContext | null | undefined;
  if (cachedData !== undefined) return cachedData;

  try {
    const data = await fetchJson<MlbLiveFeedWeatherResponse>(
      `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`
    );
    const rawWeather = data.gameData?.weather;
    const tempF = safeNumber(rawWeather?.temp);
    const wind = rawWeather?.wind ?? null;
    const weather: MlbWeatherContext = {
      condition: rawWeather?.condition ?? null,
      tempF,
      wind,
      windMph: parseWindMph(wind),
      windDirection: parseWindDirection(wind),
      note: null,
    };

    weather.note = buildWeatherNote(weather);
    await setCachedData(cacheKey, weather);
    return weather;
  } catch {
    await setCachedData(cacheKey, null);
    return null;
  }
}

function buildMlbContextRisk(params: {
  homeStarter: MlbStarterContext | null;
  awayStarter: MlbStarterContext | null;
  homeInjuryImpact: number;
  awayInjuryImpact: number;
  weather: MlbWeatherContext | null;
}) {
  const notes: string[] = [];
  let score = 0;

  if (!params.homeStarter) {
    score += 12;
    notes.push("home starter not confirmed");
  } else if (!params.homeStarter.confirmed) {
    score += 8;
    notes.push("home starter stats were unavailable");
  }

  if (!params.awayStarter) {
    score += 12;
    notes.push("away starter not confirmed");
  } else if (!params.awayStarter.confirmed) {
    score += 8;
    notes.push("away starter stats were unavailable");
  }

  if (params.homeInjuryImpact >= 0.2) {
    score += 8;
    notes.push("home lineup has notable recent injury impact");
  }

  if (params.awayInjuryImpact >= 0.2) {
    score += 8;
    notes.push("away lineup has notable recent injury impact");
  }

  if (params.weather?.windMph !== null && params.weather?.windMph !== undefined && params.weather.windMph >= 10) {
    score += params.weather.windDirection === "unknown" ? 4 : 7;
    notes.push(`weather watch: ${params.weather.wind ?? `${params.weather.windMph} mph wind`}`);
  }

  return {
    score: Math.round(clamp(score, 0, 40)),
    notes,
  };
}

async function buildStarterContext(
  probablePitcher: MlbSchedulePitcher | undefined,
  season: number,
  fallbackTeamPitching: number
): Promise<MlbStarterContext | null> {
  if (!probablePitcher?.id) return null;

  try {
    return await getPitcherProfile(probablePitcher.id, season, probablePitcher.fullName);
  } catch {
    return {
      id: probablePitcher.id,
      name: probablePitcher.fullName,
      hand: "R",
      rating: fallbackTeamPitching,
      confirmed: false,
      statsSummary: "Starter stats unavailable",
    };
  }
}

export async function fetchMlbGameContext(params: {
  businessDate: string;
  teamPitchingRatings: Record<string, { startingPitching: number }>;
}): Promise<MlbContextMap> {
  const { businessDate, teamPitchingRatings } = params;
  const season = getSeasonFromBusinessDate(businessDate);
  const schedule = await fetchJson<MlbScheduleResponse>(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${businessDate}&hydrate=probablePitcher`
  );

  const games = schedule.dates?.flatMap((date) => date.games ?? []) ?? [];
  const contextEntries = await Promise.all(
    games.map(async (game) => {
      const homeTeamName = game.teams?.home?.team?.name;
      const awayTeamName = game.teams?.away?.team?.name;
      const homeTeamId = game.teams?.home?.team?.id;
      const awayTeamId = game.teams?.away?.team?.id;

      if (!homeTeamName || !awayTeamName || !homeTeamId || !awayTeamId || !game.gameDate) {
        return null;
      }

      const [homeStarter, awayStarter, homeInjuries, awayInjuries, weather] = await Promise.all([
        buildStarterContext(
          game.teams?.home?.probablePitcher,
          season,
          teamPitchingRatings[homeTeamName]?.startingPitching ?? 100
        ),
        buildStarterContext(
          game.teams?.away?.probablePitcher,
          season,
          teamPitchingRatings[awayTeamName]?.startingPitching ?? 100
        ),
        getRecentTeamInjuries(homeTeamId, businessDate, season),
        getRecentTeamInjuries(awayTeamId, businessDate, season),
        fetchGameWeather(game.gamePk ?? null, businessDate),
      ]);
      const homeInjuryImpact = getInjuryImpact(homeInjuries);
      const awayInjuryImpact = getInjuryImpact(awayInjuries);
      const contextRisk = buildMlbContextRisk({
        homeStarter,
        awayStarter,
        homeInjuryImpact,
        awayInjuryImpact,
        weather,
      });

      const context: MlbGameContext = {
        gamePk: game.gamePk ?? null,
        gameLabel: normalizeLabel(awayTeamName, homeTeamName),
        commenceTime: game.gameDate,
        venueName: game.venue?.name ?? null,
        homeStarter,
        awayStarter,
        weather,
        homeInjuries,
        awayInjuries,
        homeInjuryImpact,
        awayInjuryImpact,
        contextRiskScore: contextRisk.score,
        contextRiskNotes: contextRisk.notes,
      };

      return [context.gameLabel, context] as const;
    })
  );

  return Object.fromEntries(contextEntries.filter(Boolean) as Array<readonly [string, MlbGameContext]>);
}
