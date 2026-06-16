import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config", "nba-impact-rankings.json");
const REPORT_PATH = path.join(PROJECT_ROOT, "docs", "nba-impact-rankings-report.md");
const SEASON_YEAR = Number(process.env.NBA_IMPACT_SEASON_YEAR) || getNbaSeasonYear();
const CONCURRENCY = Number(process.env.NBA_IMPACT_SYNC_CONCURRENCY) || 6;
const JSON_ONLY = process.argv.includes("--json");

function getNbaSeasonYear(now = new Date()) {
  const month = now.getMonth() + 1;
  return month >= 8 ? now.getFullYear() + 1 : now.getFullYear();
}

function normalizeName(value) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
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

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function fetchJson(url, options = {}) {
  const attempts = options.attempts ?? 3;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25000);

    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "betting-lab-impact-rankings/1.0",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function readPreviousConfig() {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function getTeams() {
  const url = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";
  const data = await fetchJson(url);
  const teams = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];

  return teams
    .map((entry) => entry.team ?? entry)
    .filter((team) => team?.id && team?.abbreviation && team?.displayName)
    .map((team) => ({
      id: String(team.id),
      abbreviation: String(team.abbreviation).toUpperCase(),
      slug: String(team.abbreviation).toLowerCase(),
      displayName: String(team.displayName),
      shortDisplayName: String(team.shortDisplayName ?? team.name ?? team.abbreviation),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function getRoster(team) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team.slug}/roster`;
  const data = await fetchJson(url);
  const athletes = data?.athletes ?? [];
  const flattened = [];

  for (const entry of athletes) {
    if (Array.isArray(entry?.items)) {
      for (const item of entry.items) {
        flattened.push({ ...item, position: item.position ?? entry.position ?? null });
      }
    } else if (entry?.id) {
      flattened.push(entry);
    }
  }

  const byId = new Map();
  for (const athlete of flattened) {
    byId.set(String(athlete.id), athlete);
  }

  return [...byId.values()];
}

function extractStats(data) {
  const stats = {};
  const categories = data?.splits?.categories ?? data?.categories ?? [];

  for (const category of categories) {
    for (const stat of category?.stats ?? []) {
      if (!stat?.name) continue;
      stats[stat.name] = numberOrZero(stat.value);
      stats[stat.name.toLowerCase()] = numberOrZero(stat.value);
    }
  }

  return stats;
}

async function getAthleteStats(athleteId, type) {
  const url =
    `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${SEASON_YEAR}` +
    `/types/${type}/athletes/${athleteId}/statistics?lang=en&region=us`;

  try {
    return extractStats(await fetchJson(url, { attempts: 2 }));
  } catch {
    return {};
  }
}

function stat(stats, ...names) {
  for (const name of names) {
    const exact = stats[name];
    if (Number.isFinite(exact)) return exact;
    const lower = stats[String(name).toLowerCase()];
    if (Number.isFinite(lower)) return lower;
  }
  return 0;
}

function blendStats(regular, postseason) {
  const postGames = stat(postseason, "gamesPlayed");
  const regularGames = stat(regular, "gamesPlayed");
  const keys = new Set([...Object.keys(regular), ...Object.keys(postseason)]);

  if (postGames >= 3 && regularGames > 0) {
    const blended = {};
    for (const key of keys) {
      blended[key] = round(stat(postseason, key) * 0.6 + stat(regular, key) * 0.4, 4);
    }
    blended.sample = `regular ${regularGames}, postseason ${postGames}`;
    return blended;
  }

  return {
    ...regular,
    sample: regularGames > 0 ? `regular ${regularGames}` : postGames > 0 ? `postseason ${postGames}` : "no current stats",
  };
}

function salaryMillions(athlete) {
  const contractSalary = numberOrZero(athlete?.contract?.salary);
  if (contractSalary > 0) return contractSalary / 1_000_000;

  const salaries = Array.isArray(athlete?.contracts)
    ? athlete.contracts.map((contract) => numberOrZero(contract?.salary)).filter((salary) => salary > 0)
    : [];

  if (salaries.length === 0) return 0;
  return Math.max(...salaries) / 1_000_000;
}

function positionLabel(athlete) {
  return normalizeText(
    athlete?.position?.abbreviation ??
      athlete?.position?.displayName ??
      athlete?.position?.name ??
      athlete?.position ??
      ""
  );
}

function isBigPosition(position) {
  return /\b(C|F-C|C-F|PF-C|Center)\b/i.test(position);
}

function isPrimaryBallHandler(position) {
  return /\b(PG|G|Point Guard|Guard)\b/i.test(position);
}

function impactScoreFromRank(rank) {
  if (rank <= 2) return 5;
  if (rank <= 5) return 4;
  if (rank <= 8) return 3;
  if (rank <= 12) return 2;
  return 1;
}

function tierFromRank(rank) {
  if (rank <= 5) return "high";
  if (rank <= 8) return "medium";
  return "low";
}

function buildRankingScore(athlete, stats) {
  const avgMinutes = stat(stats, "avgMinutes");
  const avgPoints = stat(stats, "avgPoints");
  const avgAssists = stat(stats, "avgAssists");
  const avgRebounds = stat(stats, "avgRebounds");
  const avgSteals = stat(stats, "avgSteals");
  const avgBlocks = stat(stats, "avgBlocks");
  const per = stat(stats, "PER");
  const nbaRating = stat(stats, "NBARating");
  const usageRate = stat(stats, "usageRate");
  const gamesPlayed = stat(stats, "gamesPlayed");
  const gamesStarted = stat(stats, "gamesStarted");
  const startRate = gamesPlayed > 0 ? gamesStarted / gamesPlayed : 0;
  const salary = salaryMillions(athlete);
  const position = positionLabel(athlete);
  const active = String(athlete?.status?.type ?? athlete?.status?.name ?? "").toLowerCase() !== "inactive";

  let score =
    avgMinutes * 1.45 +
    avgPoints * 1.2 +
    avgAssists * 1.9 +
    avgRebounds * 0.9 +
    avgSteals * 2.2 +
    avgBlocks * 2.0 +
    per * 0.9 +
    nbaRating * 0.35 +
    usageRate * 0.35 +
    startRate * 8 +
    Math.min(salary, 55) * 0.22;

  if (isBigPosition(position)) {
    score += avgRebounds * 0.45 + avgBlocks * 3.4;
  }

  if (isPrimaryBallHandler(position)) {
    score += avgAssists * 0.65;
  }

  if (gamesPlayed > 0 && gamesPlayed < 15) score *= 0.82;
  if (!active) score *= 0.8;

  return round(score, 3);
}

function buildReasons({ athlete, stats, previousRank }) {
  const reasons = [];
  const minutes = stat(stats, "avgMinutes");
  const points = stat(stats, "avgPoints");
  const rebounds = stat(stats, "avgRebounds");
  const assists = stat(stats, "avgAssists");
  const steals = stat(stats, "avgSteals");
  const blocks = stat(stats, "avgBlocks");
  const gamesStarted = stat(stats, "gamesStarted");
  const gamesPlayed = stat(stats, "gamesPlayed");
  const experienceYears = numberOrZero(athlete?.experience?.years);

  if (minutes >= 28) reasons.push(`${round(minutes, 1)} MPG`);
  if (points >= 14) reasons.push(`${round(points, 1)} PPG`);
  if (assists >= 4) reasons.push(`${round(assists, 1)} APG`);
  if (rebounds >= 6) reasons.push(`${round(rebounds, 1)} RPG`);
  if (steals + blocks >= 1.8) reasons.push(`${round(steals + blocks, 1)} stocks`);
  if (gamesPlayed > 0 && gamesStarted / gamesPlayed >= 0.6) reasons.push(`${Math.round((gamesStarted / gamesPlayed) * 100)}% starter rate`);
  if (experienceYears <= 1) reasons.push("rookie/young-player watch");
  if (previousRank !== null && previousRank !== undefined) reasons.push(`previous rank ${previousRank}`);

  return reasons.slice(0, 5);
}

function buildStatsSummary(stats, athlete) {
  return {
    avgMinutes: round(stat(stats, "avgMinutes"), 1),
    avgPoints: round(stat(stats, "avgPoints"), 1),
    avgRebounds: round(stat(stats, "avgRebounds"), 1),
    avgAssists: round(stat(stats, "avgAssists"), 1),
    avgSteals: round(stat(stats, "avgSteals"), 1),
    avgBlocks: round(stat(stats, "avgBlocks"), 1),
    PER: round(stat(stats, "PER"), 2),
    gamesPlayed: round(stat(stats, "gamesPlayed"), 0),
    gamesStarted: round(stat(stats, "gamesStarted"), 0),
    salaryMillions: round(salaryMillions(athlete), 1),
    sample: stats.sample ?? "current season",
  };
}

function findPreviousRank(previousConfig, team, playerName) {
  if (!previousConfig?.teams) return null;

  const normalizedPlayer = normalizeName(playerName);
  const normalizedTeam = team.abbreviation.toLowerCase();
  const displayName = String(team.displayName ?? team.team ?? "").toLowerCase();
  const teamEntry =
    previousConfig.teams[team.abbreviation] ??
    Object.values(previousConfig.teams).find(
      (entry) =>
        String(entry.abbreviation ?? "").toLowerCase() === normalizedTeam ||
        String(entry.team ?? "").toLowerCase() === displayName
    );

  const player = teamEntry?.players?.find((entry) => entry.normalizedName === normalizedPlayer);
  return player?.rank ?? null;
}

async function rankTeam(team, previousConfig) {
  const roster = await getRoster(team);
  const enriched = await mapLimit(roster, CONCURRENCY, async (athlete) => {
    const [regular, postseason] = await Promise.all([
      getAthleteStats(athlete.id, 2),
      getAthleteStats(athlete.id, 3),
    ]);
    const stats = blendStats(regular, postseason);
    return {
      athlete,
      stats,
      rankingScore: buildRankingScore(athlete, stats),
    };
  });

  const ranked = enriched
    .filter((entry) => entry.athlete?.id && normalizeText(entry.athlete.displayName || entry.athlete.fullName))
    .sort(
      (a, b) =>
        b.rankingScore - a.rankingScore ||
        salaryMillions(b.athlete) - salaryMillions(a.athlete) ||
        normalizeText(a.athlete.displayName).localeCompare(normalizeText(b.athlete.displayName))
    )
    .map((entry, index) => {
      const playerName = normalizeText(entry.athlete.displayName || entry.athlete.fullName);
      const rank = index + 1;
      const previousRank = findPreviousRank(previousConfig, team, playerName);

      return {
        playerName,
        normalizedName: normalizeName(playerName),
        espnId: String(entry.athlete.id),
        team: team.displayName,
        teamAbbreviation: team.abbreviation,
        rank,
        impactScore: impactScoreFromRank(rank),
        tier: tierFromRank(rank),
        rankingScore: entry.rankingScore,
        position: positionLabel(entry.athlete) || null,
        reasons: buildReasons({ athlete: entry.athlete, stats: entry.stats, previousRank }),
        stats: buildStatsSummary(entry.stats, entry.athlete),
      };
    });

  return {
    team: team.displayName,
    abbreviation: team.abbreviation,
    espnTeamId: team.id,
    players: ranked,
  };
}

function positionBucket(position) {
  if (/\b(C|Center)\b/i.test(position)) return "big";
  if (/\b(PF|SF|Forward|F)\b/i.test(position)) return "wing";
  return "guard";
}

function buildBeneficiaryNotes(teamRanking) {
  const topPlayers = teamRanking.players.slice(0, 8);
  const notes = [];

  for (const player of topPlayers.slice(0, 6)) {
    const bucket = positionBucket(player.position ?? "");
    const sameBucket = topPlayers.find(
      (candidate) => candidate.normalizedName !== player.normalizedName && positionBucket(candidate.position ?? "") === bucket
    );
    const usageFallback = topPlayers.find(
      (candidate) => candidate.normalizedName !== player.normalizedName && candidate.rank <= 5
    );
    const names = [sameBucket?.playerName, usageFallback?.playerName].filter(Boolean);

    if (names.length > 0) {
      notes.push(`If ${player.playerName} is out, watch ${[...new Set(names)].join(" and ")} for usage, minutes, or role lift.`);
    }
  }

  return notes.slice(0, 4);
}

function buildRookieNotes(teamRanking) {
  return teamRanking.players
    .filter((player) => player.reasons?.some((reason) => reason.includes("rookie")))
    .slice(0, 4)
    .map((player) => `${player.playerName}: rank ${player.rank}, ${player.tier}, score ${player.rankingScore}`);
}

function buildMovementNotes(teamRanking, previousConfig) {
  if (!previousConfig?.teams) return [];

  return teamRanking.players
    .filter((player) => {
      const previousRank = findPreviousRank(previousConfig, teamRanking, player.playerName);
      return previousRank !== null && Math.abs(previousRank - player.rank) >= 3;
    })
    .slice(0, 5)
    .map((player) => {
      const previousRank = findPreviousRank(previousConfig, teamRanking, player.playerName);
      return `${player.playerName}: ${previousRank} -> ${player.rank}`;
    });
}

function buildReport(config, previousConfig) {
  const lines = [
    "# NBA Impact Rankings",
    "",
    `Generated: ${config.generatedAt}`,
    `Season year: ${config.seasonYear}`,
    "",
    "Rule: ranks 1-5 are high impact, ranks 6-8 are medium impact, and ranks 9+ are low impact. The injury guardrail caps only high/medium players from 5 stars to 4 stars.",
    "",
  ];

  for (const team of Object.values(config.teams).sort((a, b) => a.team.localeCompare(b.team))) {
    lines.push(`## ${team.team} (${team.abbreviation})`, "");
    lines.push("| Rank | Player | Tier | Score | Pos | Key signals |");
    lines.push("| --- | --- | --- | ---: | --- | --- |");
    for (const player of team.players.slice(0, 12)) {
      lines.push(
        `| ${player.rank} | ${player.playerName} | ${player.tier} | ${player.rankingScore} | ${player.position ?? ""} | ${(player.reasons ?? []).join(", ")} |`
      );
    }

    const movement = buildMovementNotes(team, previousConfig);
    const rookies = buildRookieNotes(team);
    const beneficiaries = buildBeneficiaryNotes(team);

    if (movement.length > 0) {
      lines.push("", "Movement watch:");
      for (const note of movement) lines.push(`- ${note}`);
    }

    if (rookies.length > 0) {
      lines.push("", "Rookie/young-player watch:");
      for (const note of rookies) lines.push(`- ${note}`);
    }

    if (beneficiaries.length > 0) {
      lines.push("", "Practical injury notes:");
      for (const note of beneficiaries) lines.push(`- ${note}`);
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const previousConfig = await readPreviousConfig();
  const teams = await getTeams();
  const teamRankings = await mapLimit(teams, 2, (team) => rankTeam(team, previousConfig));
  const generatedAt = new Date().toISOString();

  const config = {
    version: 1,
    generatedAt,
    source: "ESPN roster/contracts/statistics API",
    seasonYear: SEASON_YEAR,
    rule: {
      high: "team ranks 1-5",
      medium: "team ranks 6-8",
      low: "team ranks 9+",
      capThreshold: "impactScore >= 3 caps a 5-star pick to 4 stars",
    },
    teams: Object.fromEntries(teamRankings.map((team) => [team.abbreviation, team])),
  };

  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
  await fs.writeFile(REPORT_PATH, buildReport(config, previousConfig));

  const knicks =
    config.teams.NYK ??
    config.teams.NY ??
    Object.values(config.teams).find((team) => team.team === "New York Knicks");
  const mitchellRobinson = knicks?.players.find((player) => player.normalizedName === "mitchell robinson") ?? null;
  const summary = {
    ok: true,
    generatedAt,
    seasonYear: SEASON_YEAR,
    teams: teamRankings.length,
    players: teamRankings.reduce((count, team) => count + team.players.length, 0),
    configPath: CONFIG_PATH,
    reportPath: REPORT_PATH,
    knicksTop8: knicks?.players.slice(0, 8).map((player) => ({
      rank: player.rank,
      playerName: player.playerName,
      tier: player.tier,
      impactScore: player.impactScore,
      rankingScore: player.rankingScore,
    })) ?? [],
    mitchellRobinson,
  };

  if (JSON_ONLY) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } else {
    console.log(`Synced NBA impact rankings for ${summary.teams} teams / ${summary.players} players.`);
    console.log(`Config: ${CONFIG_PATH}`);
    console.log(`Report: ${REPORT_PATH}`);
    if (mitchellRobinson) {
      console.log(`Mitchell Robinson: rank ${mitchellRobinson.rank}, ${mitchellRobinson.tier}, impact ${mitchellRobinson.impactScore}.`);
    }
  }
}

main().catch((error) => {
  const payload = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };

  if (JSON_ONLY) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } else {
    console.error(payload.error);
  }

  process.exitCode = 1;
});
