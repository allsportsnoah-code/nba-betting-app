import Link from "next/link";
import SyncButton from "./SyncButton";
import { getCachedData } from "@/lib/cache";
import { americanToImpliedProb, evaluateTeamGames } from "@/lib/teamModel";
import { getConfidenceLabel, getConfidenceStars } from "@/lib/starRatings";
import { getManualSyncLimit, getManualSyncUsage, isOwnerLoggedIn } from "@/lib/ownerAuth";

function getEdgeColor(edge: number | null) {
  if (edge === null) return "text-gray-700";
  if (Math.abs(edge) >= 10) return "text-red-700 font-semibold";
  if (Math.abs(edge) >= 5) return "text-yellow-700 font-semibold";
  if (Math.abs(edge) >= 1.5) return "text-green-700 font-semibold";
  return "text-gray-700";
}

function formatSpread(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatProjectedScore(
  homeTeam: string,
  awayTeam: string,
  homeScore: number | null,
  awayScore: number | null
) {
  if (homeScore === null || awayScore === null) return "N/A";
  return `${awayTeam} ${awayScore} • ${homeTeam} ${homeScore}`;
}

async function getSavedTopPicks(day: string) {
  const res = await fetch(`http://localhost:3000/api/top-picks?day=${day}`, {
    cache: "no-store",
  });
  return res.json();
}

function getStarText(stars: number) {
  return getConfidenceLabel(stars);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; view?: string; propType?: string }>;
}) {
  const params = await searchParams;
  const day = params.day === "tomorrow" ? "tomorrow" : "today";
  const view = params.view === "teams" || params.view === "props" ? params.view : "top";
  const propType =
    params.propType === "rebounds" ||
    params.propType === "assists" ||
    params.propType === "pra"
      ? params.propType
      : "points";

  const cachedTeamOddsRow = await getCachedData(`team_odds_${day}`);
  const cachedPropsRow = await getCachedData(`props_${day}_${propType}`);
  const officialTopPicks = await getSavedTopPicks(day);
  const isOwner = await isOwnerLoggedIn();
  const manualUsage = isOwner ? await getManualSyncUsage() : null;
  const manualLimit = getManualSyncLimit();

  const cachedTeamOdds = cachedTeamOddsRow?.data ?? null;
  const cachedProps = cachedPropsRow?.data ?? null;
  const evaluatedGames = evaluateTeamGames(cachedTeamOdds?.data ?? []);

  const now = new Date();

  const pregameGames = evaluatedGames.filter(
    (item: any) => new Date(item.game.commence_time) > now
  );

  const startedGames = evaluatedGames.filter(
    (item: any) => new Date(item.game.commence_time) <= now
  );

  return (
    <main className="max-w-6xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Main Betting Dashboard</h1>
          {cachedTeamOdds?.businessDate && (
            <p className="text-sm text-gray-600 mt-1">
              Betting day: {cachedTeamOdds.businessDate} (rolls over at 5:00 AM ET)
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Link
            href={`/dashboard?day=today&view=${view}&propType=${propType}`}
            className={`px-4 py-2 rounded-lg border ${
              day === "today" ? "bg-black text-white" : "bg-white text-black"
            }`}
          >
            Today
          </Link>
          <Link
            href={`/dashboard?day=tomorrow&view=${view}&propType=${propType}`}
            className={`px-4 py-2 rounded-lg border ${
              day === "tomorrow" ? "bg-black text-white" : "bg-white text-black"
            }`}
          >
            Tomorrow
          </Link>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        <Link
          href={`/dashboard?day=${day}&view=top&propType=${propType}`}
          className={`px-4 py-2 rounded-lg border ${
            view === "top" ? "bg-black text-white" : "bg-white text-black"
          }`}
        >
          Top Picks
        </Link>
        <Link
          href={`/dashboard?day=${day}&view=teams&propType=${propType}`}
          className={`px-4 py-2 rounded-lg border ${
            view === "teams" ? "bg-black text-white" : "bg-white text-black"
          }`}
        >
          Team Bets
        </Link>
        <Link
          href={`/dashboard?day=${day}&view=props&propType=${propType}`}
          className={`px-4 py-2 rounded-lg border ${
            view === "props" ? "bg-black text-white" : "bg-white text-black"
          }`}
        >
          Player Props
        </Link>
      </div>

      {isOwner && (
        <div className="mb-8">
          <div className="app-panel rounded-3xl p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Owner Sync Controls</h2>
                <p className="text-sm text-slate-600">
                  Manual credit-using syncs today: {manualUsage?.count ?? 0} / {manualLimit}
                </p>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <SyncButton label="Sync Team Odds" endpoint={`/api/sync-team-odds?day=${day}`} />
              <SyncButton label="Sync Top Picks" endpoint={`/api/sync-top-picks?day=${day}`} description="Uses cached odds only." />
              <SyncButton label="Grade Results" endpoint={`/api/grade-picks`} />
              {view === "props" && (
                <SyncButton
                  label={`Sync ${propType.toUpperCase()} Props`}
                  endpoint={`/api/sync-props?day=${day}&propType=${propType}`}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {view === "top" && (
        <>
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">Official Top 3 Picks</h2>
            <div className="grid gap-4">
              {(officialTopPicks.data ?? []).length === 0 ? (
                <div className="border rounded-xl p-4 bg-white">
                  No official top picks saved yet. Click <strong>Sync Team Odds</strong> then{" "}
                  <strong>Sync Top Picks</strong>.
                </div>
              ) : (
                (officialTopPicks.data ?? []).map((pick: any) => (
                  <div key={pick.id} className="border rounded-xl p-4 bg-white">
                    <div className="text-sm text-gray-500 mb-1">
                      Official Pick #{pick.top_pick_rank}
                    </div>
                    <h3 className="text-xl font-semibold">{pick.game_label}</h3>
                    <div className="mt-2">
                      <strong>Pick:</strong> {pick.side}
                    </div>
                    <div>
                      <strong>Line:</strong> {formatSpread(pick.line_taken)}
                    </div>
                    <div>
                      <strong>Odds:</strong> {pick.odds_taken}
                    </div>
                    <div>
                      <strong>Stake:</strong> {pick.stake_units}u
                    </div>
                    <div>
                      <strong>Predicted Score:</strong>{" "}
                      {formatProjectedScore(
                        pick.home_team,
                        pick.away_team,
                        pick.projected_home_score,
                        pick.projected_away_score
                      )}
                    </div>
                    <div className={getEdgeColor(pick.edge)}>
                      <strong>Signal:</strong> {pick.edge_label}
                    </div>
                    <div className={getEdgeColor(pick.edge)}>
                      <strong>Edge:</strong> {pick.edge}
                    </div>
                    <div>
                      <strong>Confidence:</strong>{" "}
                      {getStarText(
                        getConfidenceStars({
                          sport: "NBA",
                          marketType: pick.market_type,
                          edge: pick.edge,
                          confidenceScore: pick.confidence_score,
                        })
                      )}
                    </div>
                    <div>
                      <strong>Status:</strong> {pick.status}
                    </div>
                    {pick.final_score && (
                      <div>
                        <strong>Final Score:</strong> {pick.final_score}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">All Pregame Games Today</h2>

            {pregameGames.length === 0 ? (
              <div className="border rounded-xl p-4 bg-white">
                No pregame games left for this slate.
              </div>
            ) : (
              <div className="space-y-4">
                {pregameGames.map((item: any) => (
                  <div key={item.game.id} className="border rounded-xl p-4 bg-white">
                    <h2 className="text-xl font-semibold">
                      {item.game.away_team} @ {item.game.home_team}
                    </h2>

                    <p className="text-sm text-gray-500 mb-2">
                      {new Date(item.game.commence_time).toLocaleString()}
                    </p>

                    {item.moneyline && (
                      <div className="text-sm mb-2">
                        <strong>Moneyline:</strong>{" "}
                        {item.moneyline.outcomes.map((o: any) => (
                          <div key={o.name}>
                            {o.name}: {o.price} | Implied Win %:{" "}
                            {americanToImpliedProb(o.price).toFixed(1)}%
                          </div>
                        ))}
                      </div>
                    )}

                    {item.spreads && (
                      <div className="text-sm mb-2">
                        <strong>Spread:</strong>{" "}
                        {item.spreads.outcomes.map((o: any) => (
                          <span key={o.name} className="mr-3">
                            {o.name}: {formatSpread(o.point)} ({o.price})
                          </span>
                        ))}
                      </div>
                    )}

                    {item.totals && (
                      <div className="text-sm mb-2">
                        <strong>Total:</strong>{" "}
                        {item.totals.outcomes.map((o: any) => (
                          <span key={o.name} className="mr-3">
                            {o.name}: {o.point} ({o.price})
                          </span>
                        ))}
                      </div>
                    )}

                    {item.projectedHomeSpread !== null && (
                      <div className="text-sm mt-2 border-t pt-2">
                        <div>
                          <strong>Predicted Score:</strong>{" "}
                          {formatProjectedScore(
                            item.game.home_team,
                            item.game.away_team,
                            item.projectedHomeScore,
                            item.projectedAwayScore
                          )}
                        </div>
                        <div>
                          <strong>Your Projected Home Spread:</strong>{" "}
                          {formatSpread(item.projectedHomeSpread)}
                        </div>
                        <div>
                          <strong>Market Home Spread:</strong>{" "}
                          {formatSpread(item.marketHomeSpread)}
                        </div>
                        <div className={getEdgeColor(item.spreadEdge)}>
                          <strong>Edge:</strong> {item.spreadEdge ?? "N/A"}
                        </div>
                        <div>
                          <strong>Confidence:</strong>{" "}
                          {getStarText(
                            getConfidenceStars({
                              sport: "NBA",
                              marketType: "spread",
                              edge: item.spreadEdge,
                              confidenceScore: item.confidenceScore,
                            })
                          )}
                        </div>
                        <div className={getEdgeColor(item.spreadEdge)}>
                          <strong>Signal:</strong> {item.signal}
                        </div>
                        {item.officialSide && (
                          <div>
                            <strong>Official Lean:</strong> {item.officialSide}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {startedGames.length > 0 && (
            <section className="mt-10">
              <h2 className="text-2xl font-semibold mb-3">Started / Live Games</h2>
              <div className="space-y-4">
                {startedGames.map((item: any) => (
                  <div key={item.game.id} className="border rounded-xl p-4 bg-white">
                    <h2 className="text-xl font-semibold">
                      {item.game.away_team} @ {item.game.home_team}
                    </h2>
                    <p className="text-sm text-gray-500 mb-2">
                      {new Date(item.game.commence_time).toLocaleString()}
                    </p>
                    <div className="text-sm text-red-700 font-semibold">
                      Game has started. Pregame edge comparison is locked and no longer shown here.
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {view === "teams" && (
        <section>
          <h2 className="text-2xl font-semibold mb-3">Pregame Team Bets for {day}</h2>

          {pregameGames.length === 0 ? (
            <div className="border rounded-xl p-4 bg-white">
              No pregame games left for this slate.
            </div>
          ) : (
            <div className="space-y-4">
              {pregameGames.map((item: any) => (
                <div key={item.game.id} className="border rounded-xl p-4 bg-white">
                  <h2 className="text-xl font-semibold">
                    {item.game.away_team} @ {item.game.home_team}
                  </h2>

                  <p className="text-sm text-gray-500 mb-2">
                    {new Date(item.game.commence_time).toLocaleString()}
                  </p>

                  {item.moneyline && (
                    <div className="text-sm mb-2">
                      <strong>Moneyline:</strong>{" "}
                      {item.moneyline.outcomes.map((o: any) => (
                        <div key={o.name}>
                          {o.name}: {o.price} | Implied Win %:{" "}
                          {americanToImpliedProb(o.price).toFixed(1)}%
                        </div>
                      ))}
                    </div>
                  )}

                  {item.spreads && (
                    <div className="text-sm mb-2">
                      <strong>Spread:</strong>{" "}
                      {item.spreads.outcomes.map((o: any) => (
                        <span key={o.name} className="mr-3">
                          {o.name}: {formatSpread(o.point)} ({o.price})
                        </span>
                      ))}
                    </div>
                  )}

                  {item.totals && (
                    <div className="text-sm mb-2">
                      <strong>Total:</strong>{" "}
                      {item.totals.outcomes.map((o: any) => (
                        <span key={o.name} className="mr-3">
                          {o.name}: {o.point} ({o.price})
                        </span>
                      ))}
                    </div>
                  )}

                  {item.projectedHomeSpread !== null && (
                    <div className="text-sm mt-2 border-t pt-2">
                      <div>
                        <strong>Predicted Score:</strong>{" "}
                        {formatProjectedScore(
                          item.game.home_team,
                          item.game.away_team,
                          item.projectedHomeScore,
                          item.projectedAwayScore
                        )}
                      </div>
                      <div>
                        <strong>Your Projected Home Spread:</strong>{" "}
                        {formatSpread(item.projectedHomeSpread)}
                      </div>
                      <div>
                        <strong>Market Home Spread:</strong>{" "}
                        {formatSpread(item.marketHomeSpread)}
                      </div>
                      <div className={getEdgeColor(item.spreadEdge)}>
                        <strong>Edge:</strong> {item.spreadEdge ?? "N/A"}
                      </div>
                      <div>
                        <strong>Confidence:</strong>{" "}
                        {getStarText(
                          getConfidenceStars({
                            sport: "NBA",
                            marketType: "spread",
                            edge: item.spreadEdge,
                            confidenceScore: item.confidenceScore,
                          })
                        )}
                      </div>
                      <div className={getEdgeColor(item.spreadEdge)}>
                        <strong>Signal:</strong> {item.signal}
                      </div>
                      {item.officialSide && (
                        <div>
                          <strong>Official Lean:</strong> {item.officialSide}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {startedGames.length > 0 && (
            <div className="border rounded-xl p-4 bg-white mt-8">
              <strong>Started / Live games are hidden from pregame team-bet evaluation.</strong>
            </div>
          )}
        </section>
      )}

      {view === "props" && (
        <section>
          <h2 className="text-2xl font-semibold mb-3">Player Props</h2>

          <div className="flex gap-2 flex-wrap mb-4">
            {["points", "rebounds", "assists", "pra"].map((type) => (
              <Link
                key={type}
                href={`/dashboard?day=${day}&view=props&propType=${type}`}
                className={`px-4 py-2 rounded-lg border ${
                  propType === type ? "bg-black text-white" : "bg-white text-black"
                }`}
              >
                {type.toUpperCase()}
              </Link>
            ))}
          </div>

          {!cachedProps ? (
            <div className="border rounded-xl p-4 bg-white">
              No cached props yet. Click <strong>Sync {propType.toUpperCase()} Props</strong>.
            </div>
          ) : (
            <div className="space-y-4">
              {(cachedProps.data ?? []).map((prop: any, index: number) => (
                <div
                  key={`${prop.game_label}-${prop.player_name}-${prop.line}-${index}`}
                  className="border rounded-xl p-4 bg-white"
                >
                  <h4 className="text-lg font-semibold">{prop.game_label}</h4>
                  <div>
                    <strong>Player:</strong> {prop.player_name}
                  </div>
                  <div>
                    <strong>Line:</strong> {prop.line}
                  </div>
                  <div>
                    <strong>Over:</strong> {prop.over_odds ?? "N/A"}
                  </div>
                  <div>
                    <strong>Under:</strong> {prop.under_odds ?? "N/A"}
                  </div>
                  <div>
                    <strong>Official Side:</strong> {prop.official_side}
                  </div>
                  <div>
                    <strong>Official Odds:</strong> {prop.official_odds}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
