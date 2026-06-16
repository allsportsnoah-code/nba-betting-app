import { getCachedData, setCachedData } from "@/lib/cache";

const AUDIT_SNAPSHOT_VERSION = 1;

type AuditBaseSnapshot = {
  version: number;
  pickDate: string;
  updatedAt: string;
};

export type AuditMarketType =
  | "moneyline"
  | "spread"
  | "total"
  | "team_total"
  | "f5_moneyline"
  | "f5_spread"
  | "f5_total";

export type MlbTeamAuditRow = {
  gameId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string | null;
  marketType: AuditMarketType;
  side: string;
  lineTaken: number | null;
  oddsTaken: number | null;
  projectedHomeRuns: number | null;
  projectedAwayRuns: number | null;
  projectedTotal: number | null;
  projectedMargin: number | null;
  fairHomeMoneyline: number | null;
  fairAwayMoneyline: number | null;
  signal: string | null;
  edgeLabel: string | null;
  edge: number | null;
  confidenceScore: number | null;
  topPickScore: number | null;
  bestValueScore: number | null;
  betRecommendation: "bet" | "lean" | "pass" | null;
  reasonLabels: string[];
  riskFlags: string[];
  selectedByCurrentModel: boolean;
  currentTopEligible: boolean;
  currentBestValueEligible: boolean;
  currentSelectedBucket: "top" | "value" | null;
  currentSelectedRank: number | null;
  homeAdjustmentNote: string | null;
  awayAdjustmentNote: string | null;
  homeStarter: string | null;
  awayStarter: string | null;
  weatherNote?: string | null;
  contextRiskScore?: number | null;
  contextRiskNotes?: string[];
};

export type MlbTeamAuditSnapshot = AuditBaseSnapshot & {
  rows: MlbTeamAuditRow[];
};

export type MlbPropAuditRow = {
  externalEventId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string | null;
  playerName: string;
  playerTeam: string;
  playerTeamShort: string;
  marketType: string;
  line: number | null;
  side: string;
  oddsTaken: number | null;
  projectedLine: number | null;
  marketLine: number | null;
  signedEdge: number | null;
  edge: number | null;
  impliedProbability: number | null;
  trueProbability: number | null;
  confidenceScore: number | null;
  topPickScore: number | null;
  lineClearProbability: number | null;
  recentLineClearRate: number | null;
  seasonLineClearRate: number | null;
  spikeGameShare: number | null;
  expectedPlateAppearances: number | null;
  projectedInnings: number | null;
  projectedPitchCount: number | null;
  projectedTimesThroughOrder: number | null;
  confirmedLineup: boolean | null;
  battingOrderSlot: number | null;
  battingOrderSample: number | null;
  contextNote: string | null;
  marketHealthNote: string | null;
  betRecommendation: "bet" | "lean" | "pass" | null;
  reasonLabels: string[];
  riskFlags: string[];
  passesCurrentFilters: boolean;
  currentModelPreferredSide: string | null;
  selectedForCurrentCandidatePool: boolean;
};

export type MlbPropAuditEventSnapshot = AuditBaseSnapshot & {
  eventId: string;
  gameLabel: string;
  diagnostics: Record<string, unknown> | null;
  rows: MlbPropAuditRow[];
};

export type NbaTeamAuditRow = {
  gameId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string | null;
  marketType: AuditMarketType;
  side: string;
  lineTaken: number | null;
  oddsTaken: number | null;
  projectedHomeSpread: number | null;
  projectedHomeMargin: number | null;
  projectedTotal: number | null;
  projectedHomeScore: number | null;
  projectedAwayScore: number | null;
  fairHomeMoneyline: number | null;
  fairAwayMoneyline: number | null;
  signal: string | null;
  edge: number | null;
  confidenceScore: number | null;
  topPickScore: number | null;
  bestValueScore: number | null;
  selectedByCurrentModel: boolean;
  currentTopEligible: boolean;
  currentBestValueEligible: boolean;
  currentSelectedBucket: "top" | "value" | null;
  currentSelectedRank: number | null;
  contextRiskScore?: number | null;
  contextRiskNotes?: string[];
};

export type NbaTeamAuditSnapshot = AuditBaseSnapshot & {
  rows: NbaTeamAuditRow[];
};

