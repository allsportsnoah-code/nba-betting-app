import Link from "next/link";
import SyncButton from "@/app/dashboard/SyncButton";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { isOwnerLoggedIn } from "@/lib/ownerAuth";
import { getResolvedNflOddsCache } from "@/lib/nflOddsCache";
import { getExpectedNflWeekStart } from "@/lib/nflOddsCache";
import { getConfidenceStars } from "@/lib/starRatings";
import type { NflGameContext } from "@/lib/nflContext";

type NflPickRow = {
  id: number;
  pick_date: string;
  game_label: string;
  home_team?: string | null;
  away_team?: string | null;
  market_type: string;
  side: string;
  line_taken?: number | null;
  odds_taken?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  confidence_score?: number | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
  status?: string | null;
  game_start_time?: string | null;
  external_event_id?: string | null;
};

function formatOdds(odds: number | null | undefined) {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : String(odds);
}

function formatEdge(edge: number | null | undefined) {
  if (edge == null) return null;
  return edge > 0 ? `+${edge.toFixed(1)}%` : `${edge.toFixed(1)}%`;
}

function marketLabel(type: string) {
  if (type === "moneyline") return "ML";
  if (type === "spread") return "ATS";
  if (type === "total") return "Total";
  return type.toUpperCase();
}

function confidenceColor(score: number | null | undefined) {
  if (!score) return "text-slate-500";
  if (score >= 70) return "text-emerald-700";
  if (score >= 55) return "text-sky-700";
  return "text-slate-600";
}

function gameTimeLabel(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
}

function ContextBadge({ label, tone }: { label: string; tone?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>
      {label}
    </span>
  );
}

