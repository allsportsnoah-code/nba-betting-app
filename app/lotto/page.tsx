import Link from "next/link";
import SyncButton from "@/app/dashboard/SyncButton";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { isOwnerLoggedIn } from "@/lib/ownerAuth";
import { getExpectedNflWeekStart } from "@/lib/nflOddsCache";
import { getAllNflWeeks, getNflWeekInfo } from "@/lib/nflWeek";
import {
  americanToDecimal,
  getMixedParlayReturn,
  formatMoney,
  NFL_LOTTO_PAYOUT_CAP,
} from "@/lib/nflLotto";

type GameResearch = {
  gameId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  weather: {
    tempF: number;
    windMph: number;
    windGustsMph: number;
    precipPct: number;
    conditions: string;
    stadiumName: string;
    isAdverse: boolean;
    affectsTotals: boolean;
  } | null;
  homeInjuries: { player: string; position: string; status: string; isCritical: boolean }[];
  awayInjuries: { player: string; position: string; status: string; isCritical: boolean }[];
  newsHeadlines: string[];
  riskNotes: string[];
  spreadConfAdjustment: number;
  totalConfAdjustment: number;
  researchedAt: string;
};

const STAKE = 1;
const LEG_COUNT = 25;

type Pick = {
  id: number;
  pick_date: string;
  game_label: string;
  market_type: string;
  side: string;
  line_taken?: number | null;
  odds_taken?: number | null;
  confidence_score?: number | null;
  edge?: number | null;
  projected_line?: number | null;
  market_line?: number | null;
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
  spreadPicks: number;
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

// Win-probability score: maximises P(leg hits) for a parlay.
// Rewards high confidence + edge; heavily penalises plus-money legs.
function lottoScore(p: Pick): number {
  const conf = p.confidence_score ?? 50;
  const edge = Math.abs(p.edge ?? 0);
  const odds = p.odds_taken ?? -110;
  const isTotal = p.market_type === "total";

  // Confidence is the primary driver
  const confScore = conf * 1.5;
  // Edge contribution (capped — don't chase huge numbers)
  const edgeScore = Math.min(edge * 10, 35);
  // Odds sweet spot: -105 to -130 is best for parlays
  const oddsBonus = odds >= -130 && odds <= -100 ? 18
    : odds >= -150 && odds <= -90 ? 8
    : 0;
  // Slight bonus for totals — they're the most line-grounded NFL market
  const marketBonus = isTotal ? 5 : 0;
  // Penalise plus-money (adds variance to a parlay)
  const plusPenalty = odds > 0 ? Math.min(odds * 0.1, 30) : 0;
  // Top pick label bonus
  const topBonus = p.is_top_pick ? 8 : 0;

  return Number((confScore + edgeScore + oddsBonus + marketBonus + topBonus - plusPenalty).toFixed(1));
}

// Estimated per-leg win % for display (model confidence + edge shift + research adjustment, capped at 72%)
function winPct(p: Pick, researchAdj = 0): number {
  const conf = p.confidence_score ?? 50;
  const edge = Math.abs(p.edge ?? 0);
  return Math.min(72, Math.max(44, conf * 0.45 + edge * 1.5 + 42 + researchAdj * 0.3));
}

function calcParlay(picks: Pick[]) {
  const valid = picks.filter((p) => p.odds_taken != null);
  if (!valid.length) return null;
  const decimal = valid.reduce((acc, p) => acc * americanToDecimal(p.odds_taken!), 1);
  const payout = getMixedParlayReturn({ odds: valid.map((p) => p.odds_taken!), stake: STAKE });
  const american = decimal >= 2 ? Math.round((decimal - 1) * 100) : -Math.round(100 / (decimal - 1));
  return { decimal, american, payout: Math.min(payout, NFL_LOTTO_PAYOUT_CAP) };
}

function statusBorder(status: string | null | undefined) {
  if (status === "win") return "border-emerald-300 bg-emerald-50";
  if (status === "loss") return "border-red-300 bg-red-50";
  if (status === "push") return "border-slate-300 bg-slate-100";
  return "border-slate-200 bg-white";
}

function marketBadge(marketType: string) {
  if (marketType === "spread") {
    return <span className="rounded-full border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">ATS</span>;
  }
  return <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Total</span>;
}

type ResearchHints = {
  weatherNote?: string;
  injuryNote?: string;
  isWeatherRisk?: boolean; // adverse weather — relevant to totals
  isInjuryRisk?: boolean;  // key player out — relevant to spreads
};

function PickTile({ pick, leg, isPrimary, score, pct, research }: {
  pick: Pick; leg: number; isPrimary: boolean; score: number; pct: number;
  research?: ResearchHints;
}) {
  const pctColor = pct >= 64 ? "text-emerald-700" : pct >= 58 ? "text-sky-700" : pct >= 50 ? "text-slate-500" : "text-amber-600";
  const isTotal = pick.market_type === "total";
  const showWeather = isTotal && research?.weatherNote && research.isWeatherRisk;
  const showInjury = !isTotal && research?.injuryNote && research.isInjuryRisk;

  return (
    <div className={`flex items-start gap-2 rounded-2xl border px-3 py-3 shadow-sm ${statusBorder(pick.status)}`}>
      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isPrimary ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
        {leg}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 flex-wrap">
          {marketBadge(pick.market_type)}
          {pick.is_top_pick && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">Top</span>
          )}
          {showWeather && (
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">Wind</span>
          )}
          {showInjury && (
            <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">Inj</span>
          )}
          {pick.status === "win" && <span className="text-[11px] font-bold text-emerald-700">WIN ✓</span>}
          {pick.status === "loss" && <span className="text-[11px] font-bold text-red-700">LOSS</span>}
          {pick.status === "push" && <span className="text-[11px] font-bold text-slate-500">PUSH</span>}
        </div>
        <p className="mt-0.5 text-xs font-semibold text-slate-800 leading-snug line-clamp-2">{pick.side}</p>
        <p className="mt-0.5 text-[10px] text-slate-400 truncate">{pick.game_label}</p>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0 text-[11px]">
          <span className="font-semibold text-slate-700">{fmtOdds(pick.odds_taken)}</span>
          <span className={`font-semibold ${pctColor}`}>{pct}% win</span>
          {(pick.edge ?? 0) !== 0 && (
            <span className="text-slate-400">{(pick.edge ?? 0) > 0 ? "+" : ""}{(pick.edge ?? 0).toFixed(1)} edge</span>
          )}
        </div>
        {(showWeather || showInjury) && (
          <p className="mt-1 text-[10px] text-slate-500 leading-snug">
            {showWeather ? research!.weatherNote : research!.injuryNote}
          </p>
        )}
      </div>
    </div>
  );
}

