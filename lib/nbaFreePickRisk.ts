import { getNbaImpactScoreForPlayer } from "@/lib/nbaImpactRankings";

type NbaTeamRiskPick = {
  market_scope?: string | null;
  market_type?: string | null;
  side?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  edge_label?: string | null;
};

type NbaTeamRiskAction = {
  action?: string | null;
  team?: string | null;
  playerName?: string | null;
  status?: string | null;
  impactScore?: number | null;
};

type ParsedInjuryWatchItem = {
  playerName: string;
  status: string;
  team: string;
  impactScore: number;
};

const HIGH_IMPACT_OPPONENT_QUESTIONABLE_SCORE = 5;

function normalizeLookup(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeSideTeam(value: string | null | undefined) {
  return normalizeLookup(value)
    .replace(/\s+ml$/i, "")
    .replace(/\s+[+-]?\d+(?:\.\d+)?$/i, "")
    .trim();
}

function teamsMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeLookup(a);
  const right = normalizeLookup(b);
  return Boolean(left && right && left === right);
}

function getSelectedTeam(pick: NbaTeamRiskPick) {
  if (pick.market_type !== "moneyline" && pick.market_type !== "spread") {
    return null;
  }

  const side = normalizeLookup(pick.side);
  const strippedSide = normalizeSideTeam(pick.side);
  const homeTeam = normalizeLookup(pick.home_team);
  const awayTeam = normalizeLookup(pick.away_team);

  if (awayTeam && (side.includes(awayTeam) || strippedSide === awayTeam)) return pick.away_team ?? null;
  if (homeTeam && (side.includes(homeTeam) || strippedSide === homeTeam)) return pick.home_team ?? null;

  return null;
}

function getWatchItems(value: string | null | undefined) {
  return (value ?? "")
    .split(" | ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("Watch:") || part.startsWith("Learning:"))
    .flatMap((part) =>
      part
        .replace(/^(Watch|Learning):\s*/, "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );
}

function parseInjuryWatchItem(item: string): ParsedInjuryWatchItem | null {
  const match = item.match(
    /^(.+?)\s+(available|probable|questionable|doubtful|out|inactive|suspended)\s+for\s+(.+)$/i
  );
  if (!match) return null;

  const [, playerName, status, team] = match;
  const impact = getNbaImpactScoreForPlayer(playerName, team);

  return {
    playerName,
    status: status.toLowerCase(),
    team,
    impactScore: impact.impactScore,
  };
}

function isHighRiskStatus(value: string | null | undefined) {
  const status = normalizeLookup(value);
  return (
    status.includes("questionable") ||
    status.includes("doubtful") ||
    status.includes("out") ||
    status.includes("inactive") ||
    status.includes("suspended")
  );
}

function isOpponentWatchItemCapping(item: ParsedInjuryWatchItem) {
  return item.status === "questionable" && item.impactScore >= HIGH_IMPACT_OPPONENT_QUESTIONABLE_SCORE;
}

function isActionCapping(pick: NbaTeamRiskPick, action: NbaTeamRiskAction) {
  if (action.action === "remove") return true;

  const selectedTeam = getSelectedTeam(pick);
  if (!selectedTeam) return isHighRiskStatus(action.status);

  if (teamsMatch(action.team, selectedTeam)) {
    return (action.impactScore ?? 0) >= 3 || isHighRiskStatus(action.status);
  }

  return (
    normalizeLookup(action.status).includes("questionable") &&
    (action.impactScore ?? 0) >= HIGH_IMPACT_OPPONENT_QUESTIONABLE_SCORE
  );
}

export function hasNbaTeamFreePickRiskCap(
  pick: NbaTeamRiskPick,
  action?: NbaTeamRiskAction | null
) {
  if (pick.market_scope && pick.market_scope !== "team") return false;
  if (action && isActionCapping(pick, action)) return true;

  const label = `${pick.edge_label ?? ""}`.toLowerCase();
  if (
    !label.includes("watch:") &&
    !label.includes("injury") &&
    !label.includes("questionable") &&
    !label.includes("doubtful") &&
    !label.includes("out")
  ) {
    return false;
  }

  const selectedTeam = getSelectedTeam(pick);
  const watchItems = getWatchItems(pick.edge_label).filter(
    (item) => !item.toLowerCase().startsWith("low payout")
  );

  if (watchItems.length === 0) return false;
  if (!selectedTeam) return true;

  for (const item of watchItems) {
    const parsed = parseInjuryWatchItem(item);
    if (!parsed) return true;
    if (teamsMatch(parsed.team, selectedTeam)) return true;
    if (isOpponentWatchItemCapping(parsed)) return true;
  }

  return false;
}
