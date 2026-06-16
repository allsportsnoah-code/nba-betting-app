import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import { getNbaImpactScoreForPlayer } from "@/lib/nbaImpactRankings";

PDFParse.setWorker(
  pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdf-parse", "dist", "pdf-parse", "esm", "pdf.worker.mjs")
  ).toString()
);

type InjuryStatus =
  | "available"
  | "probable"
  | "questionable"
  | "doubtful"
  | "out"
  | "inactive"
  | "suspended"
  | "unknown";

export type NbaInjuryReportRow = {
  gameDate: string | null;
  gameTime: string | null;
  matchup: string | null;
  team: string;
  playerName: string;
  status: InjuryStatus;
  statusLabel: string;
  reason: string | null;
  impactScore: number;
};

export type NbaInjuryChange = {
  team: string;
  playerName: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  impactScore: number;
};

export type NbaBoardBucket = "top" | "value";

export type NbaTeamInjuryAction = {
  pickId: number | null;
  gameLabel: string;
  team: string;
  playerName: string;
  status: string;
  reason: string | null;
  impactScore: number;
  boardBucket: NbaBoardBucket | null;
  slotNumber: number | null;
  triggerReportLabel?: string | null;
  triggerReportTimestamp?: string | null;
  action: "remove" | "caution" | "reinstate";
  message: string;
};

export type NbaPropInjuryAction = {
  pickId: number | null;
  gameLabel: string;
  playerName: string;
  status: string;
  reason: string | null;
  impactScore: number;
  boardBucket: NbaBoardBucket | null;
  slotNumber: number | null;
  triggerReportLabel?: string | null;
  triggerReportTimestamp?: string | null;
  action: "void" | "caution" | "reinstate";
  message: string;
};

export type NbaBoardRecheckPick = {
  board: "team_top" | "team_value" | "prop_top" | "prop_value";
  slotNumber: number;
  id: number | null;
  key: string;
  label: string;
  marketType: string | null;
  side: string | null;
  lineTaken: number | null;
  oddsTaken: number | null;
  status: string | null;
  playerName?: string | null;
  projectedHomeScore?: number | null;
  projectedAwayScore?: number | null;
};

export type NbaBoardRecheckChange = {
  board: NbaBoardRecheckPick["board"];
  slotNumber: number;
  changeType: "added" | "removed" | "changed" | "updated";
  before: NbaBoardRecheckPick | null;
  after: NbaBoardRecheckPick | null;
  summary: string;
};

export type NbaInjuryTriggerPlayer = {
  team: string;
  playerName: string;
  reportStatus: string;
  reason: string | null;
  impactScore: number;
};

export type NbaInjuryTriggerPlayerResult = NbaInjuryTriggerPlayer & {
  played: boolean | null;
  availability: "played" | "did_not_play" | "not_found" | "unknown";
  finalNote: string | null;
  checkedAt: string;
};

export type NbaBoardRecheckPickResult = NbaBoardRecheckPick & {
  finalStatus: string | null;
  unitsResult: number | null;
  finalScore: string | null;
  finalStat: number | null;
};

export type NbaBoardRecheckResultComparison = {
  board: NbaBoardRecheckPick["board"];
  slotNumber: number;
  before: NbaBoardRecheckPickResult | null;
  after: NbaBoardRecheckPickResult | null;
  verdict: "replacement_better" | "original_better" | "same" | "pending";
  summary: string;
};

export type NbaInjuryBoardRecheck = {
  triggered: boolean;
  ran: boolean;
  reason: string;
  releaseCutoffLabel: string;
  triggeredAt: string;
  completedAt: string | null;
  reportLabel: string | null;
  teamSync: {
    ok: boolean;
    message: string | null;
    error: string | null;
  } | null;
  propSync: {
    ok: boolean;
    message: string | null;
    error: string | null;
  } | null;
  triggerPlayers: NbaInjuryTriggerPlayer[];
  triggerPlayerResults?: NbaInjuryTriggerPlayerResult[];
  changes: NbaBoardRecheckChange[];
  resultComparisons?: NbaBoardRecheckResultComparison[];
  outcomeUpdatedAt?: string | null;
  error: string | null;
};

