import Link from "next/link";
import SyncButton from "@/app/dashboard/SyncButton";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { isOwnerLoggedIn } from "@/lib/ownerAuth";
import { getExpectedNflWeekStart } from "@/lib/nflOddsCache";
import { getAllNflWeeks, getNflWeekInfo } from "@/lib/nflWeek";
import {
  americanToDecimal,
  getMixedParlayReturn,
  NFL_LOTTO_LEG_COUNT,
  NFL_LOTTO_STAKE,
  NFL_LOTTO_PAYOUT_CAP,
  formatMoney,
  formatOdds,
} from "@/lib/nflLotto";

type LottoPick = {
  id: number;
  pick_date: string;
  game_label: string;
  market_type: string;
  market_scope: string;
  player_name?: string | null;
  side: string;
  line_taken?: number | null;
  odds_taken?: number | null;
  confidence_score?: number | null;
  is_top_pick?: boolean | null;
  notes?: string | null;
  status?: string | null;
  units_result?: number | null;
  game_start_time?: string | null;
};

type WeekSummary = {
  weekStart: string;
  label: string;
  weekNum: number;
  totalPicks: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  winRate: number | null;
  unitsResult: number;
};

function fmtOdds(o: number | null | undefined) {
  if (o == null) return "—";
  return o > 0 ? `+${o}` : String(o);
}

function lottoScoreFromNotes(notes: string | null | undefined): number {
  if (!notes) return 0;
  const m = notes.match(/lotto_score:([\d.]+)/);
  return m ? Number(m[1]) : 0;
}

function hitProbFromNotes(notes: string | null | undefined): number | null {
  if (!notes) return null;
  const m = notes.match(/hit:([\d.]+)/);
  return m ? Number(m[1]) : null;
}

function projectedFromNotes(notes: string | null | undefined): number | null {
  if (!notes) return null;
  const m = notes.match(/proj:([\d.-]+)/);
  return m ? Number(m[1]) : null;
}

function edgeFromNotes(notes: string | null | undefined): number | null {
  if (!notes) return null;
  const m = notes.match(/edge:([\d.-]+)/);
  return m ? Number(m[1]) : null;
}

function calcParlayOdds(picks: LottoPick[]): { decimal: number; american: number; payout: number } | null {
  if (!picks.length) return null;
  const valid = picks.filter((p) => p.odds_taken != null);
  if (!valid.length) return null;
  const decimal = valid.reduce((acc, p) => acc * americanToDecimal(p.odds_taken!), 1);
  const payout = getMixedParlayReturn({ odds: valid.map((p) => p.odds_taken!), stake: NFL_LOTTO_STAKE });
  const american = decimal >= 2 ? Math.round((decimal - 1) * 100) : -Math.round(100 / (decimal - 1));
  return { decimal, american, payout };
}

function statusBorder(status: string | null | undefined) {
  if (status === "win") return "border-emerald-300 bg-emerald-50";
  if (status === "loss") return "border-red-300 bg-red-50";
  if (status === "push") return "border-slate-300 bg-slate-100";
  return "border-slate-200 bg-white";
}

