import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getResolvedNflOddsCache } from "@/lib/nflOddsCache";
import { fetchGameWeather, isOutdoorGame } from "@/lib/nflWeatherService";
import type { NflOddsGame } from "@/lib/nflOddsCache";

// ESPN team ID → abbreviation map for injury API
const ESPN_TEAM_IDS: Record<string, string> = {
  "Arizona Cardinals": "22", "Atlanta Falcons": "1", "Baltimore Ravens": "33",
  "Buffalo Bills": "2", "Carolina Panthers": "29", "Chicago Bears": "3",
  "Cincinnati Bengals": "4", "Cleveland Browns": "5", "Dallas Cowboys": "6",
  "Denver Broncos": "7", "Detroit Lions": "8", "Green Bay Packers": "9",
  "Houston Texans": "34", "Indianapolis Colts": "11", "Jacksonville Jaguars": "30",
  "Kansas City Chiefs": "12", "Las Vegas Raiders": "13", "Los Angeles Chargers": "24",
  "Los Angeles Rams": "14", "Miami Dolphins": "15", "Minnesota Vikings": "16",
  "New England Patriots": "17", "New Orleans Saints": "18", "New York Giants": "19",
  "New York Jets": "20", "Philadelphia Eagles": "21", "Pittsburgh Steelers": "23",
  "San Francisco 49ers": "25", "Seattle Seahawks": "26", "Tampa Bay Buccaneers": "27",
  "Tennessee Titans": "10", "Washington Commanders": "28",
};

// Positions that meaningfully affect spread when out
const HIGH_IMPACT_POSITIONS = new Set(["QB", "RB", "WR", "TE", "LT", "RT", "C", "DE", "DT", "LB", "CB", "S"]);
const CRITICAL_POSITIONS = new Set(["QB", "LT", "RT"]);

type InjuryEntry = {
  player: string;
  position: string;
  status: string;
  isCritical: boolean;
};

type GameResearch = {
  gameId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  weather: {
    tempF: number;
    windMph: number;
    windGustsMph: number;
    precipPct: number;
    conditions: string;
    stadiumName: string;
    isAdverse: boolean;
    affectsTotals: boolean;
  } | null;
  homeInjuries: InjuryEntry[];
  awayInjuries: InjuryEntry[];
  newsHeadlines: string[];
  riskNotes: string[];
  // Composite adjustments: negative = lower confidence on that side
  spreadConfAdjustment: number; // -15 to 0
  totalConfAdjustment: number;  // -20 to 0 (weather matters most here)
  researchedAt: string;
};

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

type EspnInjuryEntry = {
  athlete?: { displayName?: string; position?: { abbreviation?: string } };
  status?: { type?: { description?: string } };
};

