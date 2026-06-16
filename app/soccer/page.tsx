import Link from "next/link";
import SyncButton from "@/app/dashboard/SyncButton";
import { getCachedData } from "@/lib/cache";
import { isOwnerLoggedIn } from "@/lib/ownerAuth";
import { getConfidenceLabel, getConfidenceStars } from "@/lib/starRatings";
import { getResolvedSoccerOddsCache, normalizeSoccerCompetition } from "@/lib/soccerOddsCache";
import {
  SOCCER_COMPETITIONS,
  SOCCER_DATA_LAYERS,
  SOCCER_MODEL_READINESS_TRACKS,
  SOCCER_PROP_CATEGORY_LABELS,
  SOCCER_PROP_MARKETS,
  SOCCER_RELEVANT_IDEAS,
  SOCCER_TEAM_MARKETS,
  SOCCER_WORLD_CUP_SIGNAL_LANES,
  evaluateSoccerGames,
  getSoccerDisplayCompetition,
  type SoccerCompetitionKey,
  type SoccerOddsGame,
  type SoccerPropCategoryKey,
} from "@/lib/soccerModel";
import {
  getSoccerPropCategoryLabel,
  getSoccerPropSnapshotCacheKey,
  type SoccerCoverageCandidate,
  type SoccerPropSnapshot,
  type SoccerPropSnapshotRow,
} from "@/lib/soccerProps";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const priorityTone = {
  core: "border-emerald-700/15 bg-emerald-600/10 text-emerald-900",
  high: "border-sky-700/15 bg-sky-600/10 text-sky-900",
  watch: "border-amber-700/20 bg-amber-500/12 text-amber-950",
} as const;

const competitionTone = {
  world_cup: "border-emerald-700/15 bg-emerald-600/10 text-emerald-900",
  mls: "border-sky-700/15 bg-sky-600/10 text-sky-900",
} as const;

type SavedSoccerPick = {
  id: number;
  pick_date: string;
  sport?: string | null;
  market_scope?: string | null;
  external_event_id?: string | null;
  game_label?: string | null;
  game_start_time?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  market_type?: string | null;
  side: string;
  line_taken?: number | null;
  odds_taken?: number | null;
  projected_line?: number | null;
  market_line?: number | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  confidence_score?: number | null;
  is_top_pick?: boolean | null;
  top_pick_rank?: number | null;
  notes?: string | null;
  status?: string | null;
  locked_at?: string | null;
};

type SoccerBoardDay = "today" | "yesterday";

const SOCCER_PICK_SELECT = [
  "id",
  "pick_date",
  "sport",
  "market_scope",
  "external_event_id",
  "game_label",
  "game_start_time",
  "home_team",
  "away_team",
  "market_type",
  "side",
  "line_taken",
  "odds_taken",
  "projected_line",
  "market_line",
  "projected_home_score",
  "projected_away_score",
  "edge",
  "edge_label",
  "confidence_score",
  "is_top_pick",
  "top_pick_rank",
  "notes",
  "status",
  "locked_at",
].join(",");

function getMarketsByCategory(category: SoccerPropCategoryKey) {
  return SOCCER_PROP_MARKETS.filter((market) => market.category === category);
}

function formatKickoff(value: string | null | undefined) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function formatOdds(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  return value > 0 ? `+${value}` : `${value}`;
}

function formatMarketType(value: string | null | undefined) {
  if (value === "moneyline") return "3-Way Moneyline";
  if (value === "spread") return "Spread / Handicap";
  if (value === "total") return "Total Goals";
  return value ?? "Soccer Market";
}

function getPickStars(pick: SavedSoccerPick) {
  return getConfidenceStars({
    sport: "SOCCER",
    marketType: pick.market_type,
    edge: pick.edge,
    confidenceScore: pick.confidence_score,
    gameStartTime: pick.game_start_time,
  });
}

function buildHref(competition: SoccerCompetitionKey, day: SoccerBoardDay) {
  return `/soccer?competition=${competition}&day=${day}`;
}