export type NbaInjurySyncData = {
  businessDate: string;
  reportUrl: string | null;
  reportLabel: string | null;
  reportTimestamp: string | null;
  checkedAt: string;
  rows: NbaInjuryReportRow[];
  significantChanges: NbaInjuryChange[];
  teamActions: NbaTeamInjuryAction[];
  propActions: NbaPropInjuryAction[];
  boardRecheck?: NbaInjuryBoardRecheck | null;
};

type TeamPickLike = {
  id?: number | null;
  game_label: string;
  home_team?: string | null;
  away_team?: string | null;
  market_type?: string | null;
  side?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

type PropPickLike = {
  id?: number | null;
  game_label: string;
  home_team?: string | null;
  away_team?: string | null;
  player_name?: string | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

const OFFICIAL_NBA_INJURY_PAGE = "https://official.nba.com/nba-injury-report-2025-26-season/";

const NBA_TEAM_NAMES = [
  "Oklahoma City Thunder",
  "Minnesota Timberwolves",
  "New York Knicks",
  "Philadelphia 76ers",
  "Los Angeles Lakers",
  "San Antonio Spurs",
  "Cleveland Cavaliers",
  "Detroit Pistons",
  "Boston Celtics",
  "Milwaukee Bucks",
  "Denver Nuggets",
  "Indiana Pacers",
  "Los Angeles Clippers",
  "Golden State Warriors",
  "Sacramento Kings",
  "Phoenix Suns",
  "New Orleans Pelicans",
  "Memphis Grizzlies",
  "Dallas Mavericks",
  "Houston Rockets",
  "Miami Heat",
  "Orlando Magic",
  "Atlanta Hawks",
  "Brooklyn Nets",
  "Chicago Bulls",
  "Charlotte Hornets",
  "Toronto Raptors",
  "Utah Jazz",
  "Portland Trail Blazers",
  "Washington Wizards",
].sort((a, b) => b.length - a.length);

const STATUS_PATTERN =
  /\b(Available|Probable|Questionable|Doubtful|Out|Inactive|Suspended)\b/i;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePlayerName(value: string | null | undefined) {
  const normalized = normalizeText(value);
  const reordered = normalized.includes(",")
    ? normalized
        .split(",")
        .map((part) => normalizeText(part))
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

function normalizeTeamName(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function formatPlayerDisplayName(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized.includes(",")) {
    return normalized;
  }

  const parts = normalized
    .split(",")
    .map((part) => normalizeText(part))
    .filter(Boolean);

  if (parts.length < 2) {
    return normalized;
  }

  return `${parts.slice(1).join(" ")} ${parts[0]}`.trim();
}

function normalizeHeaderCell(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function getImpactScore(playerName: string, team?: string | null) {
  return getNbaImpactScoreForPlayer(playerName, team).impactScore;
}

function normalizeInjuryStatus(value: string | null | undefined): InjuryStatus {
  const normalized = normalizeText(value).toLowerCase();

  if (normalized.startsWith("out")) return "out";
  if (normalized.startsWith("doubtful")) return "doubtful";
  if (normalized.startsWith("questionable")) return "questionable";
  if (normalized.startsWith("probable")) return "probable";
  if (normalized.startsWith("inactive")) return "inactive";
  if (normalized.startsWith("suspended")) return "suspended";
  if (normalized.startsWith("available")) return "available";
  return "unknown";
}

function getStatusSeverity(status: InjuryStatus) {
  switch (status) {
    case "out":
      return 6;
    case "inactive":
      return 5;
    case "suspended":
      return 5;
    case "doubtful":
      return 4;
    case "questionable":
      return 3;
    case "probable":
      return 2;
    case "available":
      return 1;
    default:
      return 0;
  }
}

function isHighRiskStatus(status: InjuryStatus) {
  return status === "out" || status === "doubtful" || status === "questionable" || status === "inactive" || status === "suspended";
}

export function getNbaImpactScore(playerName: string, team?: string | null) {
  return getImpactScore(playerName, team);
}

export function isNbaHighRiskStatus(status: InjuryStatus) {
  return isHighRiskStatus(status);
}

export type NbaTeamInjuryAdjustment = {
  offensePenalty: number;
  defensePenalty: number;
  maxImpactScore: number;
  impactedPlayers: string[];
  note: string | null;
};

function getStatusImpactWeight(status: InjuryStatus) {
  switch (status) {
    case "out":
    case "inactive":
    case "suspended":
      return 1;
    case "doubtful":
      return 0.75;
    case "questionable":
      return 0.5;
    case "probable":
      return 0.2;
    default:
      return 0;
  }
}

export function buildNbaTeamInjuryAdjustments(rows: NbaInjuryReportRow[] | null | undefined) {
  const adjustments: Record<string, NbaTeamInjuryAdjustment> = {};

  for (const row of rows ?? []) {
    const weight = getStatusImpactWeight(row.status);
    if (weight <= 0 || row.impactScore <= 0) continue;

    const key = row.team;
    const existing =
      adjustments[key] ??
      {
        offensePenalty: 0,
        defensePenalty: 0,
        maxImpactScore: 0,
        impactedPlayers: [],
        note: null,
      };

    const rawPenalty = row.impactScore * weight;
    existing.offensePenalty += rawPenalty * 0.45;
    existing.defensePenalty += rawPenalty * 0.3;
    existing.maxImpactScore = Math.max(existing.maxImpactScore, row.impactScore);
    if (!existing.impactedPlayers.includes(row.playerName)) {
      existing.impactedPlayers.push(row.playerName);
    }

    adjustments[key] = existing;
  }

  for (const [team, adjustment] of Object.entries(adjustments)) {
    adjustment.offensePenalty = Number(adjustment.offensePenalty.toFixed(2));
    adjustment.defensePenalty = Number(adjustment.defensePenalty.toFixed(2));
    adjustment.note =
      adjustment.impactedPlayers.length > 0
        ? `${team}: ${adjustment.impactedPlayers.slice(0, 2).join(", ")}`
        : null;
  }

  return adjustments;
}

function formatStatusLabel(status: InjuryStatus) {
  if (status === "available") return "Available";
  if (status === "probable") return "Probable";
  if (status === "questionable") return "Questionable";
  if (status === "doubtful") return "Doubtful";
  if (status === "out") return "Out";
  if (status === "inactive") return "Inactive";
  if (status === "suspended") return "Suspended";
  return "Unknown";
}

function buildReportDateLabel(dayParam: "today" | "tomorrow") {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");

  const anchor = new Date(Date.UTC(getPart("year"), getPart("month") - 1, getPart("day"), 12, 0, 0));
  if (getPart("hour") < 5) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }
  if (dayParam === "tomorrow") {
    anchor.setUTCDate(anchor.getUTCDate() + 1);
  }

  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(anchor.getUTCDate()).padStart(2, "0")}`;
}

function parseReportMetadata(url: string) {
  const match = url.match(/Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf/i);
  if (!match) {
    return { reportDate: null, reportLabel: null, reportTimestamp: null, sortValue: 0 };
  }

  const [, reportDate, rawHour, rawMinute, meridiem] = match;
  const hour12 = Number(rawHour);
  const minute = Number(rawMinute);
  const upperMeridiem = meridiem.toUpperCase();

  let hour24 = hour12 % 12;
  if (upperMeridiem === "PM") hour24 += 12;

  const iso = `${reportDate}T${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`;
  const date = new Date(iso);

  return {
    reportDate,
    reportLabel: `${hour12}:${String(minute).padStart(2, "0")} ${upperMeridiem} ET`,
    reportTimestamp: Number.isNaN(date.getTime()) ? null : date.toISOString(),
    sortValue: Number.isNaN(date.getTime()) ? 0 : date.getTime(),
  };
}

function extractReportUrls(html: string, businessDate: string) {
  const dateFragment = businessDate.replace(/-/g, "\\-");
  const pattern = new RegExp(
    `https://ak-static\\.cms\\.nba\\.com/referee/injury/Injury-Report_${dateFragment}_[^"'\\s]+\\.pdf`,
    "gi"
  );

  const matches = html.match(pattern) ?? [];
  return Array.from(new Set(matches)).sort((a, b) => parseReportMetadata(b).sortValue - parseReportMetadata(a).sortValue);
}

function parseRowsFromTable(table: string[][]) {
  const parsed: NbaInjuryReportRow[] = [];
  let headerMap: Record<string, number> | null = null;

  for (const row of table) {
    const normalizedRow = row.map((cell) => normalizeHeaderCell(cell));

    if (
      normalizedRow.some((cell) => cell.includes("player name")) &&
      normalizedRow.some((cell) => cell.includes("current status"))
    ) {
      headerMap = {
        gameDate: normalizedRow.findIndex((cell) => cell.includes("game date")),
        gameTime: normalizedRow.findIndex((cell) => cell.includes("game time")),
        matchup: normalizedRow.findIndex((cell) => cell.includes("matchup")),
        team: normalizedRow.findIndex((cell) => cell === "team" || cell.includes("team")),
        playerName: normalizedRow.findIndex((cell) => cell.includes("player name")),
        status: normalizedRow.findIndex((cell) => cell.includes("current status")),
        reason: normalizedRow.findIndex((cell) => cell === "reason" || cell.includes("reason")),
      };
      continue;
    }

    if (!headerMap) continue;
    if (row.every((cell) => normalizeText(cell).length === 0)) continue;

    const team = normalizeText(row[headerMap.team] ?? "");
    const playerName = formatPlayerDisplayName(row[headerMap.playerName] ?? "");
    const statusLabel = normalizeText(row[headerMap.status] ?? "");

    if (!team || !playerName || !statusLabel) continue;
    if (playerName.toLowerCase() === "not yet submitted") continue;

    const status = normalizeInjuryStatus(statusLabel);

    parsed.push({
      gameDate: normalizeText(row[headerMap.gameDate] ?? "") || null,
      gameTime: normalizeText(row[headerMap.gameTime] ?? "") || null,
      matchup: normalizeText(row[headerMap.matchup] ?? "") || null,
      team,
      playerName,
      status,
      statusLabel: formatStatusLabel(status),
      reason: normalizeText(row[headerMap.reason] ?? "") || null,
      impactScore: getImpactScore(playerName, team),
    });
  }

  return parsed;
}

function parseRowsFromText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);

  const parsed: NbaInjuryReportRow[] = [];
  let currentGameDate: string | null = null;
  let currentGameTime: string | null = null;
  let currentMatchup: string | null = null;
  let currentTeam: string | null = null;
  let lastRow: NbaInjuryReportRow | null = null;

  for (const originalLine of lines) {
    if (
      originalLine.startsWith("Injury Report:") ||
      originalLine.startsWith("Page ") ||
      originalLine.startsWith("Game Date Game Time Matchup Team Player Name Current Status Reason") ||
      originalLine.startsWith("-- ")
    ) {
      continue;
    }

    let line = originalLine;

    const datedMatch = line.match(
      /^(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2}\s+\(ET\))\s+([A-Z]{2,4}@[A-Z]{2,4})\s+(.+)$/
    );
    if (datedMatch) {
      currentGameDate = datedMatch[1];
      currentGameTime = datedMatch[2];
      currentMatchup = datedMatch[3];
      line = datedMatch[4];
    } else {
      const timedMatch = line.match(/^(\d{1,2}:\d{2}\s+\(ET\))\s+([A-Z]{2,4}@[A-Z]{2,4})\s+(.+)$/);
      if (timedMatch) {
        currentGameTime = timedMatch[1];
        currentMatchup = timedMatch[2];
        line = timedMatch[3];
      }
    }

    const teamName = NBA_TEAM_NAMES.find((team) => line.startsWith(team));
    if (teamName) {
      currentTeam = teamName;
      line = line.slice(teamName.length).trim();
    }

    if (!line) {
      continue;
    }

    if (line === "NOT YET SUBMITTED") {
      lastRow = null;
      continue;
    }

    const statusMatch = line.match(STATUS_PATTERN);
    if (!statusMatch) {
      if (lastRow) {
        lastRow.reason = normalizeText([lastRow.reason, line].filter(Boolean).join(" ")) || null;
      }
      continue;
    }

    if (!currentTeam) {
      continue;
    }

    const statusLabel = statusMatch[1];
    const statusIndex = statusMatch.index ?? -1;
    const playerName = formatPlayerDisplayName(line.slice(0, statusIndex));
    const reason = normalizeText(line.slice(statusIndex + statusLabel.length));

    if (!playerName || playerName === "NOT YET SUBMITTED") {
      lastRow = null;
      continue;
    }

    const status = normalizeInjuryStatus(statusLabel);
    const row: NbaInjuryReportRow = {
      gameDate: currentGameDate,
      gameTime: currentGameTime,
      matchup: currentMatchup,
      team: currentTeam,
      playerName,
      status,
      statusLabel: formatStatusLabel(status),
      reason: reason || null,
      impactScore: getImpactScore(playerName, currentTeam),
    };

    parsed.push(row);
    lastRow = row;
  }

  return parsed;
}