function PickCard({ pick, rank }: { pick: NflPickRow; rank?: number }) {
  const stars = getConfidenceStars({
    sport: "NFL",
    marketType: pick.market_type,
    edge: pick.edge,
    confidenceScore: pick.confidence_score,
  });
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-white/70 bg-white/90 px-4 py-4 shadow-sm">
      {rank && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
          {rank}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-sky-700/15 bg-sky-600/10 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
            {marketLabel(pick.market_type)}
          </span>
          {pick.is_top_pick && (
            <span className="rounded-full border border-emerald-700/15 bg-emerald-600/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
              Top Pick
            </span>
          )}
          {pick.notes === "best_value" && (
            <span className="rounded-full border border-amber-700/15 bg-amber-600/10 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              Best Value
            </span>
          )}
        </div>
        <p className="mt-2 text-base font-semibold text-slate-950">{pick.side}</p>
        <p className="text-sm text-slate-500">{pick.game_label}</p>
        {pick.game_start_time && (
          <p className="text-xs text-slate-400">{gameTimeLabel(pick.game_start_time)}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>
            <span className="text-slate-400">Odds </span>
            <span className="font-semibold text-slate-900">{formatOdds(pick.odds_taken)}</span>
          </span>
          {pick.edge != null && (
            <span>
              <span className="text-slate-400">Edge </span>
              <span className="font-semibold text-emerald-700">{formatEdge(pick.edge)}</span>
            </span>
          )}
          {pick.confidence_score != null && (
            <span className={`font-semibold ${confidenceColor(pick.confidence_score)}`}>
              {"★".repeat(stars)}{"☆".repeat(5 - stars)} {pick.confidence_score}%
            </span>
          )}
        </div>
        {pick.edge_label && (
          <p className="mt-1 text-xs text-slate-400">{pick.edge_label}</p>
        )}
      </div>
    </div>
  );
}

function GameContextCard({ gameId, context }: { gameId: string; context: NflGameContext }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
      <p className="text-sm font-semibold text-slate-900">
        {context.awayTeam.teamName} @ {context.homeTeam.teamName}
      </p>
      {context.riskScore > 10 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {context.riskNotes.map((note) => (
            <ContextBadge key={note} label={note} tone="border-red-700/15 bg-red-600/8 text-red-900" />
          ))}
        </div>
      )}
      <div className="mt-3 space-y-1.5 text-xs text-slate-600">
        <p><span className="font-semibold text-slate-800">Home scheme:</span> {context.homeTeam.schemeNote}</p>
        <p><span className="font-semibold text-slate-800">Away scheme:</span> {context.awayTeam.schemeNote}</p>
        {context.homeTeam.coachingNote && (
          <p><span className="font-semibold text-slate-800">Home HC:</span> {context.homeTeam.coachingNote.split("—")[1]?.trim() ?? context.homeTeam.coachingNote}</p>
        )}
        {context.homeTeam.keyWeaknesses.length > 0 && (
          <p className="text-red-700"><span className="font-semibold">Home weaknesses:</span> {context.homeTeam.keyWeaknesses.join(", ")}</p>
        )}
        {context.awayTeam.keyWeaknesses.length > 0 && (
          <p className="text-red-700"><span className="font-semibold">Away weaknesses:</span> {context.awayTeam.keyWeaknesses.join(", ")}</p>
        )}
        {context.newsHighlights.slice(0, 2).map((h) => (
          <p key={h} className="italic text-slate-500">{h}</p>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {context.homeTeam.keyStrengths.map((s) => (
          <ContextBadge key={s} label={s} tone="border-emerald-700/15 bg-emerald-600/8 text-emerald-900" />
        ))}
        {context.awayTeam.keyStrengths.map((s) => (
          <ContextBadge key={s} label={s} tone="border-emerald-700/15 bg-emerald-600/8 text-emerald-900" />
        ))}
      </div>
    </div>
  );
}

export default async function NflPage() {
  const supabase = getSupabaseServer();
  const weekStart = getExpectedNflWeekStart();
  const [isOwner, resolvedOdds] = await Promise.all([
    isOwnerLoggedIn(),
    getResolvedNflOddsCache(),
  ]);

  const yearEnd = `${weekStart.slice(0, 4)}-12-31`;

  const { data: picksRows } = await supabase
    .from("picks")
    .select(
      "id, pick_date, game_label, home_team, away_team, market_type, side, line_taken, odds_taken, edge, edge_label, confidence_score, is_top_pick, top_pick_rank, notes, status, game_start_time, external_event_id"
    )
    .eq("sport", "NFL")
    .eq("market_scope", "team")
    .gte("pick_date", weekStart)
    .lte("pick_date", yearEnd)
    .order("top_pick_rank", { ascending: true, nullsFirst: false })
    .order("confidence_score", { ascending: false });

  const { data: propRows } = await supabase
    .from("picks")
    .select(
      "id, pick_date, game_label, home_team, away_team, market_type, side, line_taken, odds_taken, edge, edge_label, confidence_score, is_top_pick, top_pick_rank, notes, status, game_start_time, external_event_id"
    )
    .eq("sport", "NFL")
    .eq("market_scope", "props")
    .eq("is_top_pick", true)
    .gte("pick_date", weekStart)
    .lte("pick_date", yearEnd)
    .order("confidence_score", { ascending: false })
    .limit(20);

  const picks = (picksRows ?? []) as NflPickRow[];
  const propPicks = (propRows ?? []) as NflPickRow[];
  const topPicks = picks.filter((p) => p.is_top_pick).sort((a, b) => (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99));
  const bestValue = picks.filter((p) => !p.is_top_pick && p.notes === "best_value");
  const remainingPicks = picks.filter((p) => !p.is_top_pick && p.notes !== "best_value");

  const contextMap = (resolvedOdds.active?.context ?? {}) as Record<string, NflGameContext>;
  const contextGames = Object.values(contextMap).slice(0, 8);

  const hasData = picks.length > 0 || propPicks.length > 0;
  const isStale = resolvedOdds.isStale || !resolvedOdds.active;

  const lottoCandidates = [...topPicks, ...bestValue].slice(0, 25);

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      {/* Header */}
      <section className="app-card mb-8 rounded-[2rem] p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="app-eyebrow">NFL — Week of {weekStart}</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">NFL Board</h1>
            <p className="mt-3 text-base text-slate-600">
              Team picks ranked by model edge, coaching matchup, and injury risk. Lotto builder pulls the best legs for your 25-leg $1M parlay.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/performance?sport=NFL" className="app-button app-button-secondary inline-flex items-center justify-center">
                Performance
              </Link>
              <Link href="/nfl/lotto" className="app-button app-button-primary inline-flex items-center justify-center">
                Million Ticket Builder →
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {isOwner && (
              <div className="rounded-2xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur">
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Owner sync</div>
                <SyncButton
                  endpoint="/api/sync-nfl-odds"
                  label="Sync NFL odds + picks"
                />
                <SyncButton
                  endpoint="/api/sync-nfl-props"
                  label="Sync player props"
                />
                {isStale && (
                  <p className="mt-2 text-xs text-amber-700">Odds cache is stale — sync to refresh this week&apos;s picks.</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div className="app-stat rounded-2xl p-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Top picks</div>
                <div className="mt-1 text-2xl font-bold text-slate-950">{topPicks.length}</div>
              </div>
              <div className="app-stat rounded-2xl p-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Best value</div>
                <div className="mt-1 text-2xl font-bold text-slate-950">{bestValue.length}</div>
              </div>
              <div className="app-stat rounded-2xl p-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Total legs</div>
                <div className="mt-1 text-2xl font-bold text-slate-950">{picks.length}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!hasData && (
        <section className="mb-8 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
          <p className="text-slate-600 text-sm">No NFL picks for this week yet.</p>
          {isOwner ? (
            <p className="mt-2 text-xs text-slate-400">Use the owner sync button above to pull this week&apos;s NFL odds and generate picks.</p>
          ) : (
            <p className="mt-2 text-xs text-slate-400">Check back soon — picks are updated weekly.</p>
          )}
        </section>
      )}

      {/* Lotto CTA — top legs preview */}
      {lottoCandidates.length > 0 && (
        <section className="mb-8 rounded-[2rem] border border-emerald-700/20 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">$1M Lotto</div>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">25-Leg Parlay Builder</h2>
              <p className="mt-1 text-sm text-slate-600">
                {lottoCandidates.length} legs ready to load into your million dollar ticket. Stack the best team picks and props for FanDuel-style lotto.
              </p>
            </div>
            <Link
              href="/nfl/lotto"
              className="shrink-0 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-700 active:bg-emerald-800"
            >
              Open builder →
            </Link>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {lottoCandidates.slice(0, 10).map((p) => (
              <span key={p.id} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-900">
                {p.side} ({formatOdds(p.odds_taken)})
              </span>
            ))}
            {lottoCandidates.length > 10 && (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                +{lottoCandidates.length - 10} more legs
              </span>
            )}
          </div>
        </section>
      )}

      {/* Top Picks */}
      {topPicks.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-slate-950">Top Picks</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {topPicks.map((pick) => (
              <PickCard key={pick.id} pick={pick} rank={pick.top_pick_rank ?? undefined} />
            ))}
          </div>
        </section>
      )}

      {/* Best Value */}
      {bestValue.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-slate-950">Best Value</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {bestValue.map((pick) => (
              <PickCard key={pick.id} pick={pick} />
            ))}
          </div>
        </section>
      )}

      {/* Remaining candidates */}
      {remainingPicks.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-slate-950">All Candidates</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {remainingPicks.map((pick) => (
              <PickCard key={pick.id} pick={pick} />
            ))}
          </div>
        </section>
      )}

      {/* Player Props */}
      {propPicks.length > 0 && (
        <section className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-950">Player Props</h2>
            <span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-800">
              Lotto legs
            </span>
          </div>
          <p className="mb-4 text-sm text-slate-500">Best props for the 25-leg parlay, scored by hit rate and team context.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {propPicks.map((pick) => (
              <PickCard key={pick.id} pick={pick} />
            ))}
          </div>
        </section>
      )}

      {/* Game Context */}
      {contextGames.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-slate-950">Coaching & Scheme Context</h2>
          <p className="mb-4 text-sm text-slate-500">Defensive scheme tendencies, coaching profiles, and injury risk per game.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {contextGames.map((ctx) => (
              <GameContextCard key={ctx.gameId} gameId={ctx.gameId} context={ctx} />
            ))}
          </div>
        </section>
      )}

      {/* Links */}
      <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-wrap gap-3">
          <Link href="/performance?sport=NFL" className="app-button app-button-secondary inline-flex items-center justify-center">
            NFL performance
          </Link>
          <Link href="/calendar?sport=NFL" className="app-button app-button-secondary inline-flex items-center justify-center">
            NFL calendar
          </Link>
          <Link href="/nfl/lotto" className="app-button app-button-primary inline-flex items-center justify-center">
            Million ticket builder →
          </Link>
        </div>
      </section>
    </main>
  );
}
