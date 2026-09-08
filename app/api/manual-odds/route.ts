import { NextRequest, NextResponse } from "next/server";
import { setCachedData } from "@/lib/cache";
import { fetchMlbGameContext } from "@/lib/mlbContext";
import { buildMlbLearningProfile } from "@/lib/mlbLearning";
import { mlbTeamRatings } from "@/lib/mlbRatings";
import { getExpectedMlbBusinessDate, type MlbOddsCacheDay } from "@/lib/mlbOddsCache";
import { getExpectedNbaBusinessDate, type NbaOddsCacheDay } from "@/lib/nbaOddsCache";
import { recordManualSyncUsage, requireSyncAccess } from "@/lib/ownerAuth";
import { getRequestOrigin } from "@/lib/requestOrigin";
import {
  getExpectedSoccerBusinessDate,
  getSoccerOddsCacheKey,
  normalizeSoccerCompetition,
  type SoccerOddsCacheDay,
} from "@/lib/soccerOddsCache";

type ManualSport = "MLB" | "NBA" | "SOCCER";
type ManualDay = "today" | "tomorrow";
type ManualRow = Record<string, string>;

type ManualMarket = {
  key: string;
  outcomes: Array<{
    name: string;
    description?: string | null;
    price?: number | null;
    point?: number | null;
  }>;
};

type ManualOddsGame = {
  id: string;
  sport_key?: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    last_update: string;
    markets: ManualMarket[];
  }>;
};

const SPORT_TITLES: Record<ManualSport, string> = {
  MLB: "MLB",
  NBA: "NBA",
  SOCCER: "Soccer",
};

const SPORT_KEYS: Record<ManualSport, string> = {
  MLB: "baseball_mlb",
  NBA: "basketball_nba",
  SOCCER: "soccer_manual",
};

function normalizeSport(value: string | null | undefined): ManualSport {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "MLB" || normalized === "NBA" || normalized === "SOCCER") {
    return normalized;
  }
  return "MLB";
}

function normalizeDay(value: string | null | undefined): ManualDay {
  return value === "tomorrow" ? "tomorrow" : "today";
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getCell(row: ManualRow, names: string[]) {
  for (const name of names) {
    const value = row[normalizeHeader(name)];
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return "";
}

function parseNumber(value: string) {
  const cleaned = value.replace(/^\+/, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parsePrice(row: ManualRow, names: string[]) {
  const value = parseNumber(getCell(row, names));
  return value === null ? null : Math.round(value);
}

function parsePoint(row: ManualRow, names: string[]) {
  return parseNumber(getCell(row, names));
}

function slugPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      i++;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function detectDelimiter(headerLine: string) {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  if (tabs >= commas && tabs >= semicolons && tabs > 0) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

function parseManualRows(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("Paste a header row and at least one odds row.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitDelimitedLine(lines[0], delimiter).map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    const row: ManualRow = {};

    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });

    return row;
  });
}

function getEtOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  }).formatToParts(date);

  const tzName = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);

  if (!match) return -300;

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

function etDateTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0) {
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetMinutes = getEtOffsetMinutes(approxUtc);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60 * 1000);
}

function parseClock(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const suffix = match[3]?.toLowerCase().replace(/\./g, "") ?? "";

  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;

  return { hour, minute };
}

function parseBusinessDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function normalizeCommenceTime(value: string, businessDate: string, index: number) {
  const trimmed = value.trim();

  if (trimmed && (trimmed.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(trimmed))) {
    const direct = new Date(trimmed);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  }

  const dateTimeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
  const datePart = parseBusinessDate(dateTimeMatch?.[1] ?? businessDate);
  const clock = parseClock(dateTimeMatch?.[2] ?? trimmed);

  if (datePart && clock) {
    return etDateTimeToUtc(datePart.year, datePart.month, datePart.day, clock.hour, clock.minute).toISOString();
  }

  const fallbackDate = parseBusinessDate(businessDate);
  if (!fallbackDate) return new Date().toISOString();

  const fallback = etDateTimeToUtc(fallbackDate.year, fallbackDate.month, fallbackDate.day, 19, 0);
  fallback.setUTCMinutes(fallback.getUTCMinutes() + index * 30);
  return fallback.toISOString();
}

function buildMoneylineMarket(row: ManualRow, awayTeam: string, homeTeam: string, sport: ManualSport) {
  const awayPrice = parsePrice(row, ["away_ml", "away_moneyline", "away_money_line", "visitor_ml", "road_ml"]);
  const homePrice = parsePrice(row, ["home_ml", "home_moneyline", "home_money_line"]);
  const drawPrice = parsePrice(row, ["draw_ml", "draw_moneyline", "tie_ml"]);
  const outcomes: ManualMarket["outcomes"] = [];

  if (awayPrice !== null) outcomes.push({ name: awayTeam, price: awayPrice });
  if (homePrice !== null) outcomes.push({ name: homeTeam, price: homePrice });
  if (sport === "SOCCER" && drawPrice !== null) outcomes.push({ name: "Draw", price: drawPrice });

  return outcomes.length > 0 ? { key: "h2h", outcomes } : null;
}

