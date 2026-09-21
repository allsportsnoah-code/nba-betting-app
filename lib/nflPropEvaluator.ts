import { nflTeamProfiles, type NflTeamProfile } from "@/lib/nflRatings";

// Math utilities

function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCDF(x: number, mean: number, std: number): number {
  if (std <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (std * Math.SQRT2)));
}

function pOver(line: number, mean: number, std: number): number {
  return Math.max(0.01, Math.min(0.99, 1 - normalCDF(line, mean, std)));
}

function pUnder(line: number, mean: number, std: number): number {
  return Math.max(0.01, Math.min(0.99, normalCDF(line, mean, std)));
}

// Rating helpers

const LEAGUE_AVG = 100;

export type PropGameContext = {
  gameTotal: number | null;
  homeTeamTotal: number | null;
  awayTeamTotal: number | null;
  homeSpread: number | null;
};

export function extractPropGameContext(
  game: {
    home_team: string;
    bookmakers?: {
      markets?: {
        key: string;
        outcomes?: { name?: string | null; point?: number | null }[];
      }[];
    }[];
  }
): PropGameContext {
  const allMarkets = game.bookmakers?.flatMap((b) => b.markets ?? []) ?? [];
  const totalMarket = allMarkets.find((m) => m.key === "totals");
  const spreadMarket = allMarkets.find((m) => m.key === "spreads");

  const gameTotal = totalMarket?.outcomes?.find((o) => o.name === "Over")?.point ?? null;
  const homeSpread = spreadMarket?.outcomes?.find((o) => o.name === game.home_team)?.point ?? null;

  let homeTeamTotal: number | null = null;
  let awayTeamTotal: number | null = null;
  if (gameTotal != null && homeSpread != null) {
    homeTeamTotal = Number(((gameTotal - homeSpread) / 2).toFixed(1));
    awayTeamTotal = Number(((gameTotal + homeSpread) / 2).toFixed(1));
  }

  return { gameTotal, homeTeamTotal, awayTeamTotal, homeSpread };
}

export type PropHitResult = {
  hitRate: number;
  projectedValue: number;
  edge: number;
  offAdj: number;
  defAdj: number;
  paceAdj: number;
};

