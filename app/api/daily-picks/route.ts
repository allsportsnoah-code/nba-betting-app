import { NextRequest, NextResponse } from "next/server";
import { captureNbaHistorySnapshot } from "@/lib/nbaHistorySnapshot";
import { getCachedData } from "@/lib/cache";
import { setNbaTeamAuditSnapshot, type NbaTeamAuditRow } from "@/lib/futureAudit";
import type { NbaInjurySyncData } from "@/lib/nbaInjuries";
import { getResolvedNbaTeamOddsCache } from "@/lib/nbaOddsCache";
import {
  buildNbaLearningProfile,
  getNbaBestValueLearningAdjustment,
  getNbaTopPickLearningAdjustment,
} from "@/lib/nbaLearning";
import { getRequestOrigin } from "@/lib/requestOrigin";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  evaluateTeamGames,
  getNbaTeamBestValueScore,
  getNbaTeamTopPickScore,
  type NbaTeamMarketType,
} from "@/lib/teamModel";

type NbaTeamCandidate = {
  key: string;
  marketType: NbaTeamMarketType;
  game: any;
  side: string;
  lineTaken: number | null;
  oddsTaken: number;
  projectedLine: number | null;
  marketLine: number | null;
  edge: number;
  edgeLabel: string;
  confidenceScore: number;
  projectedHomeScore: number | null;
  projectedAwayScore: number | null;
  topPickScore: number;
  bestValueScore: number;
  contextRiskScore: number;
  contextRiskNotes: string[];
};

function gameLabel(game: any) {
  return `${game.away_team} @ ${game.home_team}`;
}

function candidateKey(game: any, marketType: NbaTeamMarketType) {
  return `${gameLabel(game)}::${marketType}`;
}

function savedRowKey(row: { game_label?: string | null; market_type?: string | null }) {
  return `${row.game_label ?? ""}::${row.market_type ?? ""}`;
}

function isValueSignal(signal: string | null | undefined) {
  return typeof signal === "string" && signal.toLowerCase().includes("value");
}

function appendContextNotes(label: string, notes: string[] | null | undefined) {
  const cleanNotes = (notes ?? []).filter(Boolean);
  if (cleanNotes.length === 0) return label;
  return `${label} | Watch: ${cleanNotes.join(", ")}`;
}

function applyContextRiskPenalty(score: number, contextRiskScore: number | null | undefined, weight: number) {
  return Number((score - (contextRiskScore ?? 0) * weight).toFixed(1));
}

function getProjectedMoneylineSideMargin(gameEval: any) {
  if (
    gameEval.projectedHomeScore === null ||
    gameEval.projectedHomeScore === undefined ||
    gameEval.projectedAwayScore === null ||
    gameEval.projectedAwayScore === undefined ||
    gameEval.moneylineSide === "Pass"
  ) {
    return null;
  }

  const projectedMargin = Number(gameEval.projectedHomeScore) - Number(gameEval.projectedAwayScore);
  const isHomeSide = gameEval.moneylineSide.startsWith(gameEval.game.home_team);
  return isHomeSide ? projectedMargin : projectedMargin * -1;
}

function sortTopCandidates(candidates: NbaTeamCandidate[], learningProfile?: Awaited<ReturnType<typeof buildNbaLearningProfile>> | null) {
  return [...candidates].sort(
    (a, b) =>
      (b.topPickScore + getNbaTopPickLearningAdjustment(b.marketType, learningProfile)) -
        (a.topPickScore + getNbaTopPickLearningAdjustment(a.marketType, learningProfile)) ||
      b.confidenceScore - a.confidenceScore ||
      Math.abs(b.edge) - Math.abs(a.edge) ||
      b.bestValueScore - a.bestValueScore
  );
}

function sortBestValueCandidates(candidates: NbaTeamCandidate[], learningProfile?: Awaited<ReturnType<typeof buildNbaLearningProfile>> | null) {
  return [...candidates].sort(
    (a, b) =>
      (b.bestValueScore + getNbaBestValueLearningAdjustment(b.marketType, learningProfile)) -
        (a.bestValueScore + getNbaBestValueLearningAdjustment(a.marketType, learningProfile)) ||
      b.confidenceScore - a.confidenceScore ||
      Math.abs(b.edge) - Math.abs(a.edge) ||
      b.topPickScore - a.topPickScore
  );
}