function buildSpreadMarket(row: ManualRow, awayTeam: string, homeTeam: string) {
  let homePoint = parsePoint(row, ["home_spread", "home_runline", "home_run_line", "spread", "runline", "run_line"]);
  let awayPoint = parsePoint(row, ["away_spread", "away_runline", "away_run_line", "visitor_spread", "road_spread"]);
  const homePrice = parsePrice(row, [
    "home_spread_odds",
    "home_spread_price",
    "home_runline_odds",
    "home_run_line_odds",
    "home_rl_odds",
    "spread_odds",
  ]);
  const awayPrice = parsePrice(row, [
    "away_spread_odds",
    "away_spread_price",
    "away_runline_odds",
    "away_run_line_odds",
    "away_rl_odds",
    "visitor_spread_odds",
    "road_spread_odds",
  ]);

  if (homePoint === null && awayPoint !== null) homePoint = -awayPoint;
  if (awayPoint === null && homePoint !== null) awayPoint = -homePoint;

  const outcomes: ManualMarket["outcomes"] = [];
  if (awayPoint !== null || awayPrice !== null) outcomes.push({ name: awayTeam, point: awayPoint, price: awayPrice });
  if (homePoint !== null || homePrice !== null) outcomes.push({ name: homeTeam, point: homePoint, price: homePrice });

  return outcomes.length > 0 ? { key: "spreads", outcomes } : null;
}

function buildTotalMarket(row: ManualRow) {
  const total = parsePoint(row, ["total", "game_total", "ou", "o_u"]);
  const overPrice = parsePrice(row, ["over_odds", "over_price", "o_odds"]);
  const underPrice = parsePrice(row, ["under_odds", "under_price", "u_odds"]);
  const outcomes: ManualMarket["outcomes"] = [];

  if (total !== null || overPrice !== null) outcomes.push({ name: "Over", point: total, price: overPrice });
  if (total !== null || underPrice !== null) outcomes.push({ name: "Under", point: total, price: underPrice });

  return outcomes.length > 0 ? { key: "totals", outcomes } : null;
}

function buildGameFromRow(row: ManualRow, index: number, businessDate: string, sport: ManualSport): ManualOddsGame {
  const awayTeam = getCell(row, ["away_team", "away", "visitor", "visitor_team", "road_team"]);
  const homeTeam = getCell(row, ["home_team", "home"]);

  if (!awayTeam || !homeTeam) {
    throw new Error(`Row ${index + 2} needs away_team and home_team.`);
  }

  const markets = [
    buildMoneylineMarket(row, awayTeam, homeTeam, sport),
    buildSpreadMarket(row, awayTeam, homeTeam),
    buildTotalMarket(row),
  ].filter((market): market is ManualMarket => Boolean(market));

  if (markets.length === 0) {
    throw new Error(`Row ${index + 2} needs at least one odds market.`);
  }

  const bookTitle = getCell(row, ["sportsbook", "bookmaker", "book"]) || "DraftKings";
  const bookKey = bookTitle.toLowerCase() === "draftkings" ? "draftkings" : slugPart(bookTitle) || "manual";
  const eventId =
    getCell(row, ["id", "event_id", "external_event_id"]) ||
    `manual-${slugPart(SPORT_TITLES[sport])}-${businessDate}-${slugPart(awayTeam)}-at-${slugPart(homeTeam)}`;
  const startTime = getCell(row, ["commence_time", "start_time", "game_time", "time"]);

  return {
    id: eventId,
    sport_key: SPORT_KEYS[sport],
    sport_title: SPORT_TITLES[sport],
    commence_time: normalizeCommenceTime(startTime, businessDate, index),
    home_team: homeTeam,
    away_team: awayTeam,
    bookmakers: [
      {
        key: bookKey,
        title: bookTitle,
        last_update: new Date().toISOString(),
        markets,
      },
    ],
  };
}

function normalizeJsonGame(game: any, index: number, businessDate: string, sport: ManualSport): ManualOddsGame {
  const awayTeam = String(game?.away_team ?? game?.awayTeam ?? "").trim();
  const homeTeam = String(game?.home_team ?? game?.homeTeam ?? "").trim();

  if (!awayTeam || !homeTeam) {
    throw new Error(`JSON game ${index + 1} needs away_team and home_team.`);
  }

  return {
    id:
      String(game?.id ?? "").trim() ||
      `manual-${slugPart(SPORT_TITLES[sport])}-${businessDate}-${slugPart(awayTeam)}-at-${slugPart(homeTeam)}`,
    sport_key: String(game?.sport_key ?? SPORT_KEYS[sport]),
    sport_title: String(game?.sport_title ?? SPORT_TITLES[sport]),
    commence_time: normalizeCommenceTime(String(game?.commence_time ?? ""), businessDate, index),
    home_team: homeTeam,
    away_team: awayTeam,
    bookmakers: Array.isArray(game?.bookmakers) ? game.bookmakers : [],
  };
}

function maybeParseJson(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  return JSON.parse(trimmed);
}

