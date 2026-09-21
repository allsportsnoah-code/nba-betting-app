import { nflTeamProfiles } from "@/lib/nflRatings";

export type NflInjuryFlag = {
  player: string;
  position: string;
  status: "Out" | "Doubtful" | "Questionable" | "Day-To-Day";
  impact: "high" | "medium" | "low";
};

export type NflTeamContext = {
  teamName: string;
  injuries: NflInjuryFlag[];
  recentForm: string;
  schemeNote: string;
  coachingNote: string;
  keyStrengths: string[];
  keyWeaknesses: string[];
};

export type NflGameContext = {
  gameId: string;
  homeTeam: NflTeamContext;
  awayTeam: NflTeamContext;
  weatherNote?: string;
  contextSummary: string;
  riskScore: number; // 0-40, higher = more risk/uncertainty
  riskNotes: string[];
  newsHighlights: string[];
};

// ESPN unofficial API helpers
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

type EspnInjuryEntry = {
  athlete?: { displayName?: string; position?: { abbreviation?: string } };
  status?: { type?: { description?: string } };
};

type EspnTeamInjuries = { injuries?: EspnInjuryEntry[] };

async function fetchEspnInjuries(teamAbbr: string): Promise<NflInjuryFlag[]> {
  try {
    const res = await fetch(`${ESPN_BASE}/teams/${teamAbbr}/injuries`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as EspnTeamInjuries;
    const entries = json?.injuries ?? [];
    return entries.slice(0, 8).map((entry) => {
      const status = entry.status?.type?.description ?? "Questionable";
      return {
        player: entry.athlete?.displayName ?? "Unknown",
        position: entry.athlete?.position?.abbreviation ?? "?",
        status: (["Out", "Doubtful", "Questionable", "Day-To-Day"].includes(status)
          ? status
          : "Questionable") as NflInjuryFlag["status"],
        impact: status === "Out" || status === "Doubtful" ? "high" : "medium",
      };
    });
  } catch {
    return [];
  }
}

// ESPN team ID map for the unofficial API
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

type EspnNewsItem = { headline?: string; description?: string };
type EspnNewsResponse = { articles?: EspnNewsItem[] };

async function fetchEspnNews(teamAbbr: string): Promise<string[]> {
  try {
    const res = await fetch(`${ESPN_BASE}/teams/${teamAbbr}/news?limit=5`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as EspnNewsResponse;
    return (json?.articles ?? []).slice(0, 3).map((a) => a.headline ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

function buildTeamContext(teamName: string, injuries: NflInjuryFlag[], news: string[]): NflTeamContext {
  const profile = nflTeamProfiles[teamName];

  const schemeNote = profile
    ? `${profile.coaching.coverageScheme.replace("-", " ")} defense; ${profile.coaching.passRateTendency} offense`
    : "Scheme data unavailable";

  const coachingNote = profile
    ? `HC: ${profile.coaching.headCoach} — ${profile.coaching.aggressiveness} tendency. ${profile.coaching.notes}`
    : "Coaching data unavailable";

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (profile) {
    if (profile.offense >= 108) strengths.push("elite offense");
    else if (profile.offense >= 104) strengths.push("above-average offense");
    else if (profile.offense < 97) weaknesses.push("below-average offense");

    if (profile.defense >= 107) strengths.push("elite defense");
    else if (profile.defense >= 103) strengths.push("above-average defense");
    else if (profile.defense < 98) weaknesses.push("vulnerable defense");

    if (profile.passRush >= 108) strengths.push("elite pass rush");
    if (profile.coverage >= 107) strengths.push("elite coverage");
    if (profile.passRush < 98) weaknesses.push("weak pass rush");
  }

  const highImpactOut = injuries.filter((i) => i.impact === "high" && i.status === "Out");
  if (highImpactOut.length > 0) {
    weaknesses.push(`key players out: ${highImpactOut.map((i) => `${i.player} (${i.position})`).join(", ")}`);
  }

  return {
    teamName,
    injuries,
    recentForm: news.length > 0 ? news[0] : "No recent headlines",
    schemeNote,
    coachingNote,
    keyStrengths: strengths,
    keyWeaknesses: weaknesses,
  };
}

function calculateRiskScore(homeCtx: NflTeamContext, awayCtx: NflTeamContext): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  const allInjuries = [...homeCtx.injuries, ...awayCtx.injuries];
  const highImpact = allInjuries.filter((i) => i.impact === "high" && i.status === "Out");

  if (highImpact.length >= 3) {
    score += 15;
    notes.push(`${highImpact.length} high-impact players ruled out`);
  } else if (highImpact.length >= 1) {
    score += highImpact.length * 5;
    notes.push(`${highImpact.length} key player(s) out`);
  }

  return { score: Math.min(score, 40), notes };
}

export async function fetchNflGameContext(
  gameId: string,
  homeTeam: string,
  awayTeam: string
): Promise<NflGameContext> {
  const homeId = ESPN_TEAM_IDS[homeTeam] ?? "";
  const awayId = ESPN_TEAM_IDS[awayTeam] ?? "";

  const [homeInjuries, awayInjuries, homeNews, awayNews] = await Promise.all([
    homeId ? fetchEspnInjuries(homeId) : Promise.resolve([] as NflInjuryFlag[]),
    awayId ? fetchEspnInjuries(awayId) : Promise.resolve([] as NflInjuryFlag[]),
    homeId ? fetchEspnNews(homeId) : Promise.resolve([] as string[]),
    awayId ? fetchEspnNews(awayId) : Promise.resolve([] as string[]),
  ]);

  const homeCtx = buildTeamContext(homeTeam, homeInjuries, homeNews);
  const awayCtx = buildTeamContext(awayTeam, awayInjuries, awayNews);
  const { score: riskScore, notes: riskNotes } = calculateRiskScore(homeCtx, awayCtx);

  const homeProfile = nflTeamProfiles[homeTeam];
  const awayProfile = nflTeamProfiles[awayTeam];

  const contextSummary = [
    homeProfile ? `${homeTeam}: ${homeCtx.schemeNote}.` : "",
    awayProfile ? `${awayTeam}: ${awayCtx.schemeNote}.` : "",
    homeCtx.keyWeaknesses.length > 0 ? `${homeTeam} concerns: ${homeCtx.keyWeaknesses.join(", ")}.` : "",
    awayCtx.keyWeaknesses.length > 0 ? `${awayTeam} concerns: ${awayCtx.keyWeaknesses.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    gameId,
    homeTeam: homeCtx,
    awayTeam: awayCtx,
    contextSummary,
    riskScore,
    riskNotes,
    newsHighlights: [...homeNews, ...awayNews].slice(0, 4),
  };
}

export async function buildNflContextMap(
  games: { id: string; home_team: string; away_team: string }[]
): Promise<Record<string, NflGameContext>> {
  const entries = await Promise.all(
    games.map(async (game) => {
      try {
        const ctx = await fetchNflGameContext(game.id, game.home_team, game.away_team);
        return [game.id, ctx] as const;
      } catch {
        return null;
      }
    })
  );

  return Object.fromEntries(entries.filter((e): e is [string, NflGameContext] => Boolean(e)));
}