function renderPickCard(pick: SavedSoccerPick, label: string) {
  const stars = getPickStars(pick);

  return (
    <div key={`${label}-${pick.id}`} className="rounded-3xl border border-white/60 bg-white/78 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">{pick.game_label ?? "Soccer Match"}</h3>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          {getConfidenceLabel(stars)}
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-700">
        <p><strong>Pick:</strong> {pick.side}</p>
        <p><strong>Market:</strong> {formatMarketType(pick.market_type)}</p>
        <p><strong>Odds:</strong> {formatOdds(pick.odds_taken)} | <strong>Edge:</strong> {pick.edge ?? "N/A"}%</p>
        <p><strong>Projected score:</strong> {pick.away_team ?? "Away"} {pick.projected_away_score?.toFixed(2) ?? "N/A"} - {pick.home_team ?? "Home"} {pick.projected_home_score?.toFixed(2) ?? "N/A"}</p>
        <p><strong>Kickoff:</strong> {formatKickoff(pick.game_start_time)}</p>
      </div>
      {pick.edge_label ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
          {pick.edge_label}
        </div>
      ) : null}
    </div>
  );
}

function summarizePropRows(rows: SoccerPropSnapshotRow[]) {
  const byCategory = new Map<string, { label: string; rows: number; markets: Set<string> }>();

  for (const row of rows) {
    const existing = byCategory.get(row.category) ?? {
      label: getSoccerPropCategoryLabel(row.category),
      rows: 0,
      markets: new Set<string>(),
    };
    existing.rows += 1;
    existing.markets.add(row.marketLabel);
    byCategory.set(row.category, existing);
  }

  return Array.from(byCategory.values()).sort((a, b) => b.rows - a.rows);
}

function getFeaturedPropRows(rows: SoccerPropSnapshotRow[]) {
  const preferred = new Set([
    "player_shots_on_target_alternate",
    "player_shots_alternate",
    "alternate_totals_corners",
    "alternate_totals_cards",
    "player_goalie_saves_alternate",
    "player_to_receive_card",
  ]);

  return rows
    .filter((row) => preferred.has(row.marketKey))
    .sort((a, b) => {
      const gameCompare = a.gameLabel.localeCompare(b.gameLabel);
      if (gameCompare !== 0) return gameCompare;
      const marketCompare = a.marketLabel.localeCompare(b.marketLabel);
      if (marketCompare !== 0) return marketCompare;
      return (a.playerName ?? "").localeCompare(b.playerName ?? "");
    })
    .slice(0, 12);
}