function extractJsonBusinessDate(raw: string) {
  try {
    const parsed = maybeParseJson(raw);
    if (parsed && !Array.isArray(parsed) && typeof parsed.businessDate === "string") {
      return parsed.businessDate;
    }
  } catch {
    return null;
  }

  return null;
}

function parseManualGames(raw: string, businessDate: string, sport: ManualSport) {
  const parsedJson = maybeParseJson(raw);

  if (parsedJson) {
    const data = Array.isArray(parsedJson) ? parsedJson : parsedJson.data;
    if (!Array.isArray(data)) {
      throw new Error("JSON import needs an array or an object with a data array.");
    }

    return data.map((game, index) => normalizeJsonGame(game, index, businessDate, sport));
  }

  return parseManualRows(raw).map((row, index) => buildGameFromRow(row, index, businessDate, sport));
}

function getExpectedBusinessDate(sport: ManualSport, day: ManualDay) {
  if (sport === "NBA") return getExpectedNbaBusinessDate(day as NbaOddsCacheDay);
  if (sport === "SOCCER") return getExpectedSoccerBusinessDate(day as SoccerOddsCacheDay);
  return getExpectedMlbBusinessDate(day as MlbOddsCacheDay);
}

function isBusinessDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function buildMlbExtras(businessDate: string) {
  const [contextResult, learningResult] = await Promise.allSettled([
    fetchMlbGameContext({
      businessDate,
      teamPitchingRatings: mlbTeamRatings,
    }),
    buildMlbLearningProfile(),
  ]);

  return {
    context: contextResult.status === "fulfilled" ? contextResult.value : {},
    learning: learningResult.status === "fulfilled" ? learningResult.value : undefined,
  };
}

function forwardAuthHeaders(req: NextRequest) {
  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  const autoSecret = req.headers.get("x-auto-sync-secret");
  if (cookie) headers.cookie = cookie;
  if (autoSecret) headers["x-auto-sync-secret"] = autoSecret;
  return headers;
}

async function refreshPicks(req: NextRequest, sport: ManualSport, day: ManualDay, competition: string) {
  const origin = getRequestOrigin(req);
  const url =
    sport === "NBA"
      ? new URL(`${origin}/api/sync-top-picks`)
      : sport === "SOCCER"
        ? new URL(`${origin}/api/sync-soccer-top-picks`)
        : new URL(`${origin}/api/sync-mlb-top-picks`);

  url.searchParams.set("day", day);
  if (sport === "SOCCER") url.searchParams.set("competition", competition);

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: forwardAuthHeaders(req),
  });
  const data = await res.json();

  if (!res.ok || !data.ok) {
    return {
      ok: false as const,
      error: data.error ?? `Pick refresh failed with ${res.status}.`,
    };
  }

  return {
    ok: true as const,
    data: data.data ?? data.topPicks ?? [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req, { countAgainstLimit: true });
    if (!access.ok) return access.response;

    const body = await req.json();
    const sport = normalizeSport(body.sport);
    const day = normalizeDay(body.day);
    const competition = normalizeSoccerCompetition(body.competition);
    const rawOdds = String(body.rawOdds ?? "").trim();

    if (!rawOdds) {
      return NextResponse.json({ ok: false, error: "Paste CSV rows or odds JSON first." }, { status: 400 });
    }

    const requestedBusinessDate = String(body.businessDate ?? "").trim();
    const jsonBusinessDate = extractJsonBusinessDate(rawOdds);
    const businessDate =
      requestedBusinessDate || jsonBusinessDate || getExpectedBusinessDate(sport, day);

    if (!isBusinessDate(businessDate)) {
      return NextResponse.json(
        { ok: false, error: "Business date must use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const games = parseManualGames(rawOdds, businessDate, sport);
    const payloadBase = {
      ok: true,
      sport,
      competition: sport === "SOCCER" ? competition : undefined,
      day,
      businessDate,
      data: games,
      manual: true,
      source: "manual",
      importedAt: new Date().toISOString(),
    };

    if (sport === "MLB") {
      const extras = await buildMlbExtras(businessDate);
      await setCachedData(`mlb_odds_${day}`, {
        ...payloadBase,
        ...extras,
      });
    } else if (sport === "NBA") {
      await setCachedData(`team_odds_${day}`, payloadBase);
    } else {
      await setCachedData(getSoccerOddsCacheKey(competition, day as SoccerOddsCacheDay), {
        ...payloadBase,
        competition,
        cachedAt: new Date().toISOString(),
      });
    }

    let refreshResult:
      | { ok: true; data: unknown[] }
      | { ok: false; error: string }
      | null = null;

    if (body.refreshPicks !== false) {
      refreshResult = await refreshPicks(req, sport, day, competition);
    }

    if (access.access === "owner") {
      await recordManualSyncUsage(`manual-odds-${sport.toLowerCase()}`);
    }

    return NextResponse.json({
      ok: true,
      sport,
      day,
      competition: sport === "SOCCER" ? competition : undefined,
      businessDate,
      gameCount: games.length,
      pickRefresh: refreshResult,
      warning: refreshResult && !refreshResult.ok ? refreshResult.error : null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