export default async function LottoPage() {
  const supabase = getSupabaseServer();
  const now = new Date();
  const isOwner = await isOwnerLoggedIn();
  const weekStart = getExpectedNflWeekStart(now);
  const seasonYear = now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const allWeeks = getAllNflWeeks(seasonYear);
  const currentWeekInfo = getNflWeekInfo(weekStart, now);
  const weekEnd = currentWeekInfo.weekEnd;
  const yearEnd = `${weekStart.slice(0, 4)}-12-31`;
  const week1Start = allWeeks[0]?.weekStart ?? weekStart;

  // Fetch this week's picks + research + season history all in parallel.
  // 8-second timeout per query so a cold Supabase doesn't block the page.
  const withTimeout = <T,>(promise: PromiseLike<T>, ms: number): Promise<T | null> =>
    Promise.race([Promise.resolve(promise), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

  const [picksResult, researchResult, allSeasonResult] = await Promise.all([
    withTimeout(
      supabase
        .from("picks")
        .select("id, pick_date, game_label, market_type, side, line_taken, odds_taken, confidence_score, edge, projected_line, market_line, is_top_pick, notes, status, units_result, game_start_time")
        .eq("sport", "NFL")
        .eq("market_scope", "team")
        .in("market_type", ["spread", "total"])
        .gte("pick_date", weekStart)
        .lte("pick_date", weekEnd)
        .order("confidence_score", { ascending: false }),
      8000
    ),
    withTimeout(
      supabase
        .from("cached_market_data")
        .select("data, updated_at")
        .eq("cache_key", `nfl_research_${weekStart}`)
        .maybeSingle(),
      8000
    ),
    withTimeout(
      supabase
        .from("picks")
        .select("id, pick_date, market_type, status, units_result")
        .eq("sport", "NFL")
        .eq("market_scope", "team")
        .in("market_type", ["spread", "total"])
        .gte("pick_date", week1Start)
        .lte("pick_date", yearEnd),
      8000
    ),
  ]);

  const allPicks = ((picksResult as { data?: Pick[] } | null)?.data ?? []) as Pick[];
  const researchPayload = (researchResult as { data?: { data?: { games?: GameResearch[] }; updated_at?: string } | null } | null)?.data;
  const researchGames = (researchPayload?.data?.games ?? []) as GameResearch[];
  const researchedAt = researchPayload?.updated_at ?? null;

  // Build a lookup from game_label → research
  const researchByGame = new Map<string, GameResearch>();
  for (const g of researchGames) {
    researchByGame.set(g.gameLabel, g);
  }

  // Build per-pick research hints
  function getResearchHints(p: Pick): ResearchHints {
    const r = researchByGame.get(p.game_label);
    if (!r) return {};
    const isTotal = p.market_type === "total";
    if (isTotal && r.weather?.isAdverse) {
      return {
        weatherNote: r.weather.conditions,
        isWeatherRisk: true,
      };
    }
    if (!isTotal) {
      const allOut = [...r.homeInjuries, ...r.awayInjuries].filter((i) => i.status === "Out" || i.status === "Doubtful");
      if (allOut.length > 0) {
        return {
          injuryNote: allOut.slice(0, 2).map((i) => `${i.player} (${i.position}) ${i.status}`).join(", "),
          isInjuryRisk: allOut.some((i) => i.isCritical),
        };
      }
    }
    return {};
  }

  // Research-adjusted win% and score
  function researchAdj(p: Pick): number {
    const r = researchByGame.get(p.game_label);
    if (!r) return 0;
    return p.market_type === "total" ? r.totalConfAdjustment : r.spreadConfAdjustment;
  }

  // Score and sort: highest win-probability first (research-adjusted)
  const scored = allPicks
    .map((p) => {
      const adj = researchAdj(p);
      return { pick: p, score: lottoScore(p) + adj, pct: Math.round(winPct(p, adj)), hints: getResearchHints(p) };
    })
    .sort((a, b) => b.score - a.score);

  const slate: { pick: Pick; score: number; pct: number; hints: ResearchHints }[] = [];
  const seen = new Set<number>();
  for (const entry of scored) {
    if (!seen.has(entry.pick.id)) {
      seen.add(entry.pick.id);
      slate.push(entry);
    }
  }

  const primaryLegs = slate.slice(0, LEG_COUNT);
  const alternateLegs = slate.slice(LEG_COUNT, LEG_COUNT + 15);
  const parlayCalc = calcParlay(primaryLegs.map((e) => e.pick));
  const cappedPayout = parlayCalc ? parlayCalc.payout : null;

  const isWin = (p: Pick) => p.status === "win" || p.status === "push";
  const isLoss = (p: Pick) => p.status === "loss";
  const isGraded = (p: Pick) => p.status === "win" || p.status === "loss" || p.status === "push";

  const gradedCount = primaryLegs.filter((e) => isGraded(e.pick)).length;
  const showNearMiss = primaryLegs.length > 0 && gradedCount >= Math.ceil(primaryLegs.length / 2);
  const primaryWins = primaryLegs.filter((e) => isWin(e.pick));
  const primaryLosses = primaryLegs.filter((e) => isLoss(e.pick));
  const primaryPending = primaryLegs.filter((e) => !isGraded(e.pick));
  const winningAlternates = alternateLegs.filter((e) => isWin(e.pick));

  const avgWinPct = primaryLegs.length > 0
    ? Math.round(primaryLegs.reduce((s, e) => s + e.pct, 0) / primaryLegs.length)
    : 0;

  const spreadCount = primaryLegs.filter((e) => e.pick.market_type === "spread").length;
  const totalCount = primaryLegs.filter((e) => e.pick.market_type === "total").length;
  const hasLotto = slate.length > 0;

  type SeasonRow = { id: number; pick_date: string; market_type: string; status?: string | null; units_result?: number | null };
  const seasonPicks = ((allSeasonResult as { data?: SeasonRow[] } | null)?.data ?? []) as SeasonRow[];

  const weekSummaries: WeekSummary[] = allWeeks.slice(0, 18).map((week) => {
    const wp = seasonPicks.filter((p) => p.pick_date >= week.weekStart && p.pick_date <= week.weekEnd);
    const wins = wp.filter((p) => p.status === "win").length;
    const losses = wp.filter((p) => p.status === "loss").length;
    const pushes = wp.filter((p) => p.status === "push").length;
    const pending = wp.filter((p) => !p.status || p.status === "pending").length;
    const graded = wins + losses + pushes;
    return {
      weekStart: week.weekStart,
      label: week.label,
      weekNum: week.weekNum,
      spreadPicks: wp.filter((p) => p.market_type === "spread").length,
      totalPicks: wp.filter((p) => p.market_type === "total").length,
      wins, losses, pushes, pending,
      winRate: graded > 0 ? Number(((wins / graded) * 100).toFixed(0)) : null,
      unitsResult: Number(wp.reduce((s, p) => s + (p.units_result ?? 0), 0).toFixed(2)),
    };
  });

  const hasWeekData = weekSummaries.some((w) => w.wins + w.losses + w.pushes + w.pending > 0);

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">

      {/* Header */}
      <section className="app-card mb-8 rounded-[2rem] p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="app-eyebrow">NFL — {currentWeekInfo.label}</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
              25-Leg Best Shot
            </h1>
            <p className="mt-3 text-base text-slate-600">
              Spread and total picks only — the two most line-grounded NFL markets with a finite candidate set.
              Every leg is ranked by win probability so the 25 highest-confidence bets fill the parlay ticket first.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/nfl" className="app-button app-button-secondary inline-flex items-center justify-center">
                NFL board
              </Link>
              <Link href="/nfl/lotto" className="app-button app-button-secondary inline-flex items-center justify-center">
                Full lotto (props + team)
              </Link>
            </div>
          </div>
          {isOwner && (
            <div className="flex flex-col gap-3 min-w-[18rem]">
              <SyncButton endpoint="/api/sync-nfl-odds" label="Sync NFL picks" />
              <SyncButton endpoint="/api/research-nfl" label="Research games (weather + injuries)" />
              {researchedAt && (
                <p className="text-[11px] text-slate-400">
                  Last researched: {new Date(researchedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Stats bar */}
      {hasLotto && parlayCalc && (
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="app-stat rounded-2xl p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Legs</div>
            <div className="mt-1 text-2xl font-bold text-slate-950">{primaryLegs.length}</div>
            <div className="text-[11px] text-slate-400">{spreadCount} ATS · {totalCount} Total</div>
          </div>
          <div className="app-stat rounded-2xl p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Avg win%</div>
            <div className={`mt-1 text-2xl font-bold ${avgWinPct >= 62 ? "text-emerald-700" : "text-sky-700"}`}>{avgWinPct}%</div>
            <div className="text-[11px] text-slate-400">per leg</div>
          </div>
          <div className="app-stat rounded-2xl p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Parlay odds</div>
            <div className="mt-1 text-2xl font-bold text-slate-950">{fmtOdds(parlayCalc.american)}</div>
          </div>
          <div className="app-stat rounded-2xl p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Est. payout ($1)</div>
            <div className="mt-1 text-2xl font-bold text-emerald-700">{formatMoney(cappedPayout ?? 0)}</div>
          </div>
          <div className="app-stat rounded-2xl p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Candidates</div>
            <div className="mt-1 text-2xl font-bold text-slate-950">{allPicks.length}</div>
            <div className="text-[11px] text-slate-400">total pool</div>
          </div>
        </section>
      )}

      {/* Primary 25 legs */}
      {hasLotto ? (
        <section className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
            <span className="text-sm font-semibold text-emerald-800">Parlay ticket — legs 1–{LEG_COUNT}</span>
            <span className="text-xs text-slate-400">All {LEG_COUNT} must hit · ranked by win probability</span>
          </div>
          <div className="mb-6 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
            {primaryLegs.map(({ pick, score, pct, hints }, idx) => (
              <PickTile key={pick.id} pick={pick} leg={idx + 1} isPrimary score={score} pct={pct} research={hints} />
            ))}
            {primaryLegs.length < LEG_COUNT && Array.from({ length: LEG_COUNT - primaryLegs.length }).map((_, i) => (
              <div key={`empty-${i}`} className="flex h-[100px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                Leg {primaryLegs.length + i + 1} — sync NFL picks
              </div>
            ))}
          </div>

          {/* Alternates */}
          {alternateLegs.length > 0 && (
            <>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                <span className="text-sm font-semibold text-slate-700">Alternates — {alternateLegs.length} more</span>
                <span className="text-xs text-slate-400">Next-best spread/total picks if you want to swap a leg</span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                {alternateLegs.map(({ pick, score, pct, hints }, idx) => (
                  <PickTile key={pick.id} pick={pick} leg={LEG_COUNT + idx + 1} isPrimary={false} score={score} pct={pct} research={hints} />
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="mb-8 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-12 text-center">
          <p className="text-lg font-semibold text-slate-700">No spread or total picks this week yet</p>
          <p className="mt-2 text-sm text-slate-500">Sync NFL team picks to populate the lotto ticket.</p>
          {isOwner && (
            <div className="mt-6 flex justify-center">
              <SyncButton endpoint="/api/sync-nfl-odds" label="Sync NFL picks" />
            </div>
          )}
        </section>
      )}

      {/* Research intel panel — game-level weather + injury context */}
      {researchGames.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-semibold text-slate-950">Game Intel</h2>
          <p className="mb-4 text-sm text-slate-500">
            Weather forecasts for outdoor stadiums + injury reports pulled from ESPN.
            Factors already applied to win probability on each pick tile.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {researchGames.map((g) => {
              const hasWeather = !!g.weather;
              const allOut = [...g.homeInjuries, ...g.awayInjuries].filter((i) => i.status === "Out" || i.status === "Doubtful");
              const newsItems = g.newsHeadlines.slice(0, 2);
              if (!hasWeather && allOut.length === 0 && newsItems.length === 0 && g.riskNotes.length === 0) return null;
              return (
                <div key={g.gameId} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-bold text-slate-900 truncate">{g.gameLabel}</p>
                  {hasWeather && (
                    <div className={`mb-2 flex items-start gap-2 rounded-xl px-3 py-2 ${g.weather!.affectsTotals ? "bg-blue-50 border border-blue-200" : g.weather!.isAdverse ? "bg-sky-50 border border-sky-100" : "bg-slate-50 border border-slate-100"}`}>
                      <span className="text-base">{g.weather!.windMph >= 20 ? "🌬️" : g.weather!.precipPct >= 60 ? "🌧️" : "⛅"}</span>
                      <div className="min-w-0">
                        <p className={`text-[11px] font-semibold ${g.weather!.affectsTotals ? "text-blue-800" : "text-slate-700"}`}>
                          {g.weather!.stadiumName} — {g.weather!.conditions}
                        </p>
                        {g.weather!.affectsTotals && (
                          <p className="text-[10px] text-blue-600 mt-0.5">Strong wind — lean Under on this game&apos;s total</p>
                        )}
                      </div>
                    </div>
                  )}
                  {allOut.length > 0 && (
                    <div className="mb-2">
                      {allOut.slice(0, 3).map((inj, i) => (
                        <div key={i} className={`flex items-center gap-1.5 text-[11px] mb-1 ${inj.isCritical ? "text-red-700 font-semibold" : "text-slate-600"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${inj.status === "Out" ? "bg-red-500" : "bg-amber-400"}`} />
                          {inj.player} ({inj.position}) — {inj.status}
                        </div>
                      ))}
                    </div>
                  )}
                  {newsItems.map((h, i) => (
                    <p key={i} className="text-[10px] text-slate-500 mt-1 leading-snug line-clamp-1">• {h}</p>
                  ))}
                </div>
              );
            }).filter(Boolean)}
          </div>
        </section>
      )}

      {/* Near-miss analysis */}
      {showNearMiss && (
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-semibold text-slate-950">Near-Miss Report</h2>
          <p className="mb-4 text-sm text-slate-500">How close did this week&apos;s 25-leg ticket come?</p>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Primary ticket</div>
              <div className={`mt-1 text-2xl font-bold ${primaryWins.length === 25 ? "text-emerald-700" : "text-red-600"}`}>
                {primaryWins.length}/{gradedCount}
              </div>
              <div className="text-[11px] text-slate-400">legs hit</div>
            </div>
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Missed by</div>
              <div className={`mt-1 text-2xl font-bold ${primaryLosses.length === 0 ? "text-emerald-700" : primaryLosses.length <= 2 ? "text-amber-600" : "text-red-600"}`}>
                {primaryLosses.length === 0 && primaryWins.length === 25 ? "0 🎉" : `${primaryLosses.length}`}
              </div>
              <div className="text-[11px] text-slate-400">{primaryPending.length > 0 ? `${primaryPending.length} pending` : "all graded"}</div>
            </div>
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Alt wins</div>
              <div className="mt-1 text-2xl font-bold text-sky-700">{winningAlternates.length}</div>
              <div className="text-[11px] text-slate-400">available swaps</div>
            </div>
            <div className="app-stat rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Best swapped</div>
              <div className={`mt-1 text-2xl font-bold ${Math.min(primaryLosses.length, winningAlternates.length) + primaryWins.length === 25 ? "text-emerald-700" : "text-slate-700"}`}>
                {Math.min(primaryLosses.length, winningAlternates.length) + primaryWins.length}/25
              </div>
            </div>
          </div>

          {primaryLosses.length === 0 && primaryWins.length === 25 && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center">
              <div className="text-4xl mb-2">🎰</div>
              <h3 className="text-xl font-bold text-emerald-800">All 25 legs hit!</h3>
              <p className="mt-1 text-emerald-700">The full spread/total parlay cashed.</p>
            </div>
          )}

          {primaryLosses.length > 0 && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-sm font-semibold text-red-700">Legs that missed ({primaryLosses.length})</span>
                </div>
                <div className="rounded-2xl border border-red-100 bg-red-50/50 divide-y divide-red-100">
                  {primaryLosses.map(({ pick }) => {
                    const legNum = primaryLegs.findIndex((e) => e.pick.id === pick.id) + 1;
                    return (
                      <div key={pick.id} className="px-4 py-3 flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-700">{legNum}</span>
                        <div>
                          <p className="text-xs font-semibold text-red-800">{pick.side}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{pick.game_label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {winningAlternates.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-700">Alternates that hit ({winningAlternates.length})</span>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 divide-y divide-emerald-100">
                    {winningAlternates.map(({ pick }) => {
                      const altNum = alternateLegs.findIndex((e) => e.pick.id === pick.id) + LEG_COUNT + 1;
                      return (
                        <div key={pick.id} className="flex items-start gap-2 px-4 py-3">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">{altNum}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-emerald-800">{pick.side}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{pick.game_label}</p>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-600">WIN ✓</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Week 1–18 Tracker */}
      <section className="mb-8">
        <h2 className="mb-1 text-xl font-semibold text-slate-950">Week 1–18 Tracker</h2>
        <p className="mb-4 text-sm text-slate-500">{seasonYear} NFL season — spread &amp; total picks only.</p>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[52rem] w-full border-collapse bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3 w-[7rem]">Week</th>
                <th className="px-4 py-3">ATS</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Hit rate</th>
                <th className="px-4 py-3">Units</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {weekSummaries.map((week) => {
                const isCurrent = week.weekStart === weekStart;
                const hasPicks = week.wins + week.losses + week.pushes + week.pending > 0;
                const isFuture = !hasPicks && week.weekNum > (currentWeekInfo?.weekNum ?? 0);

                return (
                  <tr key={week.weekStart} className={`border-t border-slate-100 ${isCurrent ? "bg-emerald-50/60" : ""}`}>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${isCurrent ? "text-emerald-800" : "text-slate-900"}`}>{week.label}</span>
                      {isCurrent && <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">NOW</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{hasPicks ? week.spreadPicks : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-600">{hasPicks ? week.totalPicks : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3">
                      {hasPicks && (week.wins + week.losses + week.pushes > 0) ? (
                        <span className="font-semibold text-slate-900">{week.wins}–{week.losses}{week.pushes > 0 ? `–${week.pushes}` : ""}</span>
                      ) : hasPicks ? (
                        <span className="text-slate-400">Pending</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {week.winRate != null ? (
                        <span className={`font-semibold ${week.winRate >= 60 ? "text-emerald-700" : week.winRate >= 50 ? "text-sky-700" : "text-red-600"}`}>
                          {week.winRate}%
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {hasPicks && week.unitsResult !== 0 ? (
                        <span className={`font-semibold ${week.unitsResult > 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {week.unitsResult > 0 ? "+" : ""}{week.unitsResult}u
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {isFuture ? (
                        <span className="text-slate-300">Upcoming</span>
                      ) : isCurrent ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Active</span>
                      ) : hasPicks && week.pending > 0 ? (
                        <span className="text-slate-400">{week.pending} pending</span>
                      ) : hasPicks ? (
                        <span className="text-slate-400">Complete</span>
                      ) : (
                        <span className="text-slate-300">No picks</span>
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
        const graded = weekSummaries.filter((w) => w.wins + w.losses + w.pushes > 0);
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
        <Link href="/nfl" className="app-button app-button-secondary inline-flex items-center justify-center">NFL board</Link>
        <Link href="/nfl/lotto" className="app-button app-button-secondary inline-flex items-center justify-center">Full lotto (props + team)</Link>
        <Link href="/performance?sport=NFL" className="app-button app-button-secondary inline-flex items-center justify-center">Performance</Link>
      </div>
    </main>
  );
}