function buildSpreadCandidate(gameEval: any): NbaTeamCandidate | null {
  if (
    !isValueSignal(gameEval.signal) ||
    gameEval.officialOdds === null ||
    gameEval.spreadEdge === null ||
    gameEval.confidenceScore === null ||
    gameEval.officialSide === null
  ) {
    return null;
  }

  if (Math.abs(gameEval.spreadEdge) < 1.0) {
    return null;
  }

  const contextRiskScore = gameEval.contextRiskScore ?? 0;
  const contextRiskNotes = gameEval.contextRiskNotes ?? [];
  const topPickScore = getNbaTeamTopPickScore({
    marketType: "spread",
    edge: gameEval.spreadEdge,
    confidenceScore: gameEval.confidenceScore,
    oddsTaken: gameEval.officialOdds,
  });
  const bestValueScore = getNbaTeamBestValueScore({
    marketType: "spread",
    edge: gameEval.spreadEdge,
    confidenceScore: gameEval.confidenceScore,
    oddsTaken: gameEval.officialOdds,
  });

  return {
    key: candidateKey(gameEval.game, "spread"),
    marketType: "spread",
    game: gameEval.game,
    side: gameEval.officialSide,
    lineTaken: gameEval.officialLine ?? null,
    oddsTaken: gameEval.officialOdds,
    projectedLine: gameEval.projectedHomeSpread ?? null,
    marketLine: gameEval.marketHomeSpread ?? null,
    edge: gameEval.spreadEdge,
    edgeLabel: appendContextNotes(gameEval.signal, contextRiskNotes),
    confidenceScore: gameEval.confidenceScore,
    projectedHomeScore: gameEval.projectedHomeScore ?? null,
    projectedAwayScore: gameEval.projectedAwayScore ?? null,
    topPickScore: applyContextRiskPenalty(topPickScore, contextRiskScore, 0.45),
    bestValueScore: applyContextRiskPenalty(bestValueScore, contextRiskScore, 0.35),
    contextRiskScore,
    contextRiskNotes,
  };
}

function buildMoneylineCandidate(gameEval: any): NbaTeamCandidate | null {
  if (
    !isValueSignal(gameEval.moneylineSignal) ||
    gameEval.moneylineOdds === null ||
    gameEval.moneylineEdgePercent === null ||
    gameEval.moneylineConfidenceScore === null ||
    gameEval.moneylineSide === "Pass"
  ) {
    return null;
  }

  if (Math.abs(gameEval.moneylineEdgePercent) < 2.5) {
    return null;
  }

  const projectedSideMargin = getProjectedMoneylineSideMargin(gameEval);
  if (projectedSideMargin === null || projectedSideMargin <= 0) {
    return null;
  }

  const isHomeSide = gameEval.moneylineSide.startsWith(gameEval.game.home_team);
  const fairLine = isHomeSide ? gameEval.fairHomeMoneyline : gameEval.fairAwayMoneyline;

  const contextRiskScore = gameEval.contextRiskScore ?? 0;
  const contextRiskNotes = gameEval.contextRiskNotes ?? [];
  const topPickScore = getNbaTeamTopPickScore({
    marketType: "moneyline",
    edge: gameEval.moneylineEdgePercent,
    confidenceScore: gameEval.moneylineConfidenceScore,
    oddsTaken: gameEval.moneylineOdds,
  });
  const bestValueScore = getNbaTeamBestValueScore({
    marketType: "moneyline",
    edge: gameEval.moneylineEdgePercent,
    confidenceScore: gameEval.moneylineConfidenceScore,
    oddsTaken: gameEval.moneylineOdds,
  });

  return {
    key: candidateKey(gameEval.game, "moneyline"),
    marketType: "moneyline",
    game: gameEval.game,
    side: gameEval.moneylineSide,
    lineTaken: null,
    oddsTaken: gameEval.moneylineOdds,
    projectedLine: fairLine ?? null,
    marketLine: gameEval.moneylineOdds,
    edge: gameEval.moneylineEdgePercent,
    edgeLabel: appendContextNotes(gameEval.moneylineSignal, contextRiskNotes),
    confidenceScore: gameEval.moneylineConfidenceScore,
    projectedHomeScore: gameEval.projectedHomeScore ?? null,
    projectedAwayScore: gameEval.projectedAwayScore ?? null,
    topPickScore: applyContextRiskPenalty(topPickScore, contextRiskScore, 0.45),
    bestValueScore: applyContextRiskPenalty(bestValueScore, contextRiskScore, 0.35),
    contextRiskScore,
    contextRiskNotes,
  };
}