async function fetchInjuries(teamId: string): Promise<InjuryEntry[]> {
  if (!teamId) return [];
  try {
    const res = await fetch(`${ESPN_BASE}/teams/${teamId}/injuries`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { injuries?: EspnInjuryEntry[] };
    return (json?.injuries ?? []).slice(0, 12).map((e) => {
      const pos = e.athlete?.position?.abbreviation ?? "?";
      const statusStr = e.status?.type?.description ?? "Questionable";
      return {
        player: e.athlete?.displayName ?? "Unknown",
        position: pos,
        status: statusStr,
        isCritical: CRITICAL_POSITIONS.has(pos) && (statusStr === "Out" || statusStr === "Doubtful"),
      };
    }).filter((e) => HIGH_IMPACT_POSITIONS.has(e.position));
  } catch {
    return [];
  }
}

type EspnNewsItem = { headline?: string };
async function fetchNews(teamId: string): Promise<string[]> {
  if (!teamId) return [];
  try {
    const res = await fetch(`${ESPN_BASE}/teams/${teamId}/news?limit=4`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { articles?: EspnNewsItem[] };
    return (json?.articles ?? []).slice(0, 3).map((a) => a.headline ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

function calcAdjustments(
  homeInjuries: InjuryEntry[],
  awayInjuries: InjuryEntry[],
  weather: GameResearch["weather"]
): { spreadAdj: number; totalAdj: number; riskNotes: string[] } {
  const notes: string[] = [];
  let spreadAdj = 0;
  let totalAdj = 0;

  // Spread adjustment: count critical players out
  const homeOut = homeInjuries.filter((i) => i.status === "Out" || i.status === "Doubtful");
  const awayOut = awayInjuries.filter((i) => i.status === "Out" || i.status === "Doubtful");
  const criticalOut = [...homeOut, ...awayOut].filter((i) => i.isCritical);

  if (criticalOut.length > 0) {
    spreadAdj -= criticalOut.length * 8;
    notes.push(`${criticalOut.map((i) => `${i.player} (${i.position}) Out`).join(", ")}`);
  } else if (homeOut.length + awayOut.length >= 3) {
    spreadAdj -= 5;
    notes.push(`${homeOut.length + awayOut.length} starters listed Out/Doubtful`);
  }

  // Total adjustment: weather is the primary factor
  if (weather) {
    if (weather.affectsTotals) {
      totalAdj -= 18;
      notes.push(`Weather: ${weather.conditions} — pushes totals under`);
    } else if (weather.isAdverse) {
      totalAdj -= 10;
      notes.push(`Weather: ${weather.conditions} — lean under`);
    }
    if (weather.windMph >= 20) {
      totalAdj -= Math.min((weather.windMph - 20) * 1.5, 10);
    }
  }

  return {
    spreadAdj: Math.max(-20, spreadAdj),
    totalAdj: Math.max(-25, totalAdj),
    riskNotes: notes,
  };
}

async function researchGame(game: NflOddsGame): Promise<GameResearch> {
  const homeId = ESPN_TEAM_IDS[game.home_team] ?? "";
  const awayId = ESPN_TEAM_IDS[game.away_team] ?? "";

  const [homeInjuries, awayInjuries, homeNews, awayNews, weather] = await Promise.all([
    fetchInjuries(homeId),
    fetchInjuries(awayId),
    fetchNews(homeId),
    fetchNews(awayId),
    isOutdoorGame(game.home_team) ? fetchGameWeather(game.home_team, game.commence_time) : Promise.resolve(null),
  ]);

  const { spreadAdj, totalAdj, riskNotes } = calcAdjustments(homeInjuries, awayInjuries, weather);

  return {
    gameId: game.id,
    gameLabel: `${game.away_team} @ ${game.home_team}`,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    gameTime: game.commence_time,
    weather: weather
      ? {
          tempF: weather.tempF,
          windMph: weather.windMph,
          windGustsMph: weather.windGustsMph,
          precipPct: weather.precipPct,
          conditions: weather.conditions,
          stadiumName: weather.stadiumName,
          isAdverse: weather.isAdverse,
          affectsTotals: weather.affectsTotals,
        }
      : null,
    homeInjuries,
    awayInjuries,
    newsHeadlines: [...homeNews, ...awayNews].slice(0, 5),
    riskNotes,
    spreadConfAdjustment: spreadAdj,
    totalConfAdjustment: totalAdj,
    researchedAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const now = new Date();
    const resolvedOdds = await getResolvedNflOddsCache(now);
    if (!resolvedOdds.active?.weekStart) {
      return apiJsonOrNativeRedirect(
        req,
        { ok: false, error: "No cached NFL odds. Run sync-nfl-odds first." },
        { status: 400 },
        { fallbackPath: "/lotto" }
      );
    }

    const games = (resolvedOdds.active.data ?? []) as NflOddsGame[];
    const weekStart = resolvedOdds.active.weekStart!;

    // Research all games in parallel (with concurrency limit)
    const results: GameResearch[] = [];
    for (let i = 0; i < games.length; i += 4) {
      const batch = games.slice(i, i + 4);
      const batchResults = await Promise.all(batch.map(researchGame));
      results.push(...batchResults);
    }

    const supabase = getSupabaseServer();
    const cacheKey = `nfl_research_${weekStart}`;
    await supabase.from("cached_market_data").upsert(
      { cache_key: cacheKey, data: { games: results, researchedAt: now.toISOString() }, updated_at: now.toISOString() },
      { onConflict: "cache_key" }
    );

    const adverseCount = results.filter((g) => g.weather?.isAdverse).length;
    const injuredCount = results.reduce((s, g) => s + g.homeInjuries.filter((i) => i.status === "Out").length + g.awayInjuries.filter((i) => i.status === "Out").length, 0);

    return apiJsonOrNativeRedirect(
      req,
      {
        ok: true,
        weekStart,
        gamesResearched: results.length,
        adverseWeatherGames: adverseCount,
        injuriesFound: injuredCount,
        message: `Research complete: ${results.length} games, ${adverseCount} with adverse weather, ${injuredCount} injuries found.`,
        data: results.map((r) => ({ gameLabel: r.gameLabel, riskNotes: r.riskNotes })),
      },
      undefined,
      { fallbackPath: "/lotto" }
    );
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
      { fallbackPath: "/lotto" }
    );
  }
}
