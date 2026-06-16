import { getCachedData, setCachedData } from "@/lib/cache";
import {
  getNbaImpactScore,
  isNbaHighRiskStatus,
  type NbaInjuryReportRow,
  type NbaInjurySyncData,
} from "@/lib/nbaInjuries";

type EspnNbaCompetitor = {
  homeAway?: string;
  team?: {
    displayName?: string;
  };
  score?: string;
  linescores?: Array<{
    value?: number | string | null;
    displayValue?: string | null;
    period?: number | null;
  }>;
};

type EspnNbaCompetition = {
  competitors?: EspnNbaCompetitor[];
  status?: {
    type?: {
      detail?: string;
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

type EspnNbaAthlete = {
  athlete?: {
    displayName?: string;
  };
  didNotPlay?: boolean;
};

type EspnNbaPlayerStatGroup = {
  athletes?: EspnNbaAthlete[];
};

type EspnNbaBoxscoreTeam = {
  statistics?: EspnNbaPlayerStatGroup[];
};

type EspnNbaSummaryResponse = {
  header?: {
    competitions?: EspnNbaCompetition[];
  };
  boxscore?: {
    players?: EspnNbaBoxscoreTeam[];
  };
  [key: string]: unknown;
};

type NbaGameFlowSnapshot = {
  overtimeCount: number;
  statusDetail: string | null;
  halftimeHomeScore: number | null;
  halftimeAwayScore: number | null;
  regulationHomeScore: number | null;
  regulationAwayScore: number | null;
  finalHomeScore: number | null;
  finalAwayScore: number | null;
  regulationMargin: number | null;
  finalMargin: number | null;
};

export type NbaGameReview = {
  pickDate: string;
  gameLabel: string;
  eventId: string | null;
  checkedAt: string;
  shouldExcludeFromLearning: boolean;
  exclusionReasons: string[];
  pregameNotes: string[];
  inGameNotes: string[];
  detectedPlayers: string[];
  gameFlow: NbaGameFlowSnapshot | null;
};

const NBA_GAME_REVIEW_CACHE_VERSION = 2;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTeamName(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function normalizePlayerName(value: string | null | undefined) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGameLabel(awayTeam: string | null | undefined, homeTeam: string | null | undefined) {
  return `${awayTeam ?? ""} @ ${homeTeam ?? ""}`.trim();
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

function getReviewCacheKey(pickDate: string, gameLabel: string) {
  const safeLabel = gameLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `nba_game_review_v${NBA_GAME_REVIEW_CACHE_VERSION}_${pickDate}_${safeLabel}`;
}

function getEspnCompetition(event: EspnNbaEvent) {
  return event.competitions?.[0] ?? null;
}

function getSummaryCompetition(summary: EspnNbaSummaryResponse | null | undefined) {
  return summary?.header?.competitions?.[0] ?? null;
}

function findMatchingEspnEvent(
  homeTeam: string,
  awayTeam: string,
  gameStartTime: string | null | undefined,
  events: EspnNbaEvent[]
) {
  const matching = events.filter((event) => {
    const competition = getEspnCompetition(event);
    const homeCompetitor = competition?.competitors?.find((competitor) => competitor.homeAway === "home");
    const awayCompetitor = competition?.competitors?.find((competitor) => competitor.homeAway === "away");

    return (
      normalizeTeamName(homeCompetitor?.team?.displayName) === normalizeTeamName(homeTeam) &&
      normalizeTeamName(awayCompetitor?.team?.displayName) === normalizeTeamName(awayTeam)
    );
  });

  if (matching.length <= 1) return matching[0] ?? null;
  if (!gameStartTime) return matching[0] ?? null;

  const pickStart = new Date(gameStartTime).getTime();
  return (
    matching
      .map((event) => ({
        event,
        diff: Math.abs(pickStart - new Date(event.date ?? gameStartTime).getTime()),
      }))
      .sort((a, b) => a.diff - b.diff)[0]?.event ?? null
  );
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

function collectStringFragments(value: unknown, bucket: string[], limit = 250) {
  if (bucket.length >= limit || value === null || value === undefined) return;

  if (typeof value === "string") {
    const normalized = normalizeText(value);
    if (normalized.length >= 8) {
      bucket.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (bucket.length >= limit) break;
      collectStringFragments(entry, bucket, limit);
    }
    return;
  }

  if (typeof value === "object") {
    for (const entry of Object.values(value)) {
      if (bucket.length >= limit) break;
      collectStringFragments(entry, bucket, limit);
    }
  }
}

function extractHighImpactDidNotPlay(summary: EspnNbaSummaryResponse) {
  const names = new Set<string>();

  for (const teamBlock of summary.boxscore?.players ?? []) {
    for (const statGroup of teamBlock.statistics ?? []) {
      for (const athlete of statGroup.athletes ?? []) {
        const name = normalizeText(athlete.athlete?.displayName);
        if (!name || !athlete.didNotPlay) continue;
        if (getNbaImpactScore(name) < 4) continue;
        names.add(name);
      }
    }
  }

  return [...names];
}

function parseNumericScore(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function sumLineScores(linescores: EspnNbaCompetitor["linescores"] | undefined, count?: number) {
  const relevant = count === undefined ? linescores ?? [] : (linescores ?? []).slice(0, count);
  if (relevant.length === 0) return null;

  let total = 0;
  for (const linescore of relevant) {
    const value = parseNumericScore(linescore?.value ?? linescore?.displayValue ?? null);
    if (value === null) return null;
    total += value;
  }

  return total;
}

function extractGameFlowSnapshot(
  event: EspnNbaEvent | null,
  summary: EspnNbaSummaryResponse | null
): NbaGameFlowSnapshot | null {
  const competition = getSummaryCompetition(summary) ?? (event ? getEspnCompetition(event) : null);
  if (!competition) return null;

  const homeCompetitor = competition.competitors?.find((competitor) => competitor.homeAway === "home");
  const awayCompetitor = competition.competitors?.find((competitor) => competitor.homeAway === "away");
  if (!homeCompetitor || !awayCompetitor) return null;

  const homeLinescores = homeCompetitor.linescores ?? [];
  const awayLinescores = awayCompetitor.linescores ?? [];
  const maxPeriods = Math.max(homeLinescores.length, awayLinescores.length);
  const overtimeCount = maxPeriods > 4 ? maxPeriods - 4 : 0;

  const halftimeHomeScore = sumLineScores(homeLinescores, 2);
  const halftimeAwayScore = sumLineScores(awayLinescores, 2);
  const regulationHomeScore = maxPeriods >= 4 ? sumLineScores(homeLinescores, 4) : null;
  const regulationAwayScore = maxPeriods >= 4 ? sumLineScores(awayLinescores, 4) : null;
  const finalHomeScore =
    sumLineScores(homeLinescores) ?? parseNumericScore(homeCompetitor.score ?? null);
  const finalAwayScore =
    sumLineScores(awayLinescores) ?? parseNumericScore(awayCompetitor.score ?? null);

  const regulationMargin =
    regulationHomeScore === null || regulationAwayScore === null
      ? null
      : regulationHomeScore - regulationAwayScore;
  const finalMargin =
    finalHomeScore === null || finalAwayScore === null ? null : finalHomeScore - finalAwayScore;

  return {
    overtimeCount,
    statusDetail: competition.status?.type?.detail ?? null,
    halftimeHomeScore,
    halftimeAwayScore,
    regulationHomeScore,
    regulationAwayScore,
    finalHomeScore,
    finalAwayScore,
    regulationMargin,
    finalMargin,
  };
}

function findImpactfulMentions(
  fragments: string[],
  trackedPlayers: string[]
) {
  const ejectionPattern = /\beject(ed|ion)?\b|\bflagrant 2\b/i;
  const leftGamePattern =
    /\bleft the game\b|\bdid not return\b|\bwill not return\b|\bexited\b|\binjury\b|\bankle\b|\bhamstring\b|\bknee\b|\bconcussion\b/i;
  const normalizedPlayers = trackedPlayers.map((player) => ({
    original: player,
    normalized: normalizePlayerName(player),
  }));

  const notes = new Set<string>();
  const matchedPlayers = new Set<string>();

  for (const fragment of fragments) {
    const normalizedFragment = normalizePlayerName(fragment);
    const mentionedPlayers = normalizedPlayers.filter((player) =>
      normalizedFragment.includes(player.normalized)
    );

    if (mentionedPlayers.length === 0) continue;

    if (ejectionPattern.test(fragment)) {
      for (const player of mentionedPlayers) {
        matchedPlayers.add(player.original);
        notes.add(`${player.original} was mentioned in an ejection-related game report.`);
      }
    }

    if (leftGamePattern.test(fragment)) {
      for (const player of mentionedPlayers) {
        matchedPlayers.add(player.original);
        notes.add(`${player.original} was mentioned in an injury/left-game report.`);
      }
    }
  }

  return {
    notes: [...notes],
    matchedPlayers: [...matchedPlayers],
  };
}

function getMatchingPregameRows(
  rows: NbaInjuryReportRow[],
  homeTeam: string,
  awayTeam: string
) {
  return rows.filter((row) => {
    const normalizedTeam = normalizeTeamName(row.team);
    return (
      normalizedTeam === normalizeTeamName(homeTeam) ||
      normalizedTeam === normalizeTeamName(awayTeam)
    );
  });
}

export async function getNbaGameReview(
  pickDate: string,
  gameLabel: string
) {
  const cached = await getCachedData(getReviewCacheKey(pickDate, gameLabel));
  return (cached?.data as NbaGameReview | null) ?? null;
}

export async function analyzeNbaGameForLearning(params: {
  pickDate: string;
  gameLabel?: string | null;
  homeTeam: string;
  awayTeam: string;
  gameStartTime?: string | null;
}) {
  const gameLabel = params.gameLabel ?? buildGameLabel(params.awayTeam, params.homeTeam);
  const cached = await getNbaGameReview(params.pickDate, gameLabel);
  if (cached) return cached;

  const checkedAt = new Date().toISOString();
  const pregameNotes: string[] = [];
  const inGameNotes: string[] = [];
  const exclusionReasons: string[] = [];
  const detectedPlayers = new Set<string>();

  const injuryReportRow = await getCachedData(`nba_injury_report_${params.pickDate}`);
  const injuryReport = (injuryReportRow?.data as NbaInjurySyncData | null) ?? null;
  const pregameRows = getMatchingPregameRows(injuryReport?.rows ?? [], params.homeTeam, params.awayTeam);
  const highImpactPregameRows = pregameRows.filter((row) => row.impactScore >= 4);

  for (const row of highImpactPregameRows) {
    detectedPlayers.add(row.playerName);
    pregameNotes.push(`${row.playerName} was ${row.statusLabel.toLowerCase()} before tip.`);
  }

  const pickStartDate = params.gameStartTime ? new Date(params.gameStartTime) : new Date(`${params.pickDate}T19:00:00-04:00`);
  const searchDates = Array.from(
    new Set(
      [
        params.pickDate.replace(/-/g, ""),
        formatEspnDate(pickStartDate),
        pickStartDate.toISOString().slice(0, 10).replace(/-/g, ""),
      ].filter(Boolean)
    )
  ) as string[];

  const matchingEvents: EspnNbaEvent[] = [];
  for (const dateKey of searchDates) {
    try {
      const scoreboard = await fetchEspnNbaScoreboard(dateKey);
      matchingEvents.push(...(scoreboard.events ?? []));
    } catch {
      // ignore and let the review fall back to pregame-only notes
    }
  }

  const matchingEvent = findMatchingEspnEvent(
    params.homeTeam,
    params.awayTeam,
    params.gameStartTime,
    matchingEvents
  );

  let summary: EspnNbaSummaryResponse | null = null;
  if (matchingEvent?.id) {
    try {
      summary = await fetchEspnNbaSummary(matchingEvent.id);
    } catch {
      summary = null;
    }
  }

  const gameFlow = extractGameFlowSnapshot(matchingEvent, summary);

  if (gameFlow) {
    if (gameFlow.overtimeCount > 0) {
      const overtimeLabel = gameFlow.overtimeCount === 1 ? "OT" : `${gameFlow.overtimeCount}OT`;
      const regulationScoreNote =
        gameFlow.regulationHomeScore !== null && gameFlow.regulationAwayScore !== null
          ? ` Regulation ended ${params.awayTeam} ${gameFlow.regulationAwayScore} - ${params.homeTeam} ${gameFlow.regulationHomeScore}.`
          : "";
      exclusionReasons.push(
        `Game went to ${overtimeLabel}, so the final margin was not a clean regulation learning signal.${regulationScoreNote}`
      );
    }
  }

  if (summary) {
    const stringFragments: string[] = [];
    collectStringFragments(summary, stringFragments);
    const knownImpactNames = new Set<string>([
      ...highImpactPregameRows.map((row) => row.playerName),
      ...extractHighImpactDidNotPlay(summary),
    ]);

    const impactfulMentions = findImpactfulMentions(stringFragments, [...knownImpactNames]);
    for (const note of impactfulMentions.notes) {
      inGameNotes.push(note);
    }
    for (const player of impactfulMentions.matchedPlayers) {
      detectedPlayers.add(player);
    }

    const didNotPlayStars = extractHighImpactDidNotPlay(summary);
    for (const player of didNotPlayStars) {
      detectedPlayers.add(player);

      const hadHighRiskPregameFlag = highImpactPregameRows.some(
        (row) =>
          normalizePlayerName(row.playerName) === normalizePlayerName(player) &&
          isNbaHighRiskStatus(row.status)
      );

      if (!hadHighRiskPregameFlag) {
        exclusionReasons.push(`${player} did not play unexpectedly.`);
      }
    }
  }

  for (const note of inGameNotes) {
    exclusionReasons.push(note);
  }

  const review: NbaGameReview = {
    pickDate: params.pickDate,
    gameLabel,
    eventId: matchingEvent?.id ?? null,
    checkedAt,
    shouldExcludeFromLearning: exclusionReasons.length > 0,
    exclusionReasons,
    pregameNotes,
    inGameNotes,
    detectedPlayers: [...detectedPlayers],
    gameFlow,
  };

  await setCachedData(getReviewCacheKey(params.pickDate, gameLabel), review);
  return review;
}
