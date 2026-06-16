import { getExpectedNbaBusinessDate, type NbaOddsCacheDay } from "@/lib/nbaOddsCache";
import {
  getExpectedSoccerBusinessDate,
  normalizeSoccerCompetition,
  type SoccerOddsCacheDay,
} from "@/lib/soccerOddsCache";
import type { SoccerCompetitionKey } from "@/lib/soccerModel";

type SlateSport = "NBA" | "SOCCER";

type EspnEvent = {
  id?: string;
  name?: string;
  shortName?: string;
  date?: string;
  competitions?: Array<{
    date?: string;
    competitors?: Array<{ team?: { displayName?: string; shortDisplayName?: string } }>;
  }>;
};

type EspnScoreboardResponse = {
  events?: EspnEvent[];
};

export type SlateAvailability = {
  ok: boolean;
  sport: SlateSport;
  competition?: SoccerCompetitionKey;
  day: NbaOddsCacheDay | SoccerOddsCacheDay;
  businessDate: string;
  hasGames: boolean | null;
  gameCount: number | null;
  checkedAt: string;
  source: "espn";
  error?: string;
  games: Array<{
    id: string;
    label: string;
    startTime: string | null;
  }>;
};

function toEspnDate(dateKey: string) {
  return dateKey.replace(/-/g, "");
}

function getSoccerEspnLeague(competition: SoccerCompetitionKey) {
  return competition === "mls" ? "usa.1" : "fifa.world";
}

function getEventLabel(event: EspnEvent) {
  if (event.shortName || event.name) return event.shortName ?? event.name ?? "Scheduled game";

  const competitors = event.competitions?.[0]?.competitors ?? [];
  const names = competitors
    .map((competitor) => competitor.team?.shortDisplayName ?? competitor.team?.displayName)
    .filter(Boolean);

  return names.length >= 2 ? `${names[1]} @ ${names[0]}` : "Scheduled game";
}

function getEventStartTime(event: EspnEvent) {
  return event.date ?? event.competitions?.[0]?.date ?? null;
}

async function fetchEspnAvailability(params: {
  sport: SlateSport;
  competition?: SoccerCompetitionKey;
  day: NbaOddsCacheDay | SoccerOddsCacheDay;
  businessDate: string;
  url: string;
}): Promise<SlateAvailability> {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(params.url, { cache: "no-store" });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        sport: params.sport,
        competition: params.competition,
        day: params.day,
        businessDate: params.businessDate,
        hasGames: null,
        gameCount: null,
        checkedAt,
        source: "espn",
        error: `ESPN schedule check failed: ${response.status} ${text.slice(0, 180)}`,
        games: [],
      };
    }

    const payload = JSON.parse(text) as EspnScoreboardResponse;
    const games = (payload.events ?? []).map((event, index) => ({
      id: event.id ?? `event-${index}`,
      label: getEventLabel(event),
      startTime: getEventStartTime(event),
    }));

    return {
      ok: true,
      sport: params.sport,
      competition: params.competition,
      day: params.day,
      businessDate: params.businessDate,
      hasGames: games.length > 0,
      gameCount: games.length,
      checkedAt,
      source: "espn",
      games,
    };
  } catch (error) {
    return {
      ok: false,
      sport: params.sport,
      competition: params.competition,
      day: params.day,
      businessDate: params.businessDate,
      hasGames: null,
      gameCount: null,
      checkedAt,
      source: "espn",
      error: error instanceof Error ? error.message : "Unknown ESPN schedule check error",
      games: [],
    };
  }
}

export async function getNbaSlateAvailability(day: NbaOddsCacheDay = "today") {
  const businessDate = getExpectedNbaBusinessDate(day);
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${toEspnDate(
    businessDate
  )}`;

  return fetchEspnAvailability({
    sport: "NBA",
    day,
    businessDate,
    url,
  });
}

export async function getSoccerSlateAvailability(
  competitionInput: string | null | undefined,
  day: SoccerOddsCacheDay = "today"
) {
  const competition = normalizeSoccerCompetition(competitionInput);
  const businessDate = getExpectedSoccerBusinessDate(day);
  const league = getSoccerEspnLeague(competition);
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${toEspnDate(
    businessDate
  )}`;

  return fetchEspnAvailability({
    sport: "SOCCER",
    competition,
    day,
    businessDate,
    url,
  });
}
