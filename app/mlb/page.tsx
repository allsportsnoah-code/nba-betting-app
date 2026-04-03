import Link from "next/link";
import SyncButton from "@/app/dashboard/SyncButton";
import { getCachedData } from "@/lib/cache";
import { evaluateMlbGames, type EvaluatedMlbGame, type MlbOddsGame } from "@/lib/mlbModel";
import {
  buildMlbCandidates,
  rankBestValueCandidates,
  rankTopHitRateCandidates,
  type MlbCandidate,
} from "@/lib/mlbPickRanking";
import { mlbParkFactors, mlbTeamRatings } from "@/lib/mlbRatings";
import { getConfidenceLabel, getConfidenceStars } from "@/lib/starRatings";
import { americanToProfitPerUnit } from "@/lib/units";
import { getManualSyncLimit, getManualSyncUsage, isOwnerLoggedIn } from "@/lib/ownerAuth";

export default async function MlbPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const day = params.day === "tomorrow" ? "tomorrow" : "today";
  const cachedOddsRow = await getCachedData(`mlb_odds_${day}`);
  const cachedOdds = (cachedOddsRow?.data as { businessDate?: string; data?: MlbOddsGame[] } | null) ?? null;
  const evaluatedGames = evaluateMlbGames(cachedOdds?.data ?? [], mlbTeamRatings, mlbParkFactors);
  const now = new Date();
  const pregameGames = evaluatedGames.filter((item) => new Date(item.game.commence_time) > now);
  const candidates = buildMlbCandidates(evaluatedGames, now);
  const topHitRatePicks = rankTopHitRateCandidates(candidates).slice(0, 3);
  const bestValuePicks = rankBestValueCandidates(candidates).slice(0, 3);
  const isOwner = await isOwnerLoggedIn();
  const manualUsage = isOwner ? await getManualSyncUsage() : null;
  const manualLimit = getManualSyncLimit();

  function getSignalColor(signal: string) {
    if (signal.includes("Home") || signal.includes("Over")) return "text-green-700 font-semibold";
    if (signal.includes("Away") || signal.includes("Under")) return "text-blue-700 font-semibold";
    if (signal === "Pass") return "text-gray-600";
    return "text-red-700";
  }

  function formatPotentialPayout(odds: number | null | undefined) {
    if (odds === null || odds === undefined) return "N/A";
    return `${americanToProfitPerUnit(odds).toFixed(2)}u`;
  }

  function formatEdge(value: number | null | undefined, marketType: "moneyline" | "spread" | "total") {
    if (value === null || value === undefined) return "N/A";
    if (marketType === "moneyline") return `${value}% win probability`;
    if (marketType === "spread") return `${value} runs`;
    return `${value} runs`;
  }

  function renderCandidateCard(candidate: MlbCandidate, rank: number, label: string) {
    return (
      <div key={`${label}-${candidate.game.id}-${candidate.marketType}`} className="app-panel rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-1">{label} #{rank}</div>
            <h3 className="text-xl font-semibold text-slate-950">
              {candidate.game.away_team} @ {candidate.game.home_team}
            </h3>
          </div>
          <div className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-sm font-medium text-slate-700">
            {getConfidenceLabel(candidate.confidenceScore / 20)}
          </div>
        </div>

        <div className="space-y-1 text-slate-700">
          <p>
            <strong>Pick:</strong> {candidate.side}
          </p>
          <p>
            <strong>Market:</strong> {candidate.marketType}
          </p>
          <p>
            <strong>Current odds:</strong> {candidate.oddsTaken}
          </p>
          <p>
            <strong>Potential payout:</strong> {formatPotentialPayout(candidate.oddsTaken)}
          </p>
          <p>
            <strong>Predicted score:</strong> {candidate.game.away_team} {candidate.projectedAwayScore} -{" "}
            {candidate.game.home_team} {candidate.projectedHomeScore}
          </p>
          <p>
            <strong>Signal:</strong> {candidate.edgeLabel}
          </p>
          <p>
            <strong>Edge:</strong> {formatEdge(candidate.edge, candidate.marketType)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-8">
      <div className="app-card rounded-[2rem] p-8 mb-6">
        <div className="inline-flex items-center rounded-full border border-sky-700/15 bg-white/75 px-3 py-1 text-sm font-medium text-sky-900 mb-3">
          Baseball model board
        </div>
        <h1 className="text-4xl font-semibold text-slate-950 mb-2">MLB Dashboard</h1>
        <p className="text-slate-600">
          Team-based MLB slate model for moneyline, run line, and totals.
        </p>
        {cachedOdds?.businessDate && (
          <p className="text-sm text-slate-600 mt-2">
            Betting day: {cachedOdds.businessDate} (rolls over at 5:00 AM ET)
          </p>
        )}
      </div>

      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex gap-2">
          <Link
            href={`/mlb?day=today`}
            className={`app-pill px-4 py-2 rounded-full ${
              day === "today" ? "app-pill-active" : "text-slate-800"
            }`}
          >
            Today
          </Link>
          <Link
            href={`/mlb?day=tomorrow`}
            className={`app-pill px-4 py-2 rounded-full ${
              day === "tomorrow" ? "app-pill-active" : "text-slate-800"
            }`}
          >
            Tomorrow
          </Link>
        </div>

        {isOwner && (
          <div className="flex gap-3 flex-wrap">
            <SyncButton label="Sync MLB Odds" endpoint={`/api/sync-mlb-odds?day=${day}`} />
            <SyncButton
              label="Sync MLB Top Picks"
              endpoint={`/api/sync-mlb-top-picks?day=${day}`}
              description={`Manual syncs today: ${manualUsage?.count ?? 0}/${manualLimit}`}
            />
            <SyncButton label="Grade Results" endpoint="/api/grade-picks" />
          </div>
        )}
      </div>

      {!cachedOdds ? (
        <div className="app-panel rounded-3xl p-5">
          No cached MLB odds yet. Click <strong>Sync MLB Odds</strong> to load tonight&apos;s slate.
        </div>
      ) : pregameGames.length === 0 ? (
        <div className="app-panel rounded-3xl p-5">No pregame MLB games found for this slate.</div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2 mb-8">
            <section>
              <div className="app-card rounded-[2rem] p-6 h-full">
                <div className="inline-flex items-center rounded-full border border-emerald-700/15 bg-white/70 px-3 py-1 text-sm font-medium text-emerald-900 mb-3">
                  Built to cash more often
                </div>
                <h2 className="text-2xl font-semibold text-slate-950 mb-2">Top Picks</h2>
                <p className="text-slate-600 mb-4">
                  These now lean toward stronger hit-rate profiles: high-confidence picks with better chances to cash and still reasonable payout.
                </p>
                <div className="space-y-4">
                  {topHitRatePicks.map((candidate, index) =>
                    renderCandidateCard(candidate, index + 1, "Top Pick")
                  )}
                </div>
              </div>
            </section>

            <section>
              <div className="app-card rounded-[2rem] p-6 h-full">
                <div className="inline-flex items-center rounded-full border border-sky-700/15 bg-white/70 px-3 py-1 text-sm font-medium text-sky-900 mb-3">
                  Bigger pricing mistakes
                </div>
                <h2 className="text-2xl font-semibold text-slate-950 mb-2">Best Value</h2>
                <p className="text-slate-600 mb-4">
                  These are the strongest raw value spots, even if they are a little swingier than the main top-pick board.
                </p>
                <div className="space-y-4">
                  {bestValuePicks.map((candidate, index) =>
                    renderCandidateCard(candidate, index + 1, "Value Pick")
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            {pregameGames.map((item: EvaluatedMlbGame) => (
              <div key={item.game.id} className="app-panel rounded-3xl p-5">
              <h2 className="text-xl font-semibold text-slate-950">
                {item.game.away_team} @ {item.game.home_team}
              </h2>

              <p className="text-sm text-slate-500 mb-3">
                {new Date(item.game.commence_time).toLocaleString()}
              </p>

              {item.missingModel ? (
                <div className="text-red-700">
                  Missing MLB ratings for one of these teams, so this game cannot be modeled yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-3xl border border-slate-200/80 bg-white/72 p-5 shadow-sm">
                    <h3 className="font-semibold text-slate-950 mb-3">Moneyline</h3>
                    <div className="text-slate-700">
                      <strong>Market:</strong> {item.game.home_team} {item.marketHomeMoneyline} /{" "}
                      {item.game.away_team} {item.marketAwayMoneyline}
                    </div>
                    <div className="text-slate-700">
                      <strong>Fair:</strong> {item.game.home_team} {item.fairHomeMoneyline} /{" "}
                      {item.game.away_team} {item.fairAwayMoneyline}
                    </div>
                    <div className="text-slate-700">
                      <strong>Home win %:</strong> {(item.homeWinProb * 100).toFixed(1)}%
                    </div>
                    <div className="text-slate-700">
                      <strong>Current odds:</strong>{" "}
                      {item.moneylineSignal?.includes("Home")
                        ? item.marketHomeMoneyline
                        : item.marketAwayMoneyline}
                    </div>
                    <div className="text-slate-700">
                      <strong>Potential payout:</strong>{" "}
                      {formatPotentialPayout(
                        item.moneylineSignal?.includes("Home")
                          ? item.marketHomeMoneyline
                          : item.marketAwayMoneyline
                      )}
                    </div>
                    <div className={getSignalColor(item.moneylineSignal)}>
                      <strong>Signal:</strong> {item.moneylineSignal}
                    </div>
                    <div className={getSignalColor(item.moneylineSignal)}>
                      <strong>Edge:</strong> {formatEdge(item.moneylineEdgePercent, "moneyline")}
                    </div>
                    <div className="text-slate-700">
                      <strong>Confidence:</strong>{" "}
                      {getConfidenceLabel(
                        getConfidenceStars({
                          sport: "MLB",
                          marketType: "moneyline",
                          edge: item.moneylineEdgePercent,
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200/80 bg-white/72 p-5 shadow-sm">
                    <h3 className="font-semibold text-slate-950 mb-3">Run Line</h3>
                    <div className="text-slate-700">
                      <strong>Market:</strong> {item.game.home_team} {item.marketHomeRunLine} (
                      {item.homeRunLinePrice}) / {item.game.away_team} {item.marketAwayRunLine} (
                      {item.awayRunLinePrice})
                    </div>
                    <div className="text-slate-700">
                      <strong>Projected margin:</strong> {item.projectedMargin}
                    </div>
                    <div className="text-slate-700">
                      <strong>Current odds:</strong>{" "}
                      {item.runLineSignal?.includes("Home")
                        ? item.homeRunLinePrice
                        : item.awayRunLinePrice}
                    </div>
                    <div className="text-slate-700">
                      <strong>Potential payout:</strong>{" "}
                      {formatPotentialPayout(
                        item.runLineSignal?.includes("Home")
                          ? item.homeRunLinePrice
                          : item.awayRunLinePrice
                      )}
                    </div>
                    <div className={getSignalColor(item.runLineSignal)}>
                      <strong>Signal:</strong> {item.runLineSignal}
                    </div>
                    <div className={getSignalColor(item.runLineSignal)}>
                      <strong>Edge:</strong> {formatEdge(item.runLineEdge, "spread")}
                    </div>
                    <div className="text-slate-700">
                      <strong>Confidence:</strong>{" "}
                      {getConfidenceLabel(
                        getConfidenceStars({
                          sport: "MLB",
                          marketType: "spread",
                          edge: item.runLineEdge,
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200/80 bg-white/72 p-5 shadow-sm">
                    <h3 className="font-semibold text-slate-950 mb-3">Total</h3>
                    <div className="text-slate-700">
                      <strong>Market total:</strong> {item.marketTotal} (Over {item.overPrice} / Under{" "}
                      {item.underPrice})
                    </div>
                    <div className="text-slate-700">
                      <strong>Projected total:</strong> {item.projectedTotal}
                    </div>
                    <div className="text-slate-700">
                      <strong>Current odds:</strong>{" "}
                      {item.totalSignal?.includes("Over") ? item.overPrice : item.underPrice}
                    </div>
                    <div className="text-slate-700">
                      <strong>Potential payout:</strong>{" "}
                      {formatPotentialPayout(
                        item.totalSignal?.includes("Over") ? item.overPrice : item.underPrice
                      )}
                    </div>
                    <div className={getSignalColor(item.totalSignal)}>
                      <strong>Signal:</strong> {item.totalSignal}
                    </div>
                    <div className={getSignalColor(item.totalSignal)}>
                      <strong>Edge:</strong> {formatEdge(item.totalEdge, "total")}
                    </div>
                    <div className="text-slate-700">
                      <strong>Confidence:</strong>{" "}
                      {getConfidenceLabel(
                        getConfidenceStars({
                          sport: "MLB",
                          marketType: "total",
                          edge: item.totalEdge,
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!item.missingModel && (
                <div className="mt-4 rounded-2xl bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                  <strong>Projected score:</strong> {item.game.away_team} {item.projectedAwayRuns} -{" "}
                  {item.game.home_team} {item.projectedHomeRuns}
                </div>
              )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