async function parseInjuryPdfRows(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`NBA injury PDF fetch failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const parser = new PDFParse({ data: buffer });

  try {
    const tableResult = await parser.getTable();
    const tableRows = tableResult.pages.flatMap((page) =>
      page.tables.flatMap((table) => parseRowsFromTable(table))
    );

    if (tableRows.length > 0) {
      return tableRows;
    }

    const textResult = await parser.getText();
    return parseRowsFromText(textResult.text);
  } finally {
    await parser.destroy();
  }
}

function dedupeRows(rows: NbaInjuryReportRow[]) {
  const deduped = new Map<string, NbaInjuryReportRow>();

  for (const row of rows) {
    const key = `${normalizeTeamName(row.team)}::${normalizePlayerName(row.playerName)}`;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, row);
      continue;
    }

    if (getStatusSeverity(row.status) >= getStatusSeverity(existing.status)) {
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values());
}

export async function fetchOfficialNbaInjuryReport(dayParam: "today" | "tomorrow" = "today") {
  const businessDate = buildReportDateLabel(dayParam);
  const htmlResponse = await fetch(OFFICIAL_NBA_INJURY_PAGE, { cache: "no-store" });

  if (!htmlResponse.ok) {
    throw new Error(`NBA injury report page fetch failed: ${htmlResponse.status}`);
  }

  const html = await htmlResponse.text();
  const urls = extractReportUrls(html, businessDate);

  if (urls.length === 0) {
    return {
      businessDate,
      reportUrl: null,
      reportLabel: null,
      reportTimestamp: null,
      rows: [] as NbaInjuryReportRow[],
    };
  }

  const reportUrl = urls[0];
  const metadata = parseReportMetadata(reportUrl);
  const rows = dedupeRows(await parseInjuryPdfRows(reportUrl));

  return {
    businessDate,
    reportUrl,
    reportLabel: metadata.reportLabel,
    reportTimestamp: metadata.reportTimestamp,
    rows,
  };
}

function diffRows(previousRows: NbaInjuryReportRow[], nextRows: NbaInjuryReportRow[]) {
  const previousMap = new Map(
    previousRows.map((row) => [`${normalizeTeamName(row.team)}::${normalizePlayerName(row.playerName)}`, row])
  );

  const changes: NbaInjuryChange[] = [];

  for (const row of nextRows) {
    const key = `${normalizeTeamName(row.team)}::${normalizePlayerName(row.playerName)}`;
    const previous = previousMap.get(key);

    if (!previous) {
      if (row.impactScore >= 3 && getStatusSeverity(row.status) >= 2) {
        changes.push({
          team: row.team,
          playerName: row.playerName,
          fromStatus: null,
          toStatus: row.statusLabel,
          reason: row.reason,
          impactScore: row.impactScore,
        });
      }
      continue;
    }

    if (previous.status !== row.status && row.impactScore >= 3) {
      changes.push({
        team: row.team,
        playerName: row.playerName,
        fromStatus: previous.statusLabel,
        toStatus: row.statusLabel,
        reason: row.reason,
        impactScore: row.impactScore,
      });
    }
  }

  return changes.sort((a, b) => b.impactScore - a.impactScore);
}

function buildBoardMetaByPickId<T extends { id?: number | null; is_top_pick?: boolean | null; top_pick_rank?: number | null; notes?: string | null; created_at?: string | null }>(
  picks: T[]
) {
  const boardMetaByPickId = new Map<number, { boardBucket: NbaBoardBucket; slotNumber: number }>();

  const topRows = picks
    .filter((pick) => pick.id !== null && pick.id !== undefined && pick.is_top_pick)
    .sort((a, b) => {
      const rankDelta = (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99);
      if (rankDelta !== 0) return rankDelta;
      return normalizeText(a.created_at).localeCompare(normalizeText(b.created_at));
    });

  topRows.forEach((pick, index) => {
    boardMetaByPickId.set(pick.id as number, {
      boardBucket: "top",
      slotNumber: index + 1,
    });
  });

  const valueRows = picks
    .filter(
      (pick) =>
        pick.id !== null &&
        pick.id !== undefined &&
        pick.notes === "best_value" &&
        !boardMetaByPickId.has(pick.id as number)
    )
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });

  valueRows.forEach((pick, index) => {
    boardMetaByPickId.set(pick.id as number, {
      boardBucket: "value",
      slotNumber: index + 1,
    });
  });

  return boardMetaByPickId;
}

function getTeamPickSelectedSideTeam(pick: Pick<TeamPickLike, "side" | "home_team" | "away_team" | "market_type">) {
  const marketType = normalizeText(pick.market_type).toLowerCase();
  if (marketType === "total") return null;

  const normalizedSide = normalizeTeamName(pick.side);
  const normalizedHome = normalizeTeamName(pick.home_team);
  const normalizedAway = normalizeTeamName(pick.away_team);

  if (normalizedHome && normalizedSide.includes(normalizedHome)) return pick.home_team ?? null;
  if (normalizedAway && normalizedSide.includes(normalizedAway)) return pick.away_team ?? null;
  return null;
}

function getTeamPickOpponentTeam(pick: Pick<TeamPickLike, "home_team" | "away_team">, selectedTeam: string | null) {
  if (!selectedTeam) return null;
  if (normalizeTeamName(selectedTeam) === normalizeTeamName(pick.home_team)) return pick.away_team ?? null;
  if (normalizeTeamName(selectedTeam) === normalizeTeamName(pick.away_team)) return pick.home_team ?? null;
  return null;
}

export function buildNbaTeamInjuryActions(
  teamPicks: TeamPickLike[],
  reportRows: NbaInjuryReportRow[],
  previousRows: NbaInjuryReportRow[] = []
) {
  const rowsByTeam = new Map<string, NbaInjuryReportRow[]>();
  const boardMetaByPickId = buildBoardMetaByPickId(teamPicks);
  const previousByTeamAndPlayer = new Map(
    previousRows.map((row) => [
      `${normalizeTeamName(row.team)}::${normalizePlayerName(row.playerName)}`,
      row,
    ])
  );

  for (const row of reportRows) {
    const key = normalizeTeamName(row.team);
    const existing = rowsByTeam.get(key) ?? [];
    existing.push(row);
    rowsByTeam.set(key, existing);
  }

  const actions: NbaTeamInjuryAction[] = [];

  for (const pick of teamPicks) {
    const boardMeta =
      pick.id !== null && pick.id !== undefined ? boardMetaByPickId.get(pick.id) ?? null : null;
    const marketType = normalizeText(pick.market_type).toLowerCase();
    const selectedTeam = getTeamPickSelectedSideTeam(pick);
    const opponentTeam = getTeamPickOpponentTeam(pick, selectedTeam);
    const relevantRows = [
      ...(rowsByTeam.get(normalizeTeamName(pick.home_team)) ?? []),
      ...(rowsByTeam.get(normalizeTeamName(pick.away_team)) ?? []),
    ];

    if (relevantRows.length === 0) continue;
    const previousHighRiskRow = relevantRows
      .map((row) =>
        previousByTeamAndPlayer.get(
          `${normalizeTeamName(row.team)}::${normalizePlayerName(row.playerName)}`
        ) ?? null
      )
      .filter(
        (row): row is NbaInjuryReportRow =>
          row !== null && isHighRiskStatus(row.status)
      )
      .sort((a, b) => b.impactScore - a.impactScore)[0];

    const harmfulRows =
      marketType === "moneyline" || marketType === "spread"
        ? relevantRows.filter((row) => normalizeTeamName(row.team) === normalizeTeamName(selectedTeam))
        : relevantRows;
    const helpfulRows =
      marketType === "moneyline" || marketType === "spread"
        ? relevantRows.filter((row) => normalizeTeamName(row.team) === normalizeTeamName(opponentTeam))
        : [];

    const removeRow =
      harmfulRows
        .filter((row) => row.impactScore >= 4 && (row.status === "out" || row.status === "doubtful"))
        .sort((a, b) => b.impactScore - a.impactScore)[0] ??
      harmfulRows
        .filter((row) => row.impactScore >= 5 && row.status === "questionable")
        .sort((a, b) => b.impactScore - a.impactScore)[0];

    if (removeRow) {
      actions.push({
        pickId: pick.id ?? null,
        gameLabel: pick.game_label,
        team: removeRow.team,
        playerName: removeRow.playerName,
        status: removeRow.statusLabel,
        reason: removeRow.reason,
        impactScore: removeRow.impactScore,
        boardBucket: boardMeta?.boardBucket ?? null,
        slotNumber: boardMeta?.slotNumber ?? null,
        action: "remove",
        message: `${removeRow.playerName} is ${removeRow.statusLabel.toLowerCase()}, so this game is off the NBA team board for now.`,
      });
      continue;
    }

    const reinstateRow =
      previousHighRiskRow &&
      (marketType !== "moneyline" && marketType !== "spread"
        ? relevantRows
        : normalizeTeamName(previousHighRiskRow.team) === normalizeTeamName(selectedTeam)
          ? relevantRows
          : [])
        .filter(
          (row) =>
            normalizePlayerName(row.playerName) === normalizePlayerName(previousHighRiskRow.playerName) &&
            (row.status === "available" || row.status === "probable")
        )
        .sort((a, b) => b.impactScore - a.impactScore)[0];

    if (reinstateRow) {
      actions.push({
        pickId: pick.id ?? null,
        gameLabel: pick.game_label,
        team: reinstateRow.team,
        playerName: reinstateRow.playerName,
        status: reinstateRow.statusLabel,
        reason: reinstateRow.reason,
        impactScore: reinstateRow.impactScore,
        boardBucket: boardMeta?.boardBucket ?? null,
        slotNumber: boardMeta?.slotNumber ?? null,
        action: "reinstate",
        message:
          reinstateRow.status === "available"
            ? `${reinstateRow.playerName} is available again, so this game can go back on the NBA board.`
            : `${reinstateRow.playerName} moved back to probable, so this game can go back on the NBA board with caution.`,
      });
      continue;
    }

    const strengtheningRow =
      (marketType === "moneyline" || marketType === "spread")
        ? helpfulRows
            .filter((row) => row.impactScore >= 4 && (row.status === "out" || row.status === "doubtful"))
            .sort((a, b) => b.impactScore - a.impactScore)[0] ??
          helpfulRows
            .filter((row) => row.impactScore >= 5 && row.status === "questionable")
            .sort((a, b) => b.impactScore - a.impactScore)[0]
        : null;

    if (strengtheningRow && selectedTeam) {
      actions.push({
        pickId: pick.id ?? null,
        gameLabel: pick.game_label,
        team: strengtheningRow.team,
        playerName: strengtheningRow.playerName,
        status: strengtheningRow.statusLabel,
        reason: strengtheningRow.reason,
        impactScore: strengtheningRow.impactScore,
        boardBucket: boardMeta?.boardBucket ?? null,
        slotNumber: boardMeta?.slotNumber ?? null,
        action: "caution",
        message: `${strengtheningRow.playerName} is ${strengtheningRow.statusLabel.toLowerCase()}, which strengthens the ${selectedTeam} side.`,
      });
      continue;
    }

    const cautionRow = harmfulRows
      .filter((row) => row.impactScore >= 3 && (isHighRiskStatus(row.status) || row.status === "probable"))
      .sort((a, b) => b.impactScore - a.impactScore)[0];

    if (cautionRow) {
      actions.push({
        pickId: pick.id ?? null,
        gameLabel: pick.game_label,
        team: cautionRow.team,
        playerName: cautionRow.playerName,
        status: cautionRow.statusLabel,
        reason: cautionRow.reason,
        impactScore: cautionRow.impactScore,
        boardBucket: boardMeta?.boardBucket ?? null,
        slotNumber: boardMeta?.slotNumber ?? null,
        action: "caution",
        message: `${cautionRow.playerName} is ${cautionRow.statusLabel.toLowerCase()}, so this game needs a little extra caution.`,
      });
    }
  }

  return actions;
}

export function buildNbaPropInjuryActions(
  propPicks: PropPickLike[],
  reportRows: NbaInjuryReportRow[],
  previousRows: NbaInjuryReportRow[] = []
) {
  const rowsByTeamAndPlayer = new Map<string, NbaInjuryReportRow>();
  const boardMetaByPickId = buildBoardMetaByPickId(propPicks);
  const previousRowsByTeamAndPlayer = new Map(
    previousRows.map((row) => [
      `${normalizeTeamName(row.team)}::${normalizePlayerName(row.playerName)}`,
      row,
    ])
  );

  for (const row of reportRows) {
    rowsByTeamAndPlayer.set(
      `${normalizeTeamName(row.team)}::${normalizePlayerName(row.playerName)}`,
      row
    );
  }

  const actions: NbaPropInjuryAction[] = [];

  for (const pick of propPicks) {
    const boardMeta =
      pick.id !== null && pick.id !== undefined ? boardMetaByPickId.get(pick.id) ?? null : null;
    const awayKey = `${normalizeTeamName(pick.away_team)}::${normalizePlayerName(pick.player_name)}`;
    const homeKey = `${normalizeTeamName(pick.home_team)}::${normalizePlayerName(pick.player_name)}`;
    const matchedRow = rowsByTeamAndPlayer.get(awayKey) ?? rowsByTeamAndPlayer.get(homeKey);
    const previousMatchedRow =
      previousRowsByTeamAndPlayer.get(awayKey) ?? previousRowsByTeamAndPlayer.get(homeKey) ?? null;

    if (!matchedRow) continue;

    if (isHighRiskStatus(matchedRow.status)) {
      actions.push({
        pickId: pick.id ?? null,
        gameLabel: pick.game_label,
        playerName: matchedRow.playerName,
        status: matchedRow.statusLabel,
        reason: matchedRow.reason,
        impactScore: matchedRow.impactScore,
        boardBucket: boardMeta?.boardBucket ?? null,
        slotNumber: boardMeta?.slotNumber ?? null,
        action: "void",
        message: `${matchedRow.playerName} is ${matchedRow.statusLabel.toLowerCase()}, so this prop is voided from the board.`,
      });
      continue;
    }

    if (
      previousMatchedRow &&
      isHighRiskStatus(previousMatchedRow.status) &&
      (matchedRow.status === "available" || matchedRow.status === "probable")
    ) {
      actions.push({
        pickId: pick.id ?? null,
        gameLabel: pick.game_label,
        playerName: matchedRow.playerName,
        status: matchedRow.statusLabel,
        reason: matchedRow.reason,
        impactScore: matchedRow.impactScore,
        boardBucket: boardMeta?.boardBucket ?? null,
        slotNumber: boardMeta?.slotNumber ?? null,
        action: "reinstate",
        message:
          matchedRow.status === "available"
            ? `${matchedRow.playerName} is available again, so this prop can go back on the board.`
            : `${matchedRow.playerName} moved back to probable, so this prop can go back on the board with caution.`,
      });
      continue;
    }

    if (matchedRow.status === "probable") {
      actions.push({
        pickId: pick.id ?? null,
        gameLabel: pick.game_label,
        playerName: matchedRow.playerName,
        status: matchedRow.statusLabel,
        reason: matchedRow.reason,
        impactScore: matchedRow.impactScore,
        boardBucket: boardMeta?.boardBucket ?? null,
        slotNumber: boardMeta?.slotNumber ?? null,
        action: "caution",
        message: `${matchedRow.playerName} is listed probable, so keep an eye on final confirmation before using this prop.`,
      });
    }
  }

  return actions;
}

export function buildNbaInjurySyncData(params: {
  businessDate: string;
  reportUrl: string | null;
  reportLabel: string | null;
  reportTimestamp: string | null;
  previousRows: NbaInjuryReportRow[];
  nextRows: NbaInjuryReportRow[];
  teamPicks: TeamPickLike[];
  propPicks: PropPickLike[];
}) {
  const significantChanges = diffRows(params.previousRows, params.nextRows);
  const teamActions = buildNbaTeamInjuryActions(params.teamPicks, params.nextRows, params.previousRows);
  const propActions = buildNbaPropInjuryActions(params.propPicks, params.nextRows, params.previousRows);

  return {
    businessDate: params.businessDate,
    reportUrl: params.reportUrl,
    reportLabel: params.reportLabel,
    reportTimestamp: params.reportTimestamp,
    checkedAt: new Date().toISOString(),
    rows: params.nextRows,
    significantChanges,
    teamActions,
    propActions,
  } satisfies NbaInjurySyncData;
}
