import { NextRequest, NextResponse } from "next/server";
import { setMlbTeamAuditSnapshot, type MlbTeamAuditRow } from "@/lib/futureAudit";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { captureMlbHistorySnapshot } from "@/lib/mlbHistorySnapshot";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { MlbContextMap } from "@/lib/mlbContext";
import type { MlbLearningProfile } from "@/lib/mlbLearning";
import { evaluateMlbGames, type EvaluatedMlbGame, type MlbOddsGame } from "@/lib/mlbModel";
import { getResolvedMlbOddsCache } from "@/lib/mlbOddsCache";
import { mlbParkFactors, mlbTeamRatings } from "@/lib/mlbRatings";
import {
  buildMlbCandidates,
  candidateKey,
  getMlbTeamBestValueScore,
  isMlbCandidateBestValueEligible,
  isMlbCandidateTopPickEligible,
  labelForGame,
  savedMlbTeamBoardKey,
  selectMlbTeamBoardCandidates,
  toSavedMlbTeamCandidate,
  type MlbCandidate,
  type MlbTeamMarketType,
} from "@/lib/mlbPickRanking";
import { capturePublicFreePickHistory } from "@/lib/publicFreePickHistory";
import { requireSyncAccess } from "@/lib/ownerAuth";

type ExistingPickRow = {
  id: number;
  game_label: string;
  home_team?: string | null;
  away_team?: string | null;
  market_type: MlbTeamMarketType;
  side: string;
  line_taken?: number | null;
  odds_taken?: number | null;
  confidence_score?: number | null;
  projected_line?: number | null;
  market_line?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  projected_side_margin?: number | null;
  cover_buffer?: number | null;
  status?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  closing_line?: number | null;
  clv?: number | null;
  locked_at?: string | null;
  game_start_time?: string | null;
  top_pick_rank?: number | null;
  is_top_pick?: boolean | null;
  notes?: string | null;
};

type SyncedRow = {
  id: number;
  top_pick_rank?: number | null;
  locked_at?: string | null;
};

async function splitLockedRows(rows: ExistingPickRow[], now: Date, supabase: ReturnType<typeof getSupabaseServer>) {
  const lockedRows: ExistingPickRow[] = [];
  const unlockedRows: ExistingPickRow[] = [];

  for (const row of rows) {
    const gameStart = row.game_start_time ? new Date(row.game_start_time) : null;
    const shouldLock = Boolean(gameStart && gameStart <= now);

    if (shouldLock && !row.locked_at) {
      await supabase.from("picks").update({ locked_at: now.toISOString() }).eq("id", row.id);
      row.locked_at = now.toISOString();
    }

    if (row.locked_at || shouldLock) lockedRows.push(row);
    else unlockedRows.push(row);
  }

  return { lockedRows, unlockedRows };
}