export type NbaPropAuditRow = {
  externalEventId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string | null;
  propType: string;
  playerName: string;
  line: number | null;
  side: string;
  oddsTaken: number | null;
  marketScore: number | null;
  topScore: number | null;
  valueScore: number | null;
  currentThresholdTop: number | null;
  currentThresholdValue: number | null;
  currentTopEligible: boolean;
  currentBestValueEligible: boolean;
  currentModelPreferredSide: string | null;
  selectedForCurrentCandidatePool: boolean;
  contextNote?: string | null;
  contextRiskScore?: number | null;
  riskFlags?: string[];
  availableForBoard?: boolean | null;
};

export type NbaPropAuditSnapshot = AuditBaseSnapshot & {
  propType: string;
  diagnostics: Record<string, unknown> | null;
  rows: NbaPropAuditRow[];
};

function buildBaseSnapshot(pickDate: string) {
  return {
    version: AUDIT_SNAPSHOT_VERSION,
    pickDate,
    updatedAt: new Date().toISOString(),
  };
}

function getMlbTeamAuditCacheKey(pickDate: string) {
  return `future_audit_mlb_team_${pickDate}`;
}

function getMlbPropAuditCacheKey(pickDate: string, eventId: string) {
  return `future_audit_mlb_prop_${pickDate}_${eventId}`;
}

function getNbaTeamAuditCacheKey(pickDate: string) {
  return `future_audit_nba_team_${pickDate}`;
}

function getNbaPropAuditCacheKey(pickDate: string, propType: string) {
  return `future_audit_nba_prop_${pickDate}_${propType}`;
}

export async function setMlbTeamAuditSnapshot(
  pickDate: string,
  rows: MlbTeamAuditRow[]
) {
  const snapshot: MlbTeamAuditSnapshot = {
    ...buildBaseSnapshot(pickDate),
    rows,
  };
  await setCachedData(getMlbTeamAuditCacheKey(pickDate), snapshot);
  return snapshot;
}

export async function setMlbPropAuditEventSnapshot(params: {
  pickDate: string;
  eventId: string;
  gameLabel: string;
  diagnostics?: Record<string, unknown> | null;
  rows: MlbPropAuditRow[];
}) {
  const snapshot: MlbPropAuditEventSnapshot = {
    ...buildBaseSnapshot(params.pickDate),
    eventId: params.eventId,
    gameLabel: params.gameLabel,
    diagnostics: params.diagnostics ?? null,
    rows: params.rows,
  };
  await setCachedData(getMlbPropAuditCacheKey(params.pickDate, params.eventId), snapshot);
  return snapshot;
}

export async function setNbaTeamAuditSnapshot(
  pickDate: string,
  rows: NbaTeamAuditRow[]
) {
  const snapshot: NbaTeamAuditSnapshot = {
    ...buildBaseSnapshot(pickDate),
    rows,
  };
  await setCachedData(getNbaTeamAuditCacheKey(pickDate), snapshot);
  return snapshot;
}

export async function setNbaPropAuditSnapshot(params: {
  pickDate: string;
  propType: string;
  diagnostics?: Record<string, unknown> | null;
  rows: NbaPropAuditRow[];
}) {
  const snapshot: NbaPropAuditSnapshot = {
    ...buildBaseSnapshot(params.pickDate),
    propType: params.propType,
    diagnostics: params.diagnostics ?? null,
    rows: params.rows,
  };
  await setCachedData(getNbaPropAuditCacheKey(params.pickDate, params.propType), snapshot);
  return snapshot;
}

export async function getMlbTeamAuditSnapshot(pickDate: string) {
  const cached = await getCachedData(getMlbTeamAuditCacheKey(pickDate));
  return (cached?.data as MlbTeamAuditSnapshot | null) ?? null;
}

export async function getMlbPropAuditEventSnapshot(pickDate: string, eventId: string) {
  const cached = await getCachedData(getMlbPropAuditCacheKey(pickDate, eventId));
  return (cached?.data as MlbPropAuditEventSnapshot | null) ?? null;
}

export async function getNbaTeamAuditSnapshot(pickDate: string) {
  const cached = await getCachedData(getNbaTeamAuditCacheKey(pickDate));
  return (cached?.data as NbaTeamAuditSnapshot | null) ?? null;
}

export async function getNbaPropAuditSnapshot(pickDate: string, propType: string) {
  const cached = await getCachedData(getNbaPropAuditCacheKey(pickDate, propType));
  return (cached?.data as NbaPropAuditSnapshot | null) ?? null;
}