function impliedProbFromOdds(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

export function evaluatePropHitRate(
  marketKey: string,
  playerTeam: string,
  opponentTeam: string,
  direction: "over" | "under" | "yes" | "no",
  line: number | null,
  oddsTaken: number,
  ctx: PropGameContext
): PropHitResult {
  const implied = impliedProbFromOdds(oddsTaken);
  const myTeam = nflTeamProfiles[playerTeam];
  const opp = nflTeamProfiles[opponentTeam];

  if (!myTeam || !opp) {
    return { hitRate: implied, projectedValue: line ?? 0, edge: 0, offAdj: 0, defAdj: 0, paceAdj: 0 };
  }

  const tendency = myTeam.coaching.passRateTendency;
  const gameTotalFactor = ctx.gameTotal ? (ctx.gameTotal - 44) / 44 : 0;

  switch (marketKey) {
    case "player_pass_yds":
      return evalPassYards(line, direction, myTeam, opp, tendency, gameTotalFactor, implied);
    case "player_pass_tds":
      return evalPassTDs(line, direction, myTeam, opp, tendency, implied);
    case "player_pass_attempts":
      return evalPassAttempts(line, direction, myTeam, opp, tendency, implied);
    case "player_pass_completions":
      return evalPassCompletions(line, direction, myTeam, opp, tendency, implied);
    case "player_rush_yds":
      return evalRushYards(line, direction, myTeam, opp, tendency, implied);
    case "player_rush_attempts":
      return evalRushAttempts(line, direction, myTeam, opp, tendency, implied);
    case "player_receptions":
      return evalReceptions(line, direction, myTeam, opp, tendency, implied);
    case "player_reception_yds":
      return evalReceptionYards(line, direction, myTeam, opp, tendency, implied);
    case "player_anytime_td":
      return evalAnytimeTD(myTeam, opp, tendency, implied, ctx);
    case "player_kicking_points":
      return evalKickingPoints(line, direction, myTeam, opp, implied);
    default:
      return { hitRate: implied, projectedValue: line ?? 0, edge: 0, offAdj: 0, defAdj: 0, paceAdj: 0 };
  }
}

// Market-specific models

function evalPassYards(
  line: number | null,
  direction: "over" | "under" | "yes" | "no",
  myTeam: NflTeamProfile,
  opp: NflTeamProfile,
  tendency: string,
  gameTotalFactor: number,
  implied: number
): PropHitResult {
  const base = tendency === "pass-heavy" ? 268 : tendency === "run-first" ? 218 : 245;
  const std = 62;
  const offAdj = (myTeam.offense - LEAGUE_AVG) * 1.8;
  const defAdj = -(opp.passRush - LEAGUE_AVG) * 1.5 - (opp.coverage - LEAGUE_AVG) * 0.8;
  const paceAdj = gameTotalFactor * 30;
  const projected = base + offAdj + defAdj + paceAdj;
  if (!line) return { hitRate: implied, projectedValue: Math.round(projected), edge: 0, offAdj, defAdj, paceAdj };
  const hitRate = direction === "over" ? pOver(line, projected, std) : pUnder(line, projected, std);
  return { hitRate, projectedValue: Math.round(projected), edge: hitRate - implied, offAdj, defAdj, paceAdj };
}

function evalPassTDs(
  line: number | null,
  direction: "over" | "under" | "yes" | "no",
  myTeam: NflTeamProfile,
  opp: NflTeamProfile,
  tendency: string,
  implied: number
): PropHitResult {
  const base = tendency === "pass-heavy" ? 2.1 : tendency === "run-first" ? 1.5 : 1.8;
  const std = 1.1;
  const offAdj = (myTeam.offense - LEAGUE_AVG) * 0.025;
  const defAdj = -(opp.defense - LEAGUE_AVG) * 0.02;
  const paceAdj = 0;
  const projected = base + offAdj + defAdj;
  if (!line) return { hitRate: implied, projectedValue: Number(projected.toFixed(1)), edge: 0, offAdj, defAdj, paceAdj };
  const hitRate = direction === "over" ? pOver(line, projected, std) : pUnder(line, projected, std);
  return { hitRate, projectedValue: Number(projected.toFixed(1)), edge: hitRate - implied, offAdj, defAdj, paceAdj };
}

function evalPassAttempts(
  line: number | null,
  direction: "over" | "under" | "yes" | "no",
  myTeam: NflTeamProfile,
  opp: NflTeamProfile,
  tendency: string,
  implied: number
): PropHitResult {
  const base = tendency === "pass-heavy" ? 38 : tendency === "run-first" ? 27 : 33;
  const std = 7;
  const offAdj = (myTeam.offense - LEAGUE_AVG) * 0.15;
  const defAdj = -(opp.passRush - LEAGUE_AVG) * 0.12;
  const paceAdj = 0;
  const projected = base + offAdj + defAdj;
  if (!line) return { hitRate: implied, projectedValue: Math.round(projected), edge: 0, offAdj, defAdj, paceAdj };
  const hitRate = direction === "over" ? pOver(line, projected, std) : pUnder(line, projected, std);
  return { hitRate, projectedValue: Math.round(projected), edge: hitRate - implied, offAdj, defAdj, paceAdj };
}

function evalPassCompletions(
  line: number | null,
  direction: "over" | "under" | "yes" | "no",
  myTeam: NflTeamProfile,
  opp: NflTeamProfile,
  tendency: string,
  implied: number
): PropHitResult {
  const base = tendency === "pass-heavy" ? 25 : tendency === "run-first" ? 18 : 22;
  const std = 5.5;
  const offAdj = (myTeam.offense - LEAGUE_AVG) * 0.12;
  const defAdj = -(opp.coverage - LEAGUE_AVG) * 0.10;
  const paceAdj = 0;
  const projected = base + offAdj + defAdj;
  if (!line) return { hitRate: implied, projectedValue: Math.round(projected), edge: 0, offAdj, defAdj, paceAdj };
  const hitRate = direction === "over" ? pOver(line, projected, std) : pUnder(line, projected, std);
  return { hitRate, projectedValue: Math.round(projected), edge: hitRate - implied, offAdj, defAdj, paceAdj };
}

function evalRushYards(
  line: number | null,
  direction: "over" | "under" | "yes" | "no",
  myTeam: NflTeamProfile,
  opp: NflTeamProfile,
  tendency: string,
  implied: number
): PropHitResult {
  const base = tendency === "run-first" ? 105 : tendency === "pass-heavy" ? 68 : 88;
  const std = 40;
  const offAdj = (myTeam.offense - LEAGUE_AVG) * 1.2;
  const defAdj = -(opp.defense - LEAGUE_AVG) * 1.4;
  const paceAdj = 0;
  const projected = base + offAdj + defAdj;
  if (!line) return { hitRate: implied, projectedValue: Math.round(projected), edge: 0, offAdj, defAdj, paceAdj };
  const hitRate = direction === "over" ? pOver(line, projected, std) : pUnder(line, projected, std);
  return { hitRate, projectedValue: Math.round(projected), edge: hitRate - implied, offAdj, defAdj, paceAdj };
}

function evalRushAttempts(
  line: number | null,
  direction: "over" | "under" | "yes" | "no",
  myTeam: NflTeamProfile,
  opp: NflTeamProfile,
  tendency: string,
  implied: number
): PropHitResult {
  const base = tendency === "run-first" ? 22 : tendency === "pass-heavy" ? 13 : 17;
  const std = 5;
  const offAdj = (myTeam.offense - LEAGUE_AVG) * 0.08;
  const defAdj = -(opp.defense - LEAGUE_AVG) * 0.08;
  const paceAdj = 0;
  const projected = base + offAdj + defAdj;
  if (!line) return { hitRate: implied, projectedValue: Math.round(projected), edge: 0, offAdj, defAdj, paceAdj };
  const hitRate = direction === "over" ? pOver(line, projected, std) : pUnder(line, projected, std);
  return { hitRate, projectedValue: Math.round(projected), edge: hitRate - implied, offAdj, defAdj, paceAdj };
}

function evalReceptions(
  line: number | null,
  direction: "over" | "under" | "yes" | "no",
  myTeam: NflTeamProfile,
  opp: NflTeamProfile,
  tendency: string,
  implied: number
): PropHitResult {
  const base = tendency === "pass-heavy" ? 7.0 : tendency === "run-first" ? 5.0 : 6.0;
  const std = 2.4;
  const offAdj = (myTeam.offense - LEAGUE_AVG) * 0.06;
  const defAdj = -(opp.coverage - LEAGUE_AVG) * 0.08;
  const paceAdj = 0;
  const projected = base + offAdj + defAdj;
  if (!line) return { hitRate: implied, projectedValue: Number(projected.toFixed(1)), edge: 0, offAdj, defAdj, paceAdj };
  const hitRate = direction === "over" ? pOver(line, projected, std) : pUnder(line, projected, std);
  return { hitRate, projectedValue: Number(projected.toFixed(1)), edge: hitRate - implied, offAdj, defAdj, paceAdj };
}

function evalReceptionYards(
  line: number | null,
  direction: "over" | "under" | "yes" | "no",
  myTeam: NflTeamProfile,
  opp: NflTeamProfile,
  tendency: string,
  implied: number
): PropHitResult {
  const base = tendency === "pass-heavy" ? 85 : tendency === "run-first" ? 55 : 72;
  const std = 35;
  const offAdj = (myTeam.offense - LEAGUE_AVG) * 1.0;
  const defAdj = -(opp.coverage - LEAGUE_AVG) * 1.2;
  const paceAdj = 0;
  const projected = base + offAdj + defAdj;
  if (!line) return { hitRate: implied, projectedValue: Math.round(projected), edge: 0, offAdj, defAdj, paceAdj };
  const hitRate = direction === "over" ? pOver(line, projected, std) : pUnder(line, projected, std);
  return { hitRate, projectedValue: Math.round(projected), edge: hitRate - implied, offAdj, defAdj, paceAdj };
}

function evalAnytimeTD(
  myTeam: NflTeamProfile,
  opp: NflTeamProfile,
  tendency: string,
  implied: number,
  ctx: PropGameContext
): PropHitResult {
  let base = 0.20;
  if (tendency === "run-first") base = 0.22;
  if (tendency === "pass-heavy") base = 0.19;

  const offAdj = (myTeam.offense - LEAGUE_AVG) / 120;
  const defAdj = -(opp.defense - LEAGUE_AVG) / 120;
  const paceAdj = ctx.gameTotal ? (ctx.gameTotal - 44) / 500 : 0;

  const hitRate = Math.max(0.08, Math.min(0.55, base + offAdj + defAdj + paceAdj));
  return { hitRate, projectedValue: 0.5, edge: hitRate - implied, offAdj, defAdj, paceAdj };
}

function evalKickingPoints(
  line: number | null,
  direction: "over" | "under" | "yes" | "no",
  myTeam: NflTeamProfile,
  opp: NflTeamProfile,
  implied: number
): PropHitResult {
  const base = 9.0;
  const std = 5.0;
  const offAdj = (myTeam.offense - LEAGUE_AVG) * 0.12;
  const defAdj = -(opp.defense - LEAGUE_AVG) * 0.10;
  const paceAdj = 0;
  const projected = base + offAdj + defAdj;
  if (!line) return { hitRate: implied, projectedValue: Number(projected.toFixed(1)), edge: 0, offAdj, defAdj, paceAdj };
  const hitRate = direction === "over" ? pOver(line, projected, std) : pUnder(line, projected, std);
  return { hitRate, projectedValue: Number(projected.toFixed(1)), edge: hitRate - implied, offAdj, defAdj, paceAdj };
}

/**
 * Lotto score: sweet spot is 55-68% hit rate. Penalizes picks too likely (kills payout)
 * or too uncertain (kills parlay). Rewards positive edge (model > implied prob).
 */
export function calcLottoScoreFromEval(
  hitRate: number,
  edge: number,
  oddsTaken: number,
  contextBoost: number
): number {
  const deviation = Math.abs(hitRate - 0.62);
  const hitRateScore = Math.max(0, 40 - deviation * 120);
  const edgeScore = Math.max(-15, Math.min(20, edge * 80));
  const contextScore = Math.min(8, Math.max(0, contextBoost));
  const juicePenalty = oddsTaken < -150 ? (Math.abs(oddsTaken) - 150) * 0.15 : 0;
  const payoutBonus = oddsTaken >= -120 && oddsTaken <= -100 ? 5 : 0;
  const rangePenalty =
    hitRate < 0.45 ? (0.45 - hitRate) * 60
    : hitRate > 0.72 ? (hitRate - 0.72) * 40
    : 0;

  return Math.max(0, hitRateScore + edgeScore + contextScore + payoutBonus - juicePenalty - rangePenalty);
}
