import fs from "node:fs";
import path from "node:path";

export type NbaImpactTier = "high" | "medium" | "low";

export type NbaImpactPlayerRanking = {
  playerName: string;
  normalizedName: string;
  espnId?: string | null;
  team: string;
  teamAbbreviation: string;
  rank: number;
  impactScore: number;
  tier: NbaImpactTier;
  rankingScore: number;
  position?: string | null;
  reasons?: string[];
  stats?: Record<string, number | string | null>;
};

export type NbaImpactTeamRanking = {
  team: string;
  abbreviation: string;
  espnTeamId?: string | null;
  players: NbaImpactPlayerRanking[];
};

export type NbaImpactRankingsConfig = {
  version: number;
  generatedAt: string;
  source: string;
  seasonYear: number;
  teams: Record<string, NbaImpactTeamRanking>;
};

export type NbaImpactLookup = {
  impactScore: number;
  tier: NbaImpactTier;
  teamRank: number | null;
  source: "generated" | "fallback" | "default";
  playerName: string;
  team: string | null;
};

const CONFIG_PATH = path.join(process.cwd(), "config", "nba-impact-rankings.json");
const TEAM_ALIASES: Record<string, string> = {
  gsw: "gs",
  nyk: "ny",
  nop: "no",
  sas: "sa",
};

const FALLBACK_IMPACT_SCORES: Record<string, number> = {
  "jayson tatum": 5,
  "jaylen brown": 4,
  "derrick white": 3,
  "jalen brunson": 5,
  "karl-anthony towns": 4,
  "mikal bridges": 4,
  "og anunoby": 3,
  "josh hart": 3,
  "mitchell robinson": 3,
  "joel embiid": 5,
  "tyrese maxey": 4,
  "paul george": 4,
  "kelly oubre jr": 3,
  "giannis antetokounmpo": 5,
  "damian lillard": 5,
  "khris middleton": 3,
  "nikola jokic": 5,
  "jamal murray": 4,
  "michael porter jr": 3,
  "anthony edwards": 5,
  "julius randle": 4,
  "naz reid": 3,
  "donte divincenzo": 3,
  "jaden mcdaniels": 3,
  "victor wembanyama": 5,
  "de'aaron fox": 4,
  "deaaron fox": 4,
  "stephon castle": 3,
  "keldon johnson": 3,
  "chet holmgren": 4,
  "shai gilgeous-alexander": 5,
  "jalen williams": 4,
  "tyrese haliburton": 5,
  "pascal siakam": 4,
  "bam adebayo": 4,
  "tyler herro": 4,
  "donovan mitchell": 5,
  "evan mobley": 4,
  "darius garland": 4,
  "trae young": 5,
  "cade cunningham": 5,
  "zion williamson": 5,
  "devin booker": 5,
  "kevin durant": 5,
  "lebron james": 5,
  "luka doncic": 5,
  "anthony davis": 5,
  "domantas sabonis": 4,
  "demar derozan": 4,
  "ja morant": 5,
  "jaren jackson jr": 4,
  "lamelo ball": 5,
  "franz wagner": 4,
  "paolo banchero": 5,
  "alperen sengun": 4,
  "fred vanvleet": 3,
  "amen thompson": 3,
  "lauri markkanen": 4,
  "walker kessler": 3,
  "brandon ingram": 4,
  "cj mccollum": 3,
  "anthony black": 3,
  "austin reaves": 4,
};

let cachedConfig:
  | {
      mtimeMs: number;
      data: NbaImpactRankingsConfig;
    }
  | null = null;

export function normalizeNbaImpactName(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  const reordered = normalized.includes(",")
    ? normalized
        .split(",")
        .map((part) => part.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .reverse()
        .join(" ")
    : normalized;

  return reordered
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/\bjr\b/g, "")
    .replace(/\bsr\b/g, "")
    .replace(/\bii\b/g, "")
    .replace(/\biii\b/g, "")
    .replace(/\biv\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeam(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return TEAM_ALIASES[normalized] ?? normalized;
}

function tierFromImpactScore(score: number): NbaImpactTier {
  if (score >= 4) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function loadGeneratedConfig() {
  try {
    const stat = fs.statSync(CONFIG_PATH);
    if (cachedConfig && cachedConfig.mtimeMs === stat.mtimeMs) {
      return cachedConfig.data;
    }

    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as NbaImpactRankingsConfig;
    cachedConfig = { mtimeMs: stat.mtimeMs, data: parsed };
    return parsed;
  } catch {
    return null;
  }
}

function findTeam(config: NbaImpactRankingsConfig, team: string | null | undefined) {
  const normalized = normalizeTeam(team);
  if (!normalized) return null;

  return (
    Object.values(config.teams).find(
      (entry) =>
        normalizeTeam(entry.team) === normalized ||
        normalizeTeam(entry.abbreviation) === normalized
    ) ?? null
  );
}

export function getNbaImpactScoreForPlayer(
  playerName: string,
  team?: string | null
): NbaImpactLookup {
  const normalizedName = normalizeNbaImpactName(playerName);
  const config = loadGeneratedConfig();

  if (config) {
    const teamRanking = findTeam(config, team);
    const teamPlayer = teamRanking?.players.find((player) => player.normalizedName === normalizedName);

    if (teamRanking && teamPlayer) {
      return {
        impactScore: teamPlayer.impactScore,
        tier: teamPlayer.tier,
        teamRank: teamPlayer.rank,
        source: "generated",
        playerName: teamPlayer.playerName,
        team: teamRanking.team,
      };
    }

    const anyTeamPlayer = Object.values(config.teams)
      .flatMap((entry) => entry.players)
      .filter((player) => player.normalizedName === normalizedName)
      .sort((a, b) => b.impactScore - a.impactScore || a.rank - b.rank)[0];

    if (anyTeamPlayer) {
      return {
        impactScore: anyTeamPlayer.impactScore,
        tier: anyTeamPlayer.tier,
        teamRank: anyTeamPlayer.rank,
        source: "generated",
        playerName: anyTeamPlayer.playerName,
        team: anyTeamPlayer.team,
      };
    }
  }

  const fallbackScore = FALLBACK_IMPACT_SCORES[normalizedName];
  if (fallbackScore !== undefined) {
    return {
      impactScore: fallbackScore,
      tier: tierFromImpactScore(fallbackScore),
      teamRank: null,
      source: "fallback",
      playerName,
      team: team ?? null,
    };
  }

  return {
    impactScore: 0,
    tier: "low",
    teamRank: null,
    source: "default",
    playerName,
    team: team ?? null,
  };
}