function formatProfit(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  const amount = value * 100;
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(2)} per $100`;
}

function renderCoverageCard(candidate: SoccerCoverageCandidate) {
  const manualLegText =
    candidate.manualLegs.length === 2
      ? `${Math.round(candidate.manualLegs[0].stakeShare * 100)}% ${candidate.manualLegs[0].side} (${formatOdds(
          candidate.manualLegs[0].odds
        )}) / ${Math.round(candidate.manualLegs[1].stakeShare * 100)}% ${candidate.manualLegs[1].side} (${formatOdds(
          candidate.manualLegs[1].odds
        )})`
      : "Manual split unavailable";

  return (
    <div key={candidate.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-950">{candidate.label}</div>
          <div className="text-xs text-slate-500">{candidate.gameLabel}</div>
        </div>
        <div className="rounded-full border border-white bg-white px-3 py-1 text-xs font-semibold text-slate-700">
          {candidate.betterPrice === "double_chance"
            ? "Use Double Chance"
            : candidate.betterPrice === "manual_split"
              ? "Manual Split Better"
              : "Unavailable"}
        </div>
      </div>

      <div className="mt-3 grid gap-1">
        <div>
          <strong>Book:</strong> {candidate.bookSide ?? candidate.label} {formatOdds(candidate.bookOdds)}
          {candidate.bookProfitPerUnit !== null ? ` (${formatProfit(candidate.bookProfitPerUnit)})` : ""}
        </div>
        <div>
          <strong>Manual split:</strong> {manualLegText}
        </div>
        <div>
          <strong>Manual outcomes:</strong> {formatProfit(candidate.manualProfitIfFirstWins)} /{" "}
          {formatProfit(candidate.manualProfitIfSecondWins)}
        </div>
        <div>
          <strong>Loses if:</strong> {candidate.uncoveredOutcome}
        </div>
      </div>
    </div>
  );
}

export default async function SoccerPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; day?: string; syncStatus?: string; syncError?: string; syncMessage?: string }>;
}) {
  const params = await searchParams;
  const competition = normalizeSoccerCompetition(params.competition);
  const day: SoccerBoardDay = params.day === "yesterday" ? "yesterday" : "today";
  const propCategories = Object.keys(SOCCER_PROP_CATEGORY_LABELS) as SoccerPropCategoryKey[];
  const [resolvedOdds, isOwner] = await Promise.all([
    getResolvedSoccerOddsCache(competition, day),
    isOwnerLoggedIn(),
  ]);
  const cachedOdds = resolvedOdds.active;
  const boardDate = cachedOdds?.businessDate ?? resolvedOdds.expectedBusinessDate;
  const games = (cachedOdds?.data ?? []) as SoccerOddsGame[];
  const evaluatedGames = evaluateSoccerGames(games, competition).sort(
    (a, b) => new Date(a.game.commence_time).getTime() - new Date(b.game.commence_time).getTime()
  );
  const propSnapshotRow =
    boardDate
      ? await getCachedData(getSoccerPropSnapshotCacheKey(competition, boardDate))
      : null;
  const propSnapshot = (propSnapshotRow?.data as SoccerPropSnapshot | null) ?? null;
  const propRows = propSnapshot?.rows ?? [];
  const coverageCandidates = propSnapshot?.coverageCandidates ?? [];
  const propSummary = summarizePropRows(propRows);
  const featuredPropRows = getFeaturedPropRows(propRows);
  const currentEventIds = games.map((game) => game.id);
  const supabase = getSupabaseServer();
  const pickRowsResult =
    boardDate
      ? await supabase
          .from("picks")
          .select(SOCCER_PICK_SELECT)
          .eq("pick_date", boardDate)
          .eq("sport", "SOCCER")
          .eq("market_scope", "team")
          .order("is_top_pick", { ascending: false })
          .order("top_pick_rank", { ascending: true })
          .order("edge", { ascending: false })
      : { data: [] as SavedSoccerPick[] };
  const competitionName = getSoccerDisplayCompetition(competition);
  const currentEventIdSet = new Set(currentEventIds);
  const savedPicks = ((pickRowsResult.data ?? []) as SavedSoccerPick[]).filter((pick) =>
    currentEventIdSet.size > 0
      ? Boolean(pick.external_event_id && currentEventIdSet.has(pick.external_event_id))
      : Boolean(pick.edge_label?.includes(competitionName))
  );
  const topPicks = savedPicks
    .filter((pick) => pick.is_top_pick)
    .sort((a, b) => (a.top_pick_rank ?? 99) - (b.top_pick_rank ?? 99));
  const bestValuePicks = savedPicks
    .filter((pick) => pick.notes === "best_value")
    .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
  const competitionLabel = competitionName;

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <section className="mb-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="app-card rounded-[2rem] p-6 md:p-8">
          <div className="app-eyebrow">World Cup first, MLS underneath</div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            Soccer Board
          </h1>
          <p className="mt-4 max-w-3xl text-base text-slate-600 md:text-lg">
            A tournament-aware soccer board for World Cup prices, MLS continuity, old tournament data,
            player form, lineup chemistry, manager tendencies, and market movement.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#live-board" className="app-button app-button-primary inline-flex items-center justify-center">
              Live board
            </a>
            <a href="#world-cup" className="app-button app-button-secondary inline-flex items-center justify-center">
              Model lanes
            </a>
            <Link href="/picks?sport=SOCCER" className="app-button app-button-secondary inline-flex items-center justify-center">
              Pick tracker
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          {SOCCER_COMPETITIONS.map((item) => (
            <Link
              key={item.key}
              href={buildHref(item.key, day)}
              className="rounded-3xl border border-white/60 bg-white/75 p-5 shadow-sm backdrop-blur hover:-translate-y-0.5"
            >
              <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${competitionTone[item.key]}`}>
                {competition === item.key ? "Active" : item.status}
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-slate-950">{item.label}</h2>
              <p className="mt-2 text-sm text-slate-600">{item.emphasis}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="live-board" className="mb-8 rounded-3xl border border-white/60 bg-white/78 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="app-eyebrow">{competitionLabel} live model</div>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">Official Soccer Board</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Draw-aware pricing from DraftKings odds, team profile ratings, tournament stage behavior,
              projected score distributions, and EV-based Top Pick / Best Value selection.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["today", "yesterday"] as const).map((option) => (
              <Link
                key={option}
                href={buildHref(competition, option)}
                className={
                  day === option
                    ? "app-pill app-pill-active inline-flex rounded-full px-4 py-2 text-sm font-semibold"
                    : "app-pill inline-flex rounded-full px-4 py-2 text-sm font-medium text-slate-700"
                }
              >
                {option === "today" ? "Today" : "Yesterday"}
              </Link>
            ))}
          </div>
        </div>

        {params.syncStatus === "done" ? (
          <div className="mt-5 rounded-2xl border border-emerald-700/15 bg-emerald-600/10 px-4 py-3 text-sm font-medium text-emerald-900">
            {params.syncMessage ?? "Soccer sync finished."}
          </div>
        ) : params.syncStatus === "error" ? (
          <div className="mt-5 rounded-2xl border border-rose-700/15 bg-rose-600/10 px-4 py-3 text-sm font-medium text-rose-900">
            {params.syncError ?? "Soccer sync failed."}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {isOwner ? (
            day === "today" ? (
              <>
                <SyncButton
                  label={`Sync ${competitionLabel} Odds`}
                  endpoint={`/api/sync-soccer-odds?competition=${competition}&day=${day}`}
                  description="Loads the soccer slate, caches odds, scores the model, and rebuilds Top Picks + Best Value."
                />
                <SyncButton
                  label="Rebuild Soccer Picks"
                  endpoint={`/api/sync-soccer-top-picks?competition=${competition}&day=${day}`}
                  description="Re-runs the draw-aware model from the cached soccer odds without fetching new prices."
                />
                <SyncButton
                  label="Sync Soccer Prop Lab"
                  endpoint={`/api/sync-soccer-props?competition=${competition}&day=${day}`}
                  description="Collects shots, corners, cards, keeper saves, tackles, fouls, goalscorer, BTTS, DNB, and double chance lines for shadow learning."
                />
              </>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600 md:col-span-2">
                Yesterday is saved board history for {boardDate}. Switch to Today to sync a live soccer slate.
              </div>
            )
          ) : (
            <Link href="/login" className="app-button app-button-secondary inline-flex items-center justify-center md:col-span-2">
              Login to sync soccer board
            </Link>
          )}
        </div>

        {!cachedOdds && savedPicks.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50/75 p-6 text-sm text-slate-600">
            {day === "yesterday" ? (
              <>
                No saved {competitionLabel} picks for yesterday&apos;s betting day <strong>{boardDate}</strong> yet.
              </>
            ) : (
              <>
                No cached {competitionLabel} odds for betting day <strong>{boardDate}</strong> yet.
                Use the sync control to load the slate and build the first soccer board.
              </>
            )}
          </div>
        ) : (
          <div className="mt-6 grid gap-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/75 px-4 py-3 text-sm text-slate-700">
              {cachedOdds ? (
                <>
                  Cached betting day <strong>{cachedOdds.businessDate}</strong> with <strong>{games.length}</strong> match(es).
                  {day === "today" && resolvedOdds.usedTomorrowFallback
                    ? " Using the preloaded slate because it matches today's betting day."
                    : null}
                </>
              ) : (
                <>
                  Saved betting day <strong>{boardDate}</strong> with <strong>{savedPicks.length}</strong> pick(s).
                </>
              )}
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div>
                <h3 className="mb-3 text-2xl font-semibold text-slate-950">Top Picks</h3>
                <div className="grid gap-4">
                  {topPicks.length > 0 ? (
                    topPicks.map((pick) => renderPickCard(pick, `Top Pick #${pick.top_pick_rank ?? ""}`))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/75 p-5 text-sm text-slate-600">
                      No qualifying top picks yet. The model may be waiting for a cleaner edge or a fuller slate.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-2xl font-semibold text-slate-950">Best Value</h3>
                <div className="grid gap-4">
                  {bestValuePicks.length > 0 ? (
                    bestValuePicks.map((pick) => renderPickCard(pick, "Best Value"))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/75 p-5 text-sm text-slate-600">
                      No separate best-value plays yet. The board avoids forcing long shots when the price is not there.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mb-8 rounded-3xl border border-white/60 bg-white/78 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="app-eyebrow">Shadow learning</div>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">Soccer Prop Lab</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              This is where shots, shots on target, corners, cards, saves, tackles, fouls, goalscorers,
              BTTS, DNB, and double chance start getting captured every slate before we trust them as official picks.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
            {propRows.length} tracked lines
          </div>
        </div>

        {!propSnapshot ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50/75 p-5 text-sm text-slate-600">
            {day === "yesterday" ? (
              <>No prop-lab snapshot saved for yesterday&apos;s {competitionLabel} slate.</>
            ) : (
              <>
                No prop-lab snapshot yet for this slate. Run <strong>Sync Soccer Prop Lab</strong> after syncing odds.
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/75 px-4 py-3 text-sm text-slate-700">
              Snapshot captured <strong>{formatKickoff(propSnapshot.capturedAt)}</strong> across{" "}
              <strong>{propSnapshot.games.length}</strong> match(es), with{" "}
              <strong>{Array.from(new Set(propRows.map((row) => row.marketKey))).length}</strong> market type(s).
              {coverageCandidates.length > 0 ? ` ${coverageCandidates.length} coverage structures were priced.` : ""}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {propSummary.map((summary) => (
                <div key={summary.label} className="rounded-2xl border border-slate-200 bg-white/78 p-4">
                  <div className="text-sm font-semibold text-slate-950">{summary.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">{summary.rows}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {summary.markets.size} market type{summary.markets.size === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <h3 className="text-xl font-semibold text-slate-950">Coverage Bets</h3>
              <p className="mt-1 text-sm text-slate-600">
                These compare book double-chance prices against a manual split across two exact outcomes.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {coverageCandidates.length > 0 ? (
                  coverageCandidates.slice(0, 8).map(renderCoverageCard)
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/75 p-5 text-sm text-slate-600">
                    No double-chance or manual split coverage structures were available in this snapshot.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-xl font-semibold text-slate-950">Featured Tracked Lines</h3>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {featuredPropRows.length > 0 ? (
                  featuredPropRows.map((row) => (
                    <div key={row.snapshotId} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-950">{row.playerName ?? row.gameLabel}</div>
                          <div className="text-xs text-slate-500">{row.gameLabel}</div>
                        </div>
                        <div className="rounded-full border border-white bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                          {row.marketLabel}
                        </div>
                      </div>
                      <div className="mt-3">
                        <strong>{row.side}</strong> at {formatOdds(row.price)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/75 p-5 text-sm text-slate-600">
                    Snapshot exists, but none of the preferred prop markets returned lines yet.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {evaluatedGames.length > 0 ? (
        <section className="mb-8">
          <div className="mb-5">
            <div className="app-eyebrow">Modeled slate</div>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">Match Cards</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {evaluatedGames.map((item) => (
              <div key={item.game.id} className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {formatKickoff(item.game.commence_time)}
                    </div>
                    <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                      {item.game.away_team} @ {item.game.home_team}
                    </h3>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    {item.bookmakerTitle}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Home</div>
                    <div className="mt-1 font-semibold text-slate-950">{formatPercent(item.homeWinProbability)}</div>
                    <div className="text-xs text-slate-500">{formatOdds(item.marketHomeMoneyline)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Draw</div>
                    <div className="mt-1 font-semibold text-slate-950">{formatPercent(item.drawProbability)}</div>
                    <div className="text-xs text-slate-500">{formatOdds(item.marketDrawMoneyline)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Away</div>
                    <div className="mt-1 font-semibold text-slate-950">{formatPercent(item.awayWinProbability)}</div>
                    <div className="text-xs text-slate-500">{formatOdds(item.marketAwayMoneyline)}</div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white/78 px-4 py-3 text-sm text-slate-700">
                  <strong>Projected score:</strong> {item.game.away_team} {item.projectedAwayScore.toFixed(2)} - {item.game.home_team} {item.projectedHomeScore.toFixed(2)}
                  <span className="text-slate-500"> | total {item.projectedTotal.toFixed(2)}</span>
                </div>

                {item.bestCandidate ? (
                  <div className="mt-4 rounded-2xl border border-emerald-700/15 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-950">
                    <strong>Best model look:</strong> {item.bestCandidate.side} ({formatMarketType(item.bestCandidate.marketType)}) at{" "}
                    {formatOdds(item.bestCandidate.oddsTaken)} with {item.bestCandidate.edge}% EV.
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/75 px-4 py-3 text-sm text-slate-600">
                    No qualified edge after price, probability, and risk filters.
                  </div>
                )}

                <div className="mt-4 grid gap-2">
                  {item.modelNotes.map((note) => (
                    <div key={note} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section id="world-cup" className="mb-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="app-eyebrow">World Cup model</div>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">Signal Lanes</h2>
          </div>
          <div className="rounded-full border border-slate-200 bg-white/78 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
            2026 window: June 11 - July 19
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {SOCCER_WORLD_CUP_SIGNAL_LANES.map((lane) => (
            <div key={lane.title} className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
              <h3 className="text-xl font-semibold text-slate-950">{lane.title}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {lane.markets.map((market) => (
                  <span key={market} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
                    {market}
                  </span>
                ))}
              </div>
              <div className="mt-5 space-y-2">
                {lane.modelInputs.map((input) => (
                  <div key={input} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                    {input}
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm text-slate-600">{lane.caution}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
          <div className="app-eyebrow">Team markets</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Price Pool</h2>
          <p className="mt-2 text-sm text-slate-600">
            Soccer needs draw-aware markets before it tries to act like an NBA or MLB board.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {SOCCER_TEAM_MARKETS.map((market) => (
              <div key={market.key} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                {market.label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
          <div className="app-eyebrow">Player and match props</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Prop Pool</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {propCategories.map((category) => (
              <div key={category} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {SOCCER_PROP_CATEGORY_LABELS[category]}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {getMarketsByCategory(category).map((market) => (
                    <span key={market.key} className="rounded-full border border-white bg-white px-3 py-1 text-sm font-medium text-slate-700">
                      {market.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="data" className="mb-8">
        <div className="mb-5">
          <div className="app-eyebrow">Historical and live data</div>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">Data Engine</h2>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {SOCCER_DATA_LAYERS.map((layer) => (
            <div key={layer.title} className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
              <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone[layer.priority]}`}>
                {layer.priority === "core" ? "Core" : layer.priority === "high" ? "High priority" : "Watch"}
              </div>
              <h3 className="mt-4 text-xl font-semibold text-slate-950">{layer.title}</h3>
              <div className="mt-4 space-y-2">
                {layer.items.map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {SOCCER_MODEL_READINESS_TRACKS.map((track) => (
          <div key={track.title} className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
            <h2 className="text-2xl font-semibold text-slate-950">{track.title}</h2>
            <div className="mt-5 space-y-2">
              {track.items.map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-sm backdrop-blur">
        <div className="app-eyebrow">Relevant angles</div>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">What The Model Should Care About</h2>
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {SOCCER_RELEVANT_IDEAS.map((track) => (
            <div key={track.title} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
              <h3 className="text-lg font-semibold text-slate-950">{track.title}</h3>
              <div className="mt-4 space-y-2">
                {track.items.map((item) => (
                  <div key={item} className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