function buildTotalCandidate(gameEval: any): NbaTeamCandidate | null {
  if (
    !isValueSignal(gameEval.totalSignal) ||
    gameEval.totalOdds === null ||
    gameEval.totalEdge === null ||
    gameEval.totalConfidenceScore === null ||
    gameEval.totalSide === "Pass" ||
    gameEval.marketTotal === null
  ) {
    return null;
  }

  if (Math.abs(gameEval.totalEdge) < 2.0) {
    return null;
  }

  const contextRiskScore = gameEval.contextRiskScore ?? 0;
  const contextRiskNotes = gameEval.contextRiskNotes ?? [];
  const topPickScore = getNbaTeamTopPickScore({
    marketType: "total",
    edge: gameEval.totalEdge,
    confidenceScore: gameEval.totalConfidenceScore,
    oddsTaken: gameEval.totalOdds,
  });
  const bestValueScore = getNbaTeamBestValueScore({
    marketType: "total",
    edge: gameEval.totalEdge,
    confidenceScore: gameEval.totalConfidenceScore,
    oddsTaken: gameEval.totalOdds,
  });

  return {
    key: candidateKey(gameEval.game, "total"),
    marketType: "total",
    game: gameEval.game,
    side: gameEval.totalSide,
    lineTaken: gameEval.marketTotal,
    oddsTaken: gameEval.totalOdds,
    projectedLine: gameEval.projectedTotal ?? null,
    marketLine: gameEval.marketTotal,
    edge: gameEval.totalEdge,
    edgeLabel: appendContextNotes(gameEval.totalSignal, [
      ...contextRiskNotes,
      gameEval.regulationModelNote,
    ]),
    confidenceScore: gameEval.totalConfidenceScore,
    projectedHomeScore: gameEval.projectedHomeScore ?? null,
    projectedAwayScore: gameEval.projectedAwayScore ?? null,
    topPickScore: applyContextRiskPenalty(topPickScore, contextRiskScore, 0.45),
    bestValueScore: applyContextRiskPenalty(bestValueScore, contextRiskScore, 0.35),
    contextRiskScore,
    contextRiskNotes,
  };
}

function buildCandidatePool(evaluatedGames: any[], now: Date, lockedKeys: Set<string>) {
  const candidates = evaluatedGames.flatMap((gameEval) => {
    const start = new Date(gameEval.game.commence_time);
    if (Number.isNaN(start.getTime()) || start <= now) {
      return [];
    }

    return [
      buildSpreadCandidate(gameEval),
      buildMoneylineCandidate(gameEval),
      buildTotalCandidate(gameEval),
    ].filter((candidate): candidate is NbaTeamCandidate => candidate !== null);
  });

  return candidates.filter((candidate) => !lockedKeys.has(candidate.key));
}