function PickTile({ pick, leg, isPrimary }: { pick: LottoPick; leg: number; isPrimary: boolean }) {
  const isProp = pick.market_scope === "props";
  const hitProb = hitProbFromNotes(pick.notes);
  const proj = projectedFromNotes(pick.notes);
  const edge = edgeFromNotes(pick.notes);

  // For props, extract just the stat part of side label (strip player name prefix)
  const statLabel = isProp && pick.player_name && pick.side.startsWith(pick.player_name)
    ? pick.side.slice(pick.player_name.length).trim()
    : pick.side;

  const hitPct = hitProb != null ? Math.round(hitProb * 100) : pick.confidence_score;
  const edgeLabel = edge != null
    ? edge > 0.04 ? "value" : edge < -0.04 ? "fade" : null
    : null;

  return (
    <div className={`flex items-start gap-2 rounded-2xl border px-3 py-3 shadow-sm ${statusBorder(pick.status)}`}>
      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isPrimary ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
        {leg}
      </div>
      <div className="min-w-0 flex-1">
        {/* Badge row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {categoryBadge(pick.market_scope, pick.market_type)}
          {edgeLabel === "value" && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">+EV</span>
          )}
          {pick.status === "win" && <span className="text-[11px] font-bold text-emerald-700">WIN ✓</span>}
          {pick.status === "loss" && <span className="text-[11px] font-bold text-red-700">LOSS</span>}
          {pick.status === "push" && <span className="text-[11px] font-bold text-slate-500">PUSH</span>}
        </div>

        {/* Player name (props only) */}
        {isProp && pick.player_name && (
          <p className="mt-1 text-[11px] font-bold text-slate-950 truncate leading-none">{pick.player_name}</p>
        )}

        {/* Stat / team pick label */}
        <p className={`${isProp && pick.player_name ? "mt-0.5" : "mt-0.5"} text-xs font-semibold text-slate-700 leading-snug line-clamp-2`}>
          {isProp && pick.player_name ? statLabel : pick.side}
        </p>

        {/* Odds + model hit rate + projected value */}
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-800">{fmtOdds(pick.odds_taken)}</span>
          {hitPct != null && (
            <span className={`font-semibold ${hitPct >= 62 ? "text-emerald-700" : hitPct >= 52 ? "text-slate-600" : "text-amber-600"}`}>
              {hitPct}% hit
            </span>
          )}
          {isProp && proj != null && proj !== 0.5 && (
            <span className="text-slate-400">proj {proj}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function categoryBadge(scope: string, marketType: string) {
  if (scope === "props") {
    return (
      <span className="rounded-full border border-purple-300 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-800">
        Prop
      </span>
    );
  }
  if (marketType === "spread") return (
    <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">ATS</span>
  );
  if (marketType === "moneyline") return (
    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">ML</span>
  );
  if (marketType === "home_team_total" || marketType === "away_team_total") return (
    <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-800">TT</span>
  );
  return (
    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Total</span>
  );
}

export default async function NflLottoPage() {
  const supabase = getSupabaseServer();
  const now = new Date();
  const weekStart = getExpectedNflWeekStart(now);
  const isOwner = await isOwnerLoggedIn();
  const seasonYear = now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const allWeeks = getAllNflWeeks(seasonYear);
  const currentWeekInfo = getNflWeekInfo(weekStart, now);

  // Fetch this week's lotto picks — strictly bounded to this week only
  const weekEnd = currentWeekInfo.weekEnd;
  const yearEnd = `${weekStart.slice(0, 4)}-12-31`;
  const week1Start = allWeeks[0]?.weekStart ?? weekStart;

  const { data: thisWeekTeamRows } = await supabase
    .from("picks")
    .select("id, pick_date, game_label, market_type, market_scope, player_name, side, line_taken, odds_taken, confidence_score, is_top_pick, notes, status, units_result, game_start_time")
    .eq("sport", "NFL")
    .eq("market_scope", "team")
    .gte("pick_date", weekStart)
    .lte("pick_date", weekEnd)
    .order("top_pick_rank", { ascending: true, nullsFirst: false })
    .order("confidence_score", { ascending: false });

  const { data: thisWeekPropRows } = await supabase
    .from("picks")
    .select("id, pick_date, game_label, market_type, market_scope, player_name, side, line_taken, odds_taken, confidence_score, is_top_pick, notes, status, units_result, game_start_time")
    .eq("sport", "NFL")
    .eq("market_scope", "props")
    .gte("pick_date", weekStart)
    .lte("pick_date", weekEnd)
    .order("confidence_score", { ascending: false })
    .limit(250);

  const teamPicks = (thisWeekTeamRows ?? []) as LottoPick[];
  const propPicks = (thisWeekPropRows ?? []) as LottoPick[];

  // All team picks: DB already ordered top_pick_rank asc, confidence desc (best first)
  const allTeam = teamPicks;
  // All props globally ranked by lotto_score (extracted from notes field)
  const allProps = [...propPicks].sort((a, b) => lottoScoreFromNotes(b.notes) - lottoScoreFromNotes(a.notes));

  // Build 40-pick lotto slate with balanced mix: ~2 props per 1 team pick
  // Primary 25: targets ~17 props + ~8 team | Alternates 15: remaining team then props
  const lottoPicks: LottoPick[] = [];
  const seen = new Set<number>();
  const push = (p: LottoPick) => { if (!seen.has(p.id)) { seen.add(p.id); lottoPicks.push(p); } };

  let ti = 0, pi = 0;
  // Primary 25: interleave 2 props then 1 team (repeating)
  while (lottoPicks.length < 25) {
    if (pi < allProps.length) push(allProps[pi++]);
    if (lottoPicks.length < 25 && pi < allProps.length) push(allProps[pi++]);
    if (lottoPicks.length < 25 && ti < allTeam.length) push(allTeam[ti++]);
    if (ti >= allTeam.length && pi >= allProps.length) break;
  }
  // Fill any remaining primary slots if one pool ran dry
  while (lottoPicks.length < 25 && ti < allTeam.length) push(allTeam[ti++]);
  while (lottoPicks.length < 25 && pi < allProps.length) push(allProps[pi++]);

  // Alternates 26-40: remaining team picks first, then more props
  while (lottoPicks.length < 40 && ti < allTeam.length) push(allTeam[ti++]);
  while (lottoPicks.length < 40 && pi < allProps.length) push(allProps[pi++]);

  // Parlay math for first 25 picks (the lotto ticket)
  const lottoLegs = lottoPicks.slice(0, 25);
  const parlayCalc = calcParlayOdds(lottoLegs);
  const cappedPayout = parlayCalc ? Math.min(parlayCalc.payout, NFL_LOTTO_PAYOUT_CAP) : null;

  // Near-miss analysis — computed when picks are graded
  const primaryLegs = lottoPicks.slice(0, 25);
  const alternateLegs = lottoPicks.slice(25, 40);

  const isWin = (p: LottoPick) => p.status === "win" || p.status === "push";
  const isLoss = (p: LottoPick) => p.status === "loss";
  const isGraded = (p: LottoPick) => p.status === "win" || p.status === "loss" || p.status === "push";

  const gradedPrimaryCount = primaryLegs.filter(isGraded).length;
  // Show analysis only when there are picks AND at least half of them are graded
  const showNearMiss = primaryLegs.length > 0 && gradedPrimaryCount >= Math.ceil(primaryLegs.length / 2);

  const primaryWins = primaryLegs.filter(isWin);
  const primaryLosses = primaryLegs.filter(isLoss);
  const primaryPending = primaryLegs.filter((p) => !isGraded(p));

  // Best possible parlay: the most wins achievable from all 40 picks
  const allWinners = lottoPicks.filter(isWin);
  const bestPossibleHits = Math.min(allWinners.length, 25);
  const perfectParlayWasPossible = allWinners.length >= 25;

  // Swap suggestions: losing primary legs paired with winning alternates
  const winningAlternates = alternateLegs.filter(isWin);
  const swapSuggestions = primaryLosses.map((lost, i) => ({
    drop: lost,
    saved: i < winningAlternates.length ? winningAlternates[i] : null,
  }));

  // Count: with best possible swaps, how many legs would have hit?
  const swappableCount = Math.min(primaryLosses.length, winningAlternates.length);
  const bestSwappedHits = primaryWins.length + swappableCount;

  // Week-by-week tracker: fetch all NFL picks across the season
  const { data: allSeasonRows } = await supabase
    .from("picks")
    .select("id, pick_date, market_scope, status, units_result")
    .eq("sport", "NFL")
    .gte("pick_date", week1Start)
    .lte("pick_date", yearEnd);

  const allPicks = (allSeasonRows ?? []) as Pick<LottoPick, "id" | "pick_date" | "market_scope" | "status" | "units_result">[];

  const weekSummaries: WeekSummary[] = allWeeks.slice(0, 18).map((week) => {
    const weekPicks = allPicks.filter(
      (p) => p.pick_date >= week.weekStart && p.pick_date <= week.weekEnd
    );
    const wins = weekPicks.filter((p) => p.status === "win").length;
    const losses = weekPicks.filter((p) => p.status === "loss").length;
    const pushes = weekPicks.filter((p) => p.status === "push").length;
    const pending = weekPicks.filter((p) => !p.status || p.status === "pending").length;
    const graded = wins + losses + pushes;
    const winRate = graded > 0 ? Number(((wins / graded) * 100).toFixed(0)) : null;
    const unitsResult = weekPicks.reduce((sum, p) => sum + (p.units_result ?? 0), 0);
    return {
      weekStart: week.weekStart,
      label: week.label,
      weekNum: week.weekNum,
      totalPicks: weekPicks.length,
      wins,
      losses,
      pushes,
      pending,
      winRate,
      unitsResult: Number(unitsResult.toFixed(2)),
    };
  });

  const hasLottoPicks = lottoPicks.length > 0;
  const hasWeekData = weekSummaries.some((w) => w.totalPicks > 0);

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">

      {/* Header */}
      <section className="app-card mb-8 rounded-[2rem] p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="app-eyebrow">NFL Lotto — {currentWeekInfo.label}</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
              Million Ticket Builder
            </h1>
            <p className="mt-3 text-base text-slate-600">
              {lottoPicks.length} picks for your 25-leg $1M parlay — player props + team bets mixed for max hit rate.
              Sync both buttons to fill all 40 slots. Alternates let you swap any leg you don&apos;t like.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/nfl" className="app-button app-button-secondary inline-flex items-center justify-center">
                NFL board
              </Link>
            </div>
          </div>

          {isOwner && (
            <div className="flex flex-col gap-3 min-w-[18rem]">
              <SyncButton endpoint="/api/sync-nfl-odds" label="Sync team picks" />
              <SyncButton endpoint="/api/sync-nfl-props" label="Sync player props" />
            </div>
          )}
        </div>
      </section>

      {/* Parlay math header */}
      {hasLottoPicks && parlayCalc && (
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="app-stat rounded-2xl p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Legs</div>
            <div className="mt-1 text-2xl font-bold text-slate-950">{lottoLegs.length}</div>
          </div>
          <div className="app-stat rounded-2xl p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Parlay odds</div>
            <div className="mt-1 text-2xl font-bold text-slate-950">{fmtOdds(parlayCalc.american)}</div>
          </div>
          <div className="app-stat rounded-2xl p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
              {cappedPayout && cappedPayout < parlayCalc.payout ? "Capped payout" : "Est. payout"}
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-700">{formatMoney(cappedPayout ?? parlayCalc.payout)}</div>
          </div>
          <div className="app-stat rounded-2xl p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Stake</div>
            <div className="mt-1 text-2xl font-bold text-slate-950">{formatMoney(NFL_LOTTO_STAKE)}</div>
          </div>
        </section>
      )}

      {/* 40-pick lotto board */}
      {hasLottoPicks ? (
        <section className="mb-8">
          <h2 className="mb-2 text-xl font-semibold text-slate-950">
            {currentWeekInfo.label} Picks
          </h2>

          {/* Parlay ticket — legs 1–25 */}
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
            <span className="text-sm font-semibold text-emerald-800">Parlay ticket — legs 1–25</span>
            <span className="text-xs text-slate-400">All 25 must hit for the $1M payout</span>
          </div>
          <div className="mb-6 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
            {lottoPicks.slice(0, 25).map((pick, idx) => (
              <PickTile key={pick.id} pick={pick} leg={idx + 1} isPrimary />
            ))}
            {lottoPicks.length < 25 && Array.from({ length: 25 - lottoPicks.length }).map((_, i) => (
              <div key={`empty-${i}`} className="flex h-[88px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                Leg {lottoPicks.length + i + 1} — sync more picks
              </div>
            ))}
          </div>

          {/* Alternates — legs 26–40 */}
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Alternates — legs 26–40</span>
            <span className="text-xs text-slate-400">Swap in if you want to drop a parlay leg</span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
            {lottoPicks.slice(25, 40).map((pick, idx) => (
              <PickTile key={pick.id} pick={pick} leg={25 + idx + 1} isPrimary={false} />
            ))}
            {lottoPicks.length < 40 && lottoPicks.length >= 25 && Array.from({ length: Math.max(0, 40 - lottoPicks.length) }).map((_, i) => (
              <div key={`alt-empty-${i}`} className="flex h-[88px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                Alt {lottoPicks.length + i - 24} — sync props
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mb-8 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
          <p className="text-slate-600">No lotto picks this week yet.</p>
          {isOwner && (
            <p className="mt-2 text-xs text-slate-400">Use the sync buttons above to pull team picks and player props.</p>
          )}
          {!isOwner && (
            <p className="mt-2 text-xs text-slate-400">Check back soon — picks are updated weekly.</p>
          )}
        </section>
      )}

      {/* Near-miss analysis — shown when enough picks are graded */}
      {showNearMiss && (
        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-slate-950">Parlay Near-Miss Report</h2>
            <p className="mt-1 text-sm text-slate-500">
              How close did the ticket come? Best alternate combos from all 40 picks.
            </p>
          </div>

          {/* Score cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Primary ticket</div>
              <div className={`mt-1 text-2xl font-bold ${primaryWins.length === 25 ? "text-emerald-700" : "text-red-600"}`}>
                {primaryWins.length}/{primaryLegs.filter(isGraded).length}
              </div>
              <div className="text-[11px] text-slate-400">legs hit</div>
            </div>
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Missed by</div>
              <div className={`mt-1 text-2xl font-bold ${primaryLosses.length === 0 && primaryWins.length === 25 ? "text-emerald-700" : primaryLosses.length <= 2 ? "text-amber-600" : "text-red-600"}`}>
                {primaryLosses.length === 0 && primaryWins.length === 25 ? "0 🎉" : `${primaryLosses.length} leg${primaryLosses.length === 1 ? "" : "s"}`}
              </div>
              <div className="text-[11px] text-slate-400">{primaryPending.length > 0 ? `${primaryPending.length} still pending` : "all graded"}</div>
            </div>
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Best from 40</div>
              <div className={`mt-1 text-2xl font-bold ${perfectParlayWasPossible ? "text-emerald-700" : "text-sky-700"}`}>
                {bestPossibleHits}/25
              </div>
              <div className="text-[11px] text-slate-400">{perfectParlayWasPossible ? "perfect parlay existed!" : "best possible"}</div>
            </div>
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">With best swaps</div>
              <div className={`mt-1 text-2xl font-bold ${bestSwappedHits === 25 ? "text-emerald-700" : bestSwappedHits >= 23 ? "text-amber-600" : "text-sky-700"}`}>
                {bestSwappedHits}/25
              </div>
              <div className="text-[11px] text-slate-400">{swappableCount} swap{swappableCount === 1 ? "" : "s"} available</div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Losing primary legs */}
            {primaryLosses.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className="text-sm font-semibold text-red-700">Legs that missed ({primaryLosses.length})</span>
                </div>
                <div className="rounded-2xl border border-red-100 bg-red-50/50 divide-y divide-red-100">
                  {primaryLosses.map((pick, i) => {
                    const legNum = primaryLegs.indexOf(pick) + 1;
                    const swap = swapSuggestions.find((s) => s.drop.id === pick.id);
                    return (
                      <div key={pick.id} className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-700">
                            {legNum}
                          </span>
                          <div className="min-w-0 flex-1">
                            {pick.player_name && (
                              <p className="text-[11px] font-bold text-slate-800 truncate">{pick.player_name}</p>
                            )}
                            <p className="text-xs text-red-800 font-medium leading-snug">
                              {pick.player_name ? pick.side.replace(pick.player_name, "").trim() : pick.side}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{pick.game_label}</p>
                            {swap?.saved && (
                              <div className="mt-1.5 flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-1">
                                <span className="text-[10px] font-bold text-emerald-700">SWAP IN:</span>
                                <span className="text-[11px] text-emerald-800 truncate">
                                  {swap.saved.player_name ? `${swap.saved.player_name} — ` : ""}
                                  {swap.saved.player_name ? swap.saved.side.replace(swap.saved.player_name, "").trim() : swap.saved.side}
                                </span>
                                <span className="ml-auto text-[10px] font-bold text-emerald-600">WIN ✓</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Winning alternate legs */}
            {winningAlternates.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-sm font-semibold text-emerald-700">Alternates that hit ({winningAlternates.length})</span>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 divide-y divide-emerald-100">
                  {winningAlternates.map((pick) => {
                    const altNum = alternateLegs.indexOf(pick) + 26;
                    return (
                      <div key={pick.id} className="flex items-start gap-2 px-4 py-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                          {altNum}
                        </span>
                        <div className="min-w-0 flex-1">
                          {pick.player_name && (
                            <p className="text-[11px] font-bold text-slate-800 truncate">{pick.player_name}</p>
                          )}
                          <p className="text-xs text-emerald-800 font-medium leading-snug">
                            {pick.player_name ? pick.side.replace(pick.player_name, "").trim() : pick.side}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{pick.game_label}</p>
                        </div>
                        <span className="ml-auto shrink-0 text-[11px] font-bold text-emerald-600">WIN ✓</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Winning primary legs summary when all hit */}
            {primaryLosses.length === 0 && primaryWins.length === 25 && (
              <div className="lg:col-span-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center">
                <div className="text-4xl mb-2">🎰</div>
                <h3 className="text-xl font-bold text-emerald-800">All 25 legs hit!</h3>
                <p className="mt-1 text-emerald-700">The full parlay cashed. Check your sportsbook for the payout.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Week 1–18 Tracker */}
      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-950">Week 1–18 Tracker</h2>
          <p className="mt-1 text-sm text-slate-500">{seasonYear} NFL regular season — pick results and hit rate week by week.</p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[52rem] w-full border-collapse bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3 w-[7rem]">Week</th>
                <th className="px-4 py-3">Picks</th>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Hit rate</th>
                <th className="px-4 py-3">Units</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {weekSummaries.map((week) => {
                const isCurrent = week.weekStart === weekStart;
                const hasPicks = week.totalPicks > 0;
                const isFuture = !hasPicks && week.weekNum > (currentWeekInfo?.weekNum ?? 0);

                return (
                  <tr
                    key={week.weekStart}
                    className={`border-t border-slate-100 ${isCurrent ? "bg-emerald-50/60" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${isCurrent ? "text-emerald-800" : "text-slate-900"}`}>
                        {week.label}
                      </span>
                      {isCurrent && (
                        <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">NOW</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {hasPicks ? week.totalPicks : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {hasPicks && (week.wins + week.losses + week.pushes > 0) ? (
                        <span className="font-semibold text-slate-900">
                          {week.wins}–{week.losses}{week.pushes > 0 ? `–${week.pushes}` : ""}
                        </span>
                      ) : hasPicks ? (
                        <span className="text-slate-400">Pending</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {week.winRate != null ? (
                        <span
                          className={`font-semibold ${
                            week.winRate >= 60
                              ? "text-emerald-700"
                              : week.winRate >= 50
                              ? "text-sky-700"
                              : "text-red-600"
                          }`}
                        >
                          {week.winRate}%
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {hasPicks && week.unitsResult !== 0 ? (
                        <span
                          className={`font-semibold ${
                            week.unitsResult > 0 ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {week.unitsResult > 0 ? "+" : ""}
                          {week.unitsResult}u
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isFuture ? (
                        <span className="text-slate-300 text-xs">Upcoming</span>
                      ) : isCurrent ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Active
                        </span>
                      ) : hasPicks && week.pending > 0 ? (
                        <span className="text-slate-400 text-xs">{week.pending} pending</span>
                      ) : hasPicks ? (
                        <span className="text-slate-400 text-xs">Complete</span>
                      ) : (
                        <span className="text-slate-300 text-xs">No picks</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Season totals */}
      {hasWeekData && (() => {
        const graded = weekSummaries.filter(w => w.wins + w.losses + w.pushes > 0);
        const totalWins = graded.reduce((s, w) => s + w.wins, 0);
        const totalLoss = graded.reduce((s, w) => s + w.losses, 0);
        const totalPush = graded.reduce((s, w) => s + w.pushes, 0);
        const totalUnits = Number(graded.reduce((s, w) => s + w.unitsResult, 0).toFixed(2));
        const totalGraded = totalWins + totalLoss + totalPush;
        const seasonWinRate = totalGraded > 0 ? Math.round((totalWins / totalGraded) * 100) : null;

        return (
          <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Season record</div>
              <div className="mt-1 text-xl font-bold text-slate-950">{totalWins}–{totalLoss}{totalPush > 0 ? `–${totalPush}` : ""}</div>
            </div>
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Win rate</div>
              <div className={`mt-1 text-xl font-bold ${seasonWinRate != null && seasonWinRate >= 55 ? "text-emerald-700" : "text-slate-950"}`}>
                {seasonWinRate != null ? `${seasonWinRate}%` : "—"}
              </div>
            </div>
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Season units</div>
              <div className={`mt-1 text-xl font-bold ${totalUnits > 0 ? "text-emerald-700" : totalUnits < 0 ? "text-red-600" : "text-slate-950"}`}>
                {totalUnits > 0 ? "+" : ""}{totalUnits}u
              </div>
            </div>
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Weeks graded</div>
              <div className="mt-1 text-xl font-bold text-slate-950">{graded.length} / 18</div>
            </div>
          </section>
        );
      })()}

      <div className="flex flex-wrap gap-3">
        <Link href="/nfl" className="app-button app-button-secondary inline-flex items-center justify-center">
          NFL board
        </Link>
        <Link href="/performance?sport=NFL" className="app-button app-button-secondary inline-flex items-center justify-center">
          Performance view
        </Link>
      </div>
    </main>
  );
}