function buildMlbTeamAuditRows(params: {
  evaluatedGames: EvaluatedMlbGame[];
  candidateBySelectionKey: Map<string, MlbCandidate>;
  learningProfile?: MlbLearningProfile | null;
  selectionByMarket: Map<string, { side: string; bucket: "top" | "value"; rank: number | null }>;
}) {
  const rows: MlbTeamAuditRow[] = [];

  const buildSelectionKey = (
    gameLabel: string,
    marketType: "moneyline" | "spread" | "total",
    side: string
  ) => `${gameLabel}::${marketType}::${side}`;

  for (const game of params.evaluatedGames) {
    const gameLabel = `${game.game.away_team} @ ${game.game.home_team}`;

    if (game.marketHomeMoneyline !== null && game.marketHomeMoneyline !== undefined) {
      const selected = params.selectionByMarket.get(`${gameLabel}::moneyline`);
      const candidate = params.candidateBySelectionKey.get(
        buildSelectionKey(gameLabel, "moneyline", game.game.home_team)
      );
      rows.push({
        gameId: game.game.id,
        gameLabel,
        homeTeam: game.game.home_team,
        awayTeam: game.game.away_team,
        commenceTime: game.game.commence_time,
        marketType: "moneyline",
        side: game.game.home_team,
        lineTaken: null,
        oddsTaken: game.marketHomeMoneyline,
        projectedHomeRuns: game.projectedHomeRuns ?? null,
        projectedAwayRuns: game.projectedAwayRuns ?? null,
        projectedTotal: game.projectedTotal ?? null,
        projectedMargin: game.projectedMargin ?? null,
        fairHomeMoneyline: game.fairHomeMoneyline ?? null,
        fairAwayMoneyline: game.fairAwayMoneyline ?? null,
        signal: game.moneylineSignal ?? null,
        edgeLabel: candidate?.edgeLabel ?? game.moneylineSignal ?? null,
        edge: game.moneylineEdgePercent ?? null,
        confidenceScore: candidate?.confidenceScore ?? null,
        topPickScore: candidate?.topPickScore ?? null,
        bestValueScore: candidate ? getMlbTeamBestValueScore(candidate, params.learningProfile) : null,
        betRecommendation: candidate?.betRecommendation ?? null,
        reasonLabels: candidate?.reasonLabels ?? [],
        riskFlags: candidate?.riskFlags ?? [],
        selectedByCurrentModel: Boolean(candidate),
        currentTopEligible: candidate ? isMlbCandidateTopPickEligible(candidate) : false,
        currentBestValueEligible: candidate ? isMlbCandidateBestValueEligible(candidate) : false,
        currentSelectedBucket: selected?.side === game.game.home_team ? selected.bucket : null,
        currentSelectedRank: selected?.side === game.game.home_team ? selected.rank : null,
        homeAdjustmentNote: game.homeAdjustmentNote ?? null,
        awayAdjustmentNote: game.awayAdjustmentNote ?? null,
        homeStarter: game.context?.homeStarter?.name ?? null,
        awayStarter: game.context?.awayStarter?.name ?? null,
        weatherNote: game.weatherNote ?? null,
        contextRiskScore: game.contextRiskScore ?? 0,
        contextRiskNotes: game.contextRiskNotes ?? [],
      });
    }

    if (game.marketAwayMoneyline !== null && game.marketAwayMoneyline !== undefined) {
      const selected = params.selectionByMarket.get(`${gameLabel}::moneyline`);
      const candidate = params.candidateBySelectionKey.get(
        buildSelectionKey(gameLabel, "moneyline", game.game.away_team)
      );
      rows.push({
        gameId: game.game.id,
        gameLabel,
        homeTeam: game.game.home_team,
        awayTeam: game.game.away_team,
        commenceTime: game.game.commence_time,
        marketType: "moneyline",
        side: game.game.away_team,
        lineTaken: null,
        oddsTaken: game.marketAwayMoneyline,
        projectedHomeRuns: game.projectedHomeRuns ?? null,
        projectedAwayRuns: game.projectedAwayRuns ?? null,
        projectedTotal: game.projectedTotal ?? null,
        projectedMargin: game.projectedMargin ?? null,
        fairHomeMoneyline: game.fairHomeMoneyline ?? null,
        fairAwayMoneyline: game.fairAwayMoneyline ?? null,
        signal: game.moneylineSignal ?? null,
        edgeLabel: candidate?.edgeLabel ?? game.moneylineSignal ?? null,
        edge: game.moneylineEdgePercent !== null && game.moneylineEdgePercent !== undefined ? Number((-game.moneylineEdgePercent).toFixed(1)) : null,
        confidenceScore: candidate?.confidenceScore ?? null,
        topPickScore: candidate?.topPickScore ?? null,
        bestValueScore: candidate ? getMlbTeamBestValueScore(candidate, params.learningProfile) : null,
        betRecommendation: candidate?.betRecommendation ?? null,
        reasonLabels: candidate?.reasonLabels ?? [],
        riskFlags: candidate?.riskFlags ?? [],
        selectedByCurrentModel: Boolean(candidate),
        currentTopEligible: candidate ? isMlbCandidateTopPickEligible(candidate) : false,
        currentBestValueEligible: candidate ? isMlbCandidateBestValueEligible(candidate) : false,
        currentSelectedBucket: selected?.side === game.game.away_team ? selected.bucket : null,
        currentSelectedRank: selected?.side === game.game.away_team ? selected.rank : null,
        homeAdjustmentNote: game.homeAdjustmentNote ?? null,
        awayAdjustmentNote: game.awayAdjustmentNote ?? null,
        homeStarter: game.context?.homeStarter?.name ?? null,
        awayStarter: game.context?.awayStarter?.name ?? null,
        weatherNote: game.weatherNote ?? null,
        contextRiskScore: game.contextRiskScore ?? 0,
        contextRiskNotes: game.contextRiskNotes ?? [],
      });
    }

    if (game.marketHomeRunLine !== null && game.marketHomeRunLine !== undefined) {
      const selected = params.selectionByMarket.get(`${gameLabel}::spread`);
      const side = `${game.game.home_team} ${game.marketHomeRunLine}`;
      const candidate = params.candidateBySelectionKey.get(
        buildSelectionKey(gameLabel, "spread", side)
      );
      rows.push({
        gameId: game.game.id,
        gameLabel,
        homeTeam: game.game.home_team,
        awayTeam: game.game.away_team,
        commenceTime: game.game.commence_time,
        marketType: "spread",
        side: `${game.game.home_team} ${game.marketHomeRunLine}`,
        lineTaken: game.marketHomeRunLine,
        oddsTaken: game.homeRunLinePrice ?? null,
        projectedHomeRuns: game.projectedHomeRuns ?? null,
        projectedAwayRuns: game.projectedAwayRuns ?? null,
        projectedTotal: game.projectedTotal ?? null,
        projectedMargin: game.projectedMargin ?? null,
        fairHomeMoneyline: game.fairHomeMoneyline ?? null,
        fairAwayMoneyline: game.fairAwayMoneyline ?? null,
        signal: game.runLineSignal ?? null,
        edgeLabel: candidate?.edgeLabel ?? game.runLineSignal ?? null,
        edge: game.runLineEdge ?? null,
        confidenceScore: candidate?.confidenceScore ?? null,
        topPickScore: candidate?.topPickScore ?? null,
        bestValueScore: candidate ? getMlbTeamBestValueScore(candidate, params.learningProfile) : null,
        betRecommendation: candidate?.betRecommendation ?? null,
        reasonLabels: candidate?.reasonLabels ?? [],
        riskFlags: candidate?.riskFlags ?? [],
        selectedByCurrentModel: Boolean(candidate),
        currentTopEligible: candidate ? isMlbCandidateTopPickEligible(candidate) : false,
        currentBestValueEligible: candidate ? isMlbCandidateBestValueEligible(candidate) : false,
        currentSelectedBucket: selected?.side === side ? selected.bucket : null,
        currentSelectedRank: selected?.side === side ? selected.rank : null,
        homeAdjustmentNote: game.homeAdjustmentNote ?? null,
        awayAdjustmentNote: game.awayAdjustmentNote ?? null,
        homeStarter: game.context?.homeStarter?.name ?? null,
        awayStarter: game.context?.awayStarter?.name ?? null,
        weatherNote: game.weatherNote ?? null,
        contextRiskScore: game.contextRiskScore ?? 0,
        contextRiskNotes: game.contextRiskNotes ?? [],
      });
    }

    if (game.marketAwayRunLine !== null && game.marketAwayRunLine !== undefined) {
      const selected = params.selectionByMarket.get(`${gameLabel}::spread`);
      const awayEdge =
        game.projectedMargin !== null && game.projectedMargin !== undefined
          ? Number((game.marketAwayRunLine - game.projectedMargin * -1).toFixed(1))
          : null;
      const side = `${game.game.away_team} ${game.marketAwayRunLine}`;
      const candidate = params.candidateBySelectionKey.get(
        buildSelectionKey(gameLabel, "spread", side)
      );
      rows.push({
        gameId: game.game.id,
        gameLabel,
        homeTeam: game.game.home_team,
        awayTeam: game.game.away_team,
        commenceTime: game.game.commence_time,
        marketType: "spread",
        side: `${game.game.away_team} ${game.marketAwayRunLine}`,
        lineTaken: game.marketAwayRunLine,
        oddsTaken: game.awayRunLinePrice ?? null,
        projectedHomeRuns: game.projectedHomeRuns ?? null,
        projectedAwayRuns: game.projectedAwayRuns ?? null,
        projectedTotal: game.projectedTotal ?? null,
        projectedMargin: game.projectedMargin ?? null,
        fairHomeMoneyline: game.fairHomeMoneyline ?? null,
        fairAwayMoneyline: game.fairAwayMoneyline ?? null,
        signal: game.runLineSignal ?? null,
        edgeLabel: candidate?.edgeLabel ?? game.runLineSignal ?? null,
        edge: awayEdge,
        confidenceScore: candidate?.confidenceScore ?? null,
        topPickScore: candidate?.topPickScore ?? null,
        bestValueScore: candidate ? getMlbTeamBestValueScore(candidate, params.learningProfile) : null,
        betRecommendation: candidate?.betRecommendation ?? null,
        reasonLabels: candidate?.reasonLabels ?? [],
        riskFlags: candidate?.riskFlags ?? [],
        selectedByCurrentModel: Boolean(candidate),
        currentTopEligible: candidate ? isMlbCandidateTopPickEligible(candidate) : false,
        currentBestValueEligible: candidate ? isMlbCandidateBestValueEligible(candidate) : false,
        currentSelectedBucket: selected?.side === side ? selected.bucket : null,
        currentSelectedRank: selected?.side === side ? selected.rank : null,
        homeAdjustmentNote: game.homeAdjustmentNote ?? null,
        awayAdjustmentNote: game.awayAdjustmentNote ?? null,
        homeStarter: game.context?.homeStarter?.name ?? null,
        awayStarter: game.context?.awayStarter?.name ?? null,
        weatherNote: game.weatherNote ?? null,
        contextRiskScore: game.contextRiskScore ?? 0,
        contextRiskNotes: game.contextRiskNotes ?? [],
      });
    }

    if (game.marketTotal !== null && game.marketTotal !== undefined) {
      const selected = params.selectionByMarket.get(`${gameLabel}::total`);
      const overSide = `Over ${game.marketTotal}`;
      const overCandidate = params.candidateBySelectionKey.get(
        buildSelectionKey(gameLabel, "total", overSide)
      );
      rows.push({
        gameId: game.game.id,
        gameLabel,
        homeTeam: game.game.home_team,
        awayTeam: game.game.away_team,
        commenceTime: game.game.commence_time,
        marketType: "total",
        side: `Over ${game.marketTotal}`,
        lineTaken: game.marketTotal,
        oddsTaken: game.overPrice ?? null,
        projectedHomeRuns: game.projectedHomeRuns ?? null,
        projectedAwayRuns: game.projectedAwayRuns ?? null,
        projectedTotal: game.projectedTotal ?? null,
        projectedMargin: game.projectedMargin ?? null,
        fairHomeMoneyline: game.fairHomeMoneyline ?? null,
        fairAwayMoneyline: game.fairAwayMoneyline ?? null,
        signal: game.totalSignal ?? null,
        edgeLabel: overCandidate?.edgeLabel ?? game.totalSignal ?? null,
        edge: game.totalEdge ?? null,
        confidenceScore: overCandidate?.confidenceScore ?? null,
        topPickScore: overCandidate?.topPickScore ?? null,
        bestValueScore: overCandidate ? getMlbTeamBestValueScore(overCandidate, params.learningProfile) : null,
        betRecommendation: overCandidate?.betRecommendation ?? null,
        reasonLabels: overCandidate?.reasonLabels ?? [],
        riskFlags: overCandidate?.riskFlags ?? [],
        selectedByCurrentModel: Boolean(overCandidate),
        currentTopEligible: overCandidate ? isMlbCandidateTopPickEligible(overCandidate) : false,
        currentBestValueEligible: overCandidate ? isMlbCandidateBestValueEligible(overCandidate) : false,
        currentSelectedBucket: selected?.side === overSide ? selected.bucket : null,
        currentSelectedRank: selected?.side === overSide ? selected.rank : null,
        homeAdjustmentNote: game.homeAdjustmentNote ?? null,
        awayAdjustmentNote: game.awayAdjustmentNote ?? null,
        homeStarter: game.context?.homeStarter?.name ?? null,
        awayStarter: game.context?.awayStarter?.name ?? null,
        weatherNote: game.weatherNote ?? null,
        contextRiskScore: game.contextRiskScore ?? 0,
        contextRiskNotes: game.contextRiskNotes ?? [],
      });
      const underSide = `Under ${game.marketTotal}`;
      const underCandidate = params.candidateBySelectionKey.get(
        buildSelectionKey(gameLabel, "total", underSide)
      );
      rows.push({
        gameId: game.game.id,
        gameLabel,
        homeTeam: game.game.home_team,
        awayTeam: game.game.away_team,
        commenceTime: game.game.commence_time,
        marketType: "total",
        side: `Under ${game.marketTotal}`,
        lineTaken: game.marketTotal,
        oddsTaken: game.underPrice ?? null,
        projectedHomeRuns: game.projectedHomeRuns ?? null,
        projectedAwayRuns: game.projectedAwayRuns ?? null,
        projectedTotal: game.projectedTotal ?? null,
        projectedMargin: game.projectedMargin ?? null,
        fairHomeMoneyline: game.fairHomeMoneyline ?? null,
        fairAwayMoneyline: game.fairAwayMoneyline ?? null,
        signal: game.totalSignal ?? null,
        edgeLabel: underCandidate?.edgeLabel ?? game.totalSignal ?? null,
        edge: game.totalEdge !== null && game.totalEdge !== undefined ? Number((-game.totalEdge).toFixed(1)) : null,
        confidenceScore: underCandidate?.confidenceScore ?? null,
        topPickScore: underCandidate?.topPickScore ?? null,
        bestValueScore: underCandidate ? getMlbTeamBestValueScore(underCandidate, params.learningProfile) : null,
        betRecommendation: underCandidate?.betRecommendation ?? null,
        reasonLabels: underCandidate?.reasonLabels ?? [],
        riskFlags: underCandidate?.riskFlags ?? [],
        selectedByCurrentModel: Boolean(underCandidate),
        currentTopEligible: underCandidate ? isMlbCandidateTopPickEligible(underCandidate) : false,
        currentBestValueEligible: underCandidate ? isMlbCandidateBestValueEligible(underCandidate) : false,
        currentSelectedBucket: selected?.side === underSide ? selected.bucket : null,
        currentSelectedRank: selected?.side === underSide ? selected.rank : null,
        homeAdjustmentNote: game.homeAdjustmentNote ?? null,
        awayAdjustmentNote: game.awayAdjustmentNote ?? null,
        homeStarter: game.context?.homeStarter?.name ?? null,
        awayStarter: game.context?.awayStarter?.name ?? null,
        weatherNote: game.weatherNote ?? null,
        contextRiskScore: game.contextRiskScore ?? 0,
        contextRiskNotes: game.contextRiskNotes ?? [],
      });
    }
  }

  return rows;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const supabase = getSupabaseServer();
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const now = new Date();
    const resolvedOdds = await getResolvedMlbOddsCache(day, now);
    const cachedOdds = (resolvedOdds.active as {
      businessDate?: string;
      data?: MlbOddsGame[];
      context?: MlbContextMap;
      learning?: MlbLearningProfile;
    } | null) ?? null;

    if (!cachedOdds?.businessDate) {
      return apiJsonOrNativeRedirect(
        req,
        {
          ok: false,
          error: `No cached MLB odds found for betting day ${resolvedOdds.expectedBusinessDate}. Sync MLB odds first.`,
        },
        { status: 400 },
        { fallbackPath: "/mlb" }
      );
    }

    const evaluatedGames = evaluateMlbGames(
      cachedOdds.data ?? [],
      mlbTeamRatings,
      mlbParkFactors,
      cachedOdds.context,
      cachedOdds.learning
    );
    const businessDate = cachedOdds.businessDate;

    const { data: existingRows, error: existingError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", businessDate)
      .eq("sport", "MLB")
      .eq("market_scope", "team");

    if (existingError) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: existingError.message }, { status: 500 }, { fallbackPath: "/mlb" });
    }

    const rows = (existingRows ?? []) as ExistingPickRow[];
    const existingByKey = new Map(
      rows.map((row) => [`${row.game_label}::${row.market_type}`, row])
    );
    const { lockedRows, unlockedRows } = await splitLockedRows(rows, now, supabase);
    const preserveExistingBoard = false;

    const allCandidates = buildMlbCandidates(evaluatedGames, now, cachedOdds.learning);
    const lockedKeys = new Set(lockedRows.map((row) => `${row.game_label}::${row.market_type}`));
    const availableCandidates = allCandidates.filter(
      (candidate) => !lockedKeys.has(candidateKey(candidate))
    );
    const allCandidateKeys = new Set(availableCandidates.map(candidateKey));

    if (!preserveExistingBoard) {
      for (const row of unlockedRows) {
        const rowKey = `${row.game_label}::${row.market_type}`;
        if (!allCandidateKeys.has(rowKey)) {
          await supabase.from("picks").delete().eq("id", row.id);
        }
      }
    }

    const finalItems: SyncedRow[] = lockedRows.map((row) => ({
      id: row.id,
      top_pick_rank: row.top_pick_rank,
      locked_at: row.locked_at,
    }));

    for (const candidate of availableCandidates) {
      const label = labelForGame(candidate.game);
      const rowKey = `${label}::${candidate.marketType}`;
      const existing = existingByKey.get(rowKey);

      const payload = {
        pick_date: businessDate,
        sport: "MLB",
        market_scope: "team",
        market_type: candidate.marketType,
        game_label: label,
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
        is_top_pick: preserveExistingBoard ? Boolean(existing?.is_top_pick) : false,
        top_pick_rank: preserveExistingBoard ? existing?.top_pick_rank ?? null : null,
        notes: preserveExistingBoard ? existing?.notes ?? null : null,
        status: existing?.status ?? "pending",
        final_score: existing?.final_score ?? null,
        final_stat: existing?.final_stat ?? null,
        closing_line: existing?.closing_line ?? null,
        clv: existing?.clv ?? null,
        game_start_time: candidate.game.commence_time,
        external_event_id: candidate.game.id,
      };

      if (existing && !existing.locked_at) {
        const { data: updated } = await supabase
          .from("picks")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();

        if (updated) {
          finalItems.push({
            id: updated.id,
            top_pick_rank: updated.top_pick_rank,
            locked_at: updated.locked_at,
          });
        }
      } else if (!existing) {
        const { data: inserted } = await supabase
          .from("picks")
          .insert(payload)
          .select()
          .single();

        if (inserted) {
          finalItems.push({
            id: inserted.id,
            top_pick_rank: inserted.top_pick_rank,
            locked_at: inserted.locked_at,
          });
        }
      } else {
        finalItems.push({
          id: existing.id,
          top_pick_rank: existing.top_pick_rank,
          locked_at: existing.locked_at,
        });
      }
    }

    const { data: canonicalRows, error: canonicalRowsError } = await supabase
      .from("picks")
      .select("*")
      .eq("pick_date", businessDate)
      .eq("sport", "MLB")
      .eq("market_scope", "team");

    if (canonicalRowsError) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: canonicalRowsError.message }, { status: 500 }, { fallbackPath: "/mlb" });
    }

    if (!preserveExistingBoard) {
      const savedRows = (canonicalRows ?? []) as ExistingPickRow[];
      const savedCandidates = savedRows
        .map((row) => toSavedMlbTeamCandidate(row, cachedOdds.learning))
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
      const { topCandidates, bestValueCandidates } = selectMlbTeamBoardCandidates(
        savedCandidates,
        cachedOdds.learning
      );
      const topRanks = new Map(topCandidates.map((candidate, index) => [candidateKey(candidate), index + 1]));
      const bestValueKeys = new Set(bestValueCandidates.map(candidateKey));

      for (const row of savedRows) {
        const key = savedMlbTeamBoardKey(row);
        await supabase
          .from("picks")
          .update({
            is_top_pick: topRanks.has(key),
            top_pick_rank: topRanks.get(key) ?? null,
            notes: bestValueKeys.has(key) ? "best_value" : null,
          })
          .eq("id", row.id);
      }

      const selectionByMarket = new Map<string, { side: string; bucket: "top" | "value"; rank: number | null }>();
      topCandidates.forEach((candidate, index) => {
        selectionByMarket.set(candidateKey(candidate), {
          side: candidate.side,
          bucket: "top",
          rank: index + 1,
        });
      });
      bestValueCandidates.forEach((candidate) => {
        selectionByMarket.set(candidateKey(candidate), {
          side: candidate.side,
          bucket: "value",
          rank: null,
        });
      });
      const candidateBySelectionKey = new Map(
        allCandidates.map((candidate) => [
          `${candidateKey(candidate)}::${candidate.side}`,
          candidate,
        ])
      );
      await setMlbTeamAuditSnapshot(
        businessDate,
        buildMlbTeamAuditRows({
          evaluatedGames,
          candidateBySelectionKey,
          learningProfile: cachedOdds.learning,
          selectionByMarket,
        })
      );
    }

    const { data: rankedRows, error: rankedError } = await supabase
      .from("picks")
      .select("*")
        .eq("pick_date", businessDate)
        .eq("sport", "MLB")
        .eq("market_scope", "team")
      .eq("is_top_pick", true)
      .order("top_pick_rank", { ascending: true });

    if (rankedError) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: rankedError.message }, { status: 500 }, { fallbackPath: "/mlb" });
    }

    await captureMlbHistorySnapshot(businessDate);
    await capturePublicFreePickHistory(businessDate, { force: true });

    return apiJsonOrNativeRedirect(req, {
      ok: true,
      businessDate,
      message: `Rebuilt MLB team picks for ${businessDate}`,
      data: rankedRows ?? [],
      totalSaved: availableCandidates.length + lockedRows.length,
    }, undefined, { fallbackPath: "/mlb" });
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
      { fallbackPath: "/mlb" }
    );
  }
}