function buildNbaTeamAuditRows(params: {
  evaluatedGames: any[];
  selectionByMarket: Map<string, { side: string; bucket: "top" | "value"; rank: number | null }>;
}) {
  const rows: NbaTeamAuditRow[] = [];

  for (const gameEval of params.evaluatedGames) {
    const label = gameLabel(gameEval.game);

    if (gameEval.marketHomeMoneyline !== null && gameEval.marketHomeMoneyline !== undefined) {
      const selected = params.selectionByMarket.get(`${label}::moneyline`);
      rows.push({
        gameId: gameEval.game.id,
        gameLabel: label,
        homeTeam: gameEval.game.home_team,
        awayTeam: gameEval.game.away_team,
        commenceTime: gameEval.game.commence_time ?? null,
        marketType: "moneyline",
        side: `${gameEval.game.home_team} ML`,
        lineTaken: null,
        oddsTaken: gameEval.marketHomeMoneyline,
        projectedHomeSpread: gameEval.projectedHomeSpread ?? null,
        projectedHomeMargin: gameEval.projectedHomeMargin ?? null,
        projectedTotal: gameEval.projectedTotal ?? null,
        projectedHomeScore: gameEval.projectedHomeScore ?? null,
        projectedAwayScore: gameEval.projectedAwayScore ?? null,
        fairHomeMoneyline: gameEval.fairHomeMoneyline ?? null,
        fairAwayMoneyline: gameEval.fairAwayMoneyline ?? null,
        signal: gameEval.moneylineSignal ?? null,
        edge: gameEval.moneylineEdgePercent ?? null,
        confidenceScore: gameEval.moneylineConfidenceScore ?? null,
        topPickScore: null,
        bestValueScore: null,
        selectedByCurrentModel: selected?.side === `${gameEval.game.home_team} ML`,
        currentTopEligible: selected?.side === `${gameEval.game.home_team} ML` && selected.bucket === "top",
        currentBestValueEligible: selected?.side === `${gameEval.game.home_team} ML` && selected.bucket === "value",
        currentSelectedBucket: selected?.side === `${gameEval.game.home_team} ML` ? selected.bucket : null,
        currentSelectedRank: selected?.side === `${gameEval.game.home_team} ML` ? selected.rank : null,
        contextRiskScore: gameEval.contextRiskScore ?? 0,
        contextRiskNotes: gameEval.contextRiskNotes ?? [],
      });
    }

    if (gameEval.marketAwayMoneyline !== null && gameEval.marketAwayMoneyline !== undefined) {
      const selected = params.selectionByMarket.get(`${label}::moneyline`);
      rows.push({
        gameId: gameEval.game.id,
        gameLabel: label,
        homeTeam: gameEval.game.home_team,
        awayTeam: gameEval.game.away_team,
        commenceTime: gameEval.game.commence_time ?? null,
        marketType: "moneyline",
        side: `${gameEval.game.away_team} ML`,
        lineTaken: null,
        oddsTaken: gameEval.marketAwayMoneyline,
        projectedHomeSpread: gameEval.projectedHomeSpread ?? null,
        projectedHomeMargin: gameEval.projectedHomeMargin ?? null,
        projectedTotal: gameEval.projectedTotal ?? null,
        projectedHomeScore: gameEval.projectedHomeScore ?? null,
        projectedAwayScore: gameEval.projectedAwayScore ?? null,
        fairHomeMoneyline: gameEval.fairHomeMoneyline ?? null,
        fairAwayMoneyline: gameEval.fairAwayMoneyline ?? null,
        signal: gameEval.moneylineSignal ?? null,
        edge:
          gameEval.moneylineEdgePercent !== null && gameEval.moneylineEdgePercent !== undefined
            ? Number((-gameEval.moneylineEdgePercent).toFixed(1))
            : null,
        confidenceScore: gameEval.moneylineConfidenceScore ?? null,
        topPickScore: null,
        bestValueScore: null,
        selectedByCurrentModel: selected?.side === `${gameEval.game.away_team} ML`,
        currentTopEligible: selected?.side === `${gameEval.game.away_team} ML` && selected.bucket === "top",
        currentBestValueEligible: selected?.side === `${gameEval.game.away_team} ML` && selected.bucket === "value",
        currentSelectedBucket: selected?.side === `${gameEval.game.away_team} ML` ? selected.bucket : null,
        currentSelectedRank: selected?.side === `${gameEval.game.away_team} ML` ? selected.rank : null,
        contextRiskScore: gameEval.contextRiskScore ?? 0,
        contextRiskNotes: gameEval.contextRiskNotes ?? [],
      });
    }

    if (gameEval.marketHomeSpread !== null && gameEval.marketHomeSpread !== undefined) {
      const selected = params.selectionByMarket.get(`${label}::spread`);
      rows.push({
        gameId: gameEval.game.id,
        gameLabel: label,
        homeTeam: gameEval.game.home_team,
        awayTeam: gameEval.game.away_team,
        commenceTime: gameEval.game.commence_time ?? null,
        marketType: "spread",
        side: `${gameEval.game.home_team} ${gameEval.marketHomeSpread}`,
        lineTaken: gameEval.marketHomeSpread,
        oddsTaken: gameEval.homeSpreadPrice ?? null,
        projectedHomeSpread: gameEval.projectedHomeSpread ?? null,
        projectedHomeMargin: gameEval.projectedHomeMargin ?? null,
        projectedTotal: gameEval.projectedTotal ?? null,
        projectedHomeScore: gameEval.projectedHomeScore ?? null,
        projectedAwayScore: gameEval.projectedAwayScore ?? null,
        fairHomeMoneyline: gameEval.fairHomeMoneyline ?? null,
        fairAwayMoneyline: gameEval.fairAwayMoneyline ?? null,
        signal: gameEval.signal ?? null,
        edge: gameEval.spreadEdge ?? null,
        confidenceScore: gameEval.confidenceScore ?? null,
        topPickScore: gameEval.topPickScore ?? null,
        bestValueScore: null,
        selectedByCurrentModel: selected?.side === `${gameEval.game.home_team} ${gameEval.marketHomeSpread}`,
        currentTopEligible:
          selected?.side === `${gameEval.game.home_team} ${gameEval.marketHomeSpread}` && selected.bucket === "top",
        currentBestValueEligible:
          selected?.side === `${gameEval.game.home_team} ${gameEval.marketHomeSpread}` && selected.bucket === "value",
        currentSelectedBucket:
          selected?.side === `${gameEval.game.home_team} ${gameEval.marketHomeSpread}` ? selected.bucket : null,
        currentSelectedRank:
          selected?.side === `${gameEval.game.home_team} ${gameEval.marketHomeSpread}` ? selected.rank : null,
        contextRiskScore: gameEval.contextRiskScore ?? 0,
        contextRiskNotes: gameEval.contextRiskNotes ?? [],
      });
    }

    if (gameEval.awaySpreadPoint !== null && gameEval.awaySpreadPoint !== undefined) {
      const selected = params.selectionByMarket.get(`${label}::spread`);
      rows.push({
        gameId: gameEval.game.id,
        gameLabel: label,
        homeTeam: gameEval.game.home_team,
        awayTeam: gameEval.game.away_team,
        commenceTime: gameEval.game.commence_time ?? null,
        marketType: "spread",
        side: `${gameEval.game.away_team} ${gameEval.awaySpreadPoint}`,
        lineTaken: gameEval.awaySpreadPoint,
        oddsTaken: gameEval.awaySpreadPrice ?? null,
        projectedHomeSpread: gameEval.projectedHomeSpread ?? null,
        projectedHomeMargin: gameEval.projectedHomeMargin ?? null,
        projectedTotal: gameEval.projectedTotal ?? null,
        projectedHomeScore: gameEval.projectedHomeScore ?? null,
        projectedAwayScore: gameEval.projectedAwayScore ?? null,
        fairHomeMoneyline: gameEval.fairHomeMoneyline ?? null,
        fairAwayMoneyline: gameEval.fairAwayMoneyline ?? null,
        signal: gameEval.signal ?? null,
        edge:
          gameEval.spreadEdge !== null && gameEval.spreadEdge !== undefined
            ? Number((-gameEval.spreadEdge).toFixed(1))
            : null,
        confidenceScore: gameEval.confidenceScore ?? null,
        topPickScore: gameEval.topPickScore ?? null,
        bestValueScore: null,
        selectedByCurrentModel: selected?.side === `${gameEval.game.away_team} ${gameEval.awaySpreadPoint}`,
        currentTopEligible:
          selected?.side === `${gameEval.game.away_team} ${gameEval.awaySpreadPoint}` && selected.bucket === "top",
        currentBestValueEligible:
          selected?.side === `${gameEval.game.away_team} ${gameEval.awaySpreadPoint}` && selected.bucket === "value",
        currentSelectedBucket:
          selected?.side === `${gameEval.game.away_team} ${gameEval.awaySpreadPoint}` ? selected.bucket : null,
        currentSelectedRank:
          selected?.side === `${gameEval.game.away_team} ${gameEval.awaySpreadPoint}` ? selected.rank : null,
        contextRiskScore: gameEval.contextRiskScore ?? 0,
        contextRiskNotes: gameEval.contextRiskNotes ?? [],
      });
    }

    if (gameEval.marketTotal !== null && gameEval.marketTotal !== undefined) {
      const selected = params.selectionByMarket.get(`${label}::total`);
      rows.push({
        gameId: gameEval.game.id,
        gameLabel: label,
        homeTeam: gameEval.game.home_team,
        awayTeam: gameEval.game.away_team,
        commenceTime: gameEval.game.commence_time ?? null,
        marketType: "total",
        side: `Over ${gameEval.marketTotal}`,
        lineTaken: gameEval.marketTotal,
        oddsTaken: gameEval.overPrice ?? null,
        projectedHomeSpread: gameEval.projectedHomeSpread ?? null,
        projectedHomeMargin: gameEval.projectedHomeMargin ?? null,
        projectedTotal: gameEval.projectedTotal ?? null,
        projectedHomeScore: gameEval.projectedHomeScore ?? null,
        projectedAwayScore: gameEval.projectedAwayScore ?? null,
        fairHomeMoneyline: gameEval.fairHomeMoneyline ?? null,
        fairAwayMoneyline: gameEval.fairAwayMoneyline ?? null,
        signal: gameEval.totalSignal ?? null,
        edge: gameEval.totalEdge ?? null,
        confidenceScore: gameEval.totalConfidenceScore ?? null,
        topPickScore: null,
        bestValueScore: null,
        selectedByCurrentModel: selected?.side === `Over ${gameEval.marketTotal}`,
        currentTopEligible: selected?.side === `Over ${gameEval.marketTotal}` && selected.bucket === "top",
        currentBestValueEligible: selected?.side === `Over ${gameEval.marketTotal}` && selected.bucket === "value",
        currentSelectedBucket: selected?.side === `Over ${gameEval.marketTotal}` ? selected.bucket : null,
        currentSelectedRank: selected?.side === `Over ${gameEval.marketTotal}` ? selected.rank : null,
        contextRiskScore: gameEval.contextRiskScore ?? 0,
        contextRiskNotes: [
          ...(gameEval.contextRiskNotes ?? []),
          gameEval.regulationModelNote,
        ].filter(Boolean),
      });
      rows.push({
        gameId: gameEval.game.id,
        gameLabel: label,
        homeTeam: gameEval.game.home_team,
        awayTeam: gameEval.game.away_team,
        commenceTime: gameEval.game.commence_time ?? null,
        marketType: "total",
        side: `Under ${gameEval.marketTotal}`,
        lineTaken: gameEval.marketTotal,
        oddsTaken: gameEval.underPrice ?? null,
        projectedHomeSpread: gameEval.projectedHomeSpread ?? null,
        projectedHomeMargin: gameEval.projectedHomeMargin ?? null,
        projectedTotal: gameEval.projectedTotal ?? null,
        projectedHomeScore: gameEval.projectedHomeScore ?? null,
        projectedAwayScore: gameEval.projectedAwayScore ?? null,
        fairHomeMoneyline: gameEval.fairHomeMoneyline ?? null,
        fairAwayMoneyline: gameEval.fairAwayMoneyline ?? null,
        signal: gameEval.totalSignal ?? null,
        edge:
          gameEval.totalEdge !== null && gameEval.totalEdge !== undefined
            ? Number((-gameEval.totalEdge).toFixed(1))
            : null,
        confidenceScore: gameEval.totalConfidenceScore ?? null,
        topPickScore: null,
        bestValueScore: null,
        selectedByCurrentModel: selected?.side === `Under ${gameEval.marketTotal}`,
        currentTopEligible: selected?.side === `Under ${gameEval.marketTotal}` && selected.bucket === "top",
        currentBestValueEligible: selected?.side === `Under ${gameEval.marketTotal}` && selected.bucket === "value",
        currentSelectedBucket: selected?.side === `Under ${gameEval.marketTotal}` ? selected.bucket : null,
        currentSelectedRank: selected?.side === `Under ${gameEval.marketTotal}` ? selected.rank : null,
        contextRiskScore: gameEval.contextRiskScore ?? 0,
        contextRiskNotes: [
          ...(gameEval.contextRiskNotes ?? []),
          gameEval.regulationModelNote,
        ].filter(Boolean),
      });
    }
  }

  return rows;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const overrideStarted = req.nextUrl.searchParams.get("overrideStarted") === "1";
    const origin = getRequestOrigin(req);
    const now = new Date();

    const cachedOdds = await getResolvedNbaTeamOddsCache(day, now);
    let odds: any = cachedOdds.active?.businessDate
      ? {
          ok: true,
          businessDate: cachedOdds.active.businessDate,
          data: cachedOdds.active.data ?? [],
        }
      : null;

    if (!odds) {
      const oddsRes = await fetch(`${origin}/api/odds?day=${day}`, {
        cache: "no-store",
      });
      odds = await oddsRes.json();
    }

    if (!odds.ok) {
      return NextResponse.json(
        { ok: false, error: odds.error || "Failed to load odds for daily picks" },
        { status: 500 }
      );
    }

    const businessDate = odds.businessDate;
    const learningProfile = await buildNbaLearningProfile();
    const injurySyncData =
      (((await getCachedData(`nba_injury_report_${businessDate}`))?.data ?? null) as NbaInjurySyncData | null);
    const evaluatedGames = evaluateTeamGames(odds.data ?? [], {
      learningProfile,
      injuryRows: injurySyncData?.rows ?? null,
    });

    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", businessDate)
      .eq("sport", "NBA")
      .eq("market_scope", "team");

    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
    }

    const rows = existingRows ?? [];
    const existingByKey = new Map(rows.map((row: any) => [savedRowKey(row), row]));

    const lockedRows: any[] = [];
    const unlockedRows: any[] = [];

    for (const row of rows) {
      const gameStart = row.game_start_time ? new Date(row.game_start_time) : null;
      const shouldLock = !overrideStarted && gameStart && gameStart <= now;

      if (shouldLock && !row.locked_at) {
        await supabase
          .from("picks")
          .update({
            locked_at: now.toISOString(),
          })
          .eq("id", row.id);

        row.locked_at = now.toISOString();
      }

      if (!overrideStarted && (row.locked_at || shouldLock)) lockedRows.push(row);
      else unlockedRows.push(row);
    }

    const lockedKeys = overrideStarted ? new Set<string>() : new Set(lockedRows.map((row: any) => savedRowKey(row)));
    const lockedTopRows = lockedRows
      .filter((row: any) => row.is_top_pick)
      .sort((a: any, b: any) => (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99));
    const lockedBestValueRows = lockedRows.filter((row: any) => row.notes === "best_value");

    const allCandidates = buildCandidatePool(
      evaluatedGames,
      overrideStarted ? new Date(0) : now,
      lockedKeys
    );
    const rankedTopCandidates = sortTopCandidates(allCandidates, learningProfile);

    const topSlotsOpen = Math.max(0, 3 - lockedTopRows.length);
    const selectedTopCandidates = rankedTopCandidates.slice(0, topSlotsOpen);
    const selectedTopKeys = new Set(selectedTopCandidates.map((candidate) => candidate.key));

    const rankedBestValueCandidates = sortBestValueCandidates(
      allCandidates.filter((candidate) => !selectedTopKeys.has(candidate.key)),
      learningProfile
    );
    const bestValueSlotsOpen = Math.max(0, 3 - lockedBestValueRows.length);
    const selectedBestValueCandidates = rankedBestValueCandidates.slice(0, bestValueSlotsOpen);
    const selectedBestValueKeys = new Set(
      selectedBestValueCandidates.map((candidate) => candidate.key)
    );

    for (const row of unlockedRows) {
      const key = savedRowKey(row);
      if (!selectedTopKeys.has(key) && !selectedBestValueKeys.has(key)) {
        await supabase
          .from("picks")
          .update({
            is_top_pick: false,
            top_pick_rank: null,
            notes: null,
          })
          .eq("id", row.id);
      }
    }

    const finalTopItems: any[] = [...lockedTopRows];
    const finalBestValueItems: any[] = [...lockedBestValueRows];

    for (const candidate of selectedTopCandidates) {
      const existing = existingByKey.get(candidate.key);

      const payload = {
        pick_date: businessDate,
        sport: "NBA",
        market_scope: "team",
        market_type: candidate.marketType,
        game_label: gameLabel(candidate.game),
        home_team: candidate.game.home_team,
        away_team: candidate.game.away_team,
        player_name: null,
        sportsbook: "DraftKings",
        side: candidate.side,
        line_taken: candidate.lineTaken,
        odds_taken: candidate.oddsTaken,
        stake_units: 1,
        confidence_score: candidate.confidenceScore,
        projected_line: candidate.projectedLine,
        projected_home_score: candidate.projectedHomeScore,
        projected_away_score: candidate.projectedAwayScore,
        market_line: candidate.marketLine,
        edge: candidate.edge,
        edge_label: candidate.edgeLabel,
        is_top_pick: true,
        top_pick_rank: null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        notes: null,
        game_start_time: candidate.game.commence_time,
      };

      if (existing && !existing.locked_at) {
        const { data: updated } = await supabase
          .from("picks")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();

        if (updated) finalTopItems.push(updated);
      } else if (!existing) {
        const { data: inserted } = await supabase
          .from("picks")
          .insert(payload)
          .select()
          .single();

        if (inserted) finalTopItems.push(inserted);
      } else if (existing.locked_at) {
        finalTopItems.push(existing);
      }
    }

    for (const candidate of selectedBestValueCandidates) {
      const existing = existingByKey.get(candidate.key);

      const payload = {
        pick_date: businessDate,
        sport: "NBA",
        market_scope: "team",
        market_type: candidate.marketType,
        game_label: gameLabel(candidate.game),
        home_team: candidate.game.home_team,
        away_team: candidate.game.away_team,
        player_name: null,
        sportsbook: "DraftKings",
        side: candidate.side,
        line_taken: candidate.lineTaken,
        odds_taken: candidate.oddsTaken,
        stake_units: 1,
        confidence_score: candidate.confidenceScore,
        projected_line: candidate.projectedLine,
        projected_home_score: candidate.projectedHomeScore,
        projected_away_score: candidate.projectedAwayScore,
        market_line: candidate.marketLine,
        edge: candidate.edge,
        edge_label: candidate.edgeLabel,
        is_top_pick: false,
        top_pick_rank: null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        notes: "best_value",
        game_start_time: candidate.game.commence_time,
      };

      if (existing && !existing.locked_at) {
        const { data: updated } = await supabase
          .from("picks")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();

        if (updated) finalBestValueItems.push(updated);
      } else if (!existing) {
        const { data: inserted } = await supabase
          .from("picks")
          .insert(payload)
          .select()
          .single();

        if (inserted) finalBestValueItems.push(inserted);
      } else if (existing.locked_at) {
        finalBestValueItems.push(existing);
      }
    }

    const ranked = finalTopItems.slice(0, 3);

    for (let i = 0; i < ranked.length; i++) {
      const row = ranked[i];
      await supabase
        .from("picks")
        .update({ top_pick_rank: i + 1 })
        .eq("id", row.id);
      row.top_pick_rank = i + 1;
    }

    const selectionByMarket = new Map<string, { side: string; bucket: "top" | "value"; rank: number | null }>();
    ranked.forEach((row: any, index: number) => {
      selectionByMarket.set(savedRowKey(row), {
        side: row.side,
        bucket: "top",
        rank: index + 1,
      });
    });
    finalBestValueItems.slice(0, 3).forEach((row: any) => {
      selectionByMarket.set(savedRowKey(row), {
        side: row.side,
        bucket: "value",
        rank: null,
      });
    });
    await setNbaTeamAuditSnapshot(
      businessDate,
      buildNbaTeamAuditRows({
        evaluatedGames,
        selectionByMarket,
      })
    );

    await captureNbaHistorySnapshot(businessDate);

    return NextResponse.json({
      ok: true,
      businessDate,
      topPicks: ranked,
      bestValues: finalBestValueItems.slice(0, 3),
      data: ranked,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
