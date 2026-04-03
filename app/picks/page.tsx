async function getPicks() {
  const res = await fetch("http://localhost:3000/api/picks", {
    cache: "no-store",
  });
  return res.json();
}

type SavedPick = {
  id: number;
  game_label: string;
  status: string;
  pick_date: string;
  sport: string;
  market_scope: string;
  market_type: string;
  side: string;
  line_taken?: number | null;
  odds_taken: number;
  stake_units: number;
  edge_label?: string | null;
  edge?: number | null;
  top_pick_rank?: number | null;
  final_score?: string | null;
  units_result?: number | null;
  locked_at?: string | null;
};

function getResultColor(status: string) {
  if (status === "win") return "text-green-700";
  if (status === "loss") return "text-red-700";
  if (status === "push") return "text-yellow-700";
  return "text-gray-700";
}

function formatEdge(value: number | null | undefined, sport: string, marketType: string) {
  if (value === null || value === undefined) return "N/A";
  if (sport !== "MLB") return `${value}`;
  if (marketType === "moneyline") return `${value}% win probability`;
  if (marketType === "spread") return `${value} runs`;
  if (marketType === "total") return `${value} runs`;
  return `${value}`;
}

export default async function PicksPage() {
  const picks = await getPicks();
  const rows = (picks.data ?? []) as SavedPick[];

  return (
    <main className="max-w-6xl mx-auto p-8">
      <div className="app-card rounded-[2rem] p-8 mb-6">
        <div className="inline-flex items-center rounded-full border border-teal-700/15 bg-white/75 px-3 py-1 text-sm font-medium text-teal-900 mb-3">
          Pick ledger
        </div>
        <h1 className="text-4xl font-semibold text-slate-950 mb-2">All Saved Picks</h1>
        <p className="text-slate-600 max-w-2xl">
          Review every saved wager in one place, with status, signals, and ranking details for both leagues.
        </p>
      </div>

      <div className="space-y-4">
        {rows.map((pick) => (
          <div key={pick.id} className="app-panel rounded-3xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold text-slate-950">{pick.game_label}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {pick.locked_at && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
                    Locked
                  </span>
                )}
                <span className={`rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 ${getResultColor(pick.status)}`}>{pick.status}</span>
              </div>
            </div>

            <div className="grid gap-2 text-slate-700">
              <p><strong>Date:</strong> {pick.pick_date}</p>
              <p><strong>Sport:</strong> {pick.sport}</p>
              <p><strong>Market:</strong> {pick.market_scope} / {pick.market_type}</p>
              <p><strong>Pick:</strong> {pick.side}</p>
              <p><strong>Line Taken:</strong> {pick.line_taken ?? "N/A"}</p>
              <p><strong>Odds:</strong> {pick.odds_taken}</p>
              <p><strong>Stake:</strong> {pick.stake_units}u</p>
              <p><strong>Signal:</strong> {pick.edge_label ?? "N/A"}</p>
              <p><strong>Edge:</strong> {formatEdge(pick.edge, pick.sport, pick.market_type)}</p>
              <p><strong>Top Pick Rank:</strong> {pick.top_pick_rank ?? "N/A"}</p>
              <p><strong>Final Score:</strong> {pick.final_score ?? "Pending"}</p>
              <p><strong>Units Result:</strong> {pick.units_result !== null ? `${Number(pick.units_result).toFixed(2)}u` : "Pending"}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
