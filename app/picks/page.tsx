import {
  getMlbHistorySnapshot,
  isMlbSnapshotOfficialPick,
} from "@/lib/mlbHistorySnapshot";
import {
  getNbaHistorySnapshot,
  isNbaSnapshotOfficialPick,
} from "@/lib/nbaHistorySnapshot";
import { filterOfficialHistoricalPicks } from "@/lib/pickVisibility";
import { getPickStatusLabel, isPendingPickStatus, resolvePickStatus } from "@/lib/pickStatus";
import {
  getMlbPitcherPropDetails,
  type MlbPitcherPropDetails,
} from "@/lib/mlbPitcherPropDetails";
import { getServerRequestOrigin } from "@/lib/requestOrigin";

async function getPicks() {
  const origin = await getServerRequestOrigin();
  const res = await fetch(`${origin}/api/picks`, {
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
  home_team?: string | null;
  away_team?: string | null;
  player_name?: string | null;
  game_start_time?: string | null;
  side: string;
  line_taken?: number | null;
  odds_taken: number;
  stake_units: number;
  edge_label?: string | null;
  edge?: number | null;
  top_pick_rank?: number | null;
  is_top_pick?: boolean | null;
  notes?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  units_result?: number | null;
  locked_at?: string | null;
};

function formatStartTime(value: string | null | undefined) {
  if (!value) return "Time pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time pending";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getResultBadgeClass(status: string) {
  const resolvedStatus = resolvePickStatus(status);

  if (resolvedStatus === "win") return "rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-green-700";
  if (resolvedStatus === "loss") return "rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-medium text-red-700";
  if (resolvedStatus === "push") return "rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-sm font-medium text-yellow-800";
  return "rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 text-sm font-medium text-gray-700";
}

function formatEdge(value: number | null | undefined, sport: string, marketType: string) {
  if (value === null || value === undefined) return "Pregame edge unavailable";
  if (sport !== "MLB") return `${value}`;
  if (marketType === "moneyline") return `${value}% win probability`;
  if (marketType === "spread") return `${value} runs`;
  if (marketType === "total") return `${value} runs`;
  return `${value}`;
}

export default async function PicksPage() {
  const picks = await getPicks();
  const rawRows = filterOfficialHistoricalPicks((picks.data ?? []) as SavedPick[]);
  const mlbDates = Array.from(new Set(rawRows.filter((pick) => pick.sport === "MLB").map((pick) => pick.pick_date)));
  const nbaDates = Array.from(new Set(rawRows.filter((pick) => pick.sport === "NBA").map((pick) => pick.pick_date)));
  const snapshotByDate = new Map(
    await Promise.all(
      Array.from(new Set([...mlbDates, ...nbaDates])).map(async (pickDate) => [
        pickDate,
        {
          mlb: mlbDates.includes(pickDate) ? await getMlbHistorySnapshot(pickDate) : null,
          nba: nbaDates.includes(pickDate) ? await getNbaHistorySnapshot(pickDate) : null,
        },
      ] as const)
    )
  );
  const rows = rawRows.filter((pick) => {
    const snapshot = snapshotByDate.get(pick.pick_date);
    if (
      pick.sport === "MLB" &&
      (pick.market_scope === "team" || pick.market_scope === "player_prop") &&
      snapshot?.mlb
    ) {
      return isMlbSnapshotOfficialPick(snapshot.mlb, pick.id);
    }

    if (
      pick.sport === "NBA" &&
      (pick.market_scope === "team" || pick.market_scope === "player_prop") &&
      snapshot?.nba
    ) {
      return isNbaSnapshotOfficialPick(snapshot.nba, pick.id);
    }

    return true;
  });
  const pitcherStrikeoutRows = rows.filter(
    (pick) => pick.market_scope === "player_prop" && pick.market_type === "pitcher_strikeouts"
  );
  const pitcherPropDetailsById = new Map<number, MlbPitcherPropDetails>();

  for (const [index, details] of (
    await Promise.all(pitcherStrikeoutRows.map((pick) => getMlbPitcherPropDetails(pick)))
  ).entries()) {
    const pick = pitcherStrikeoutRows[index];
    if (pick?.id && details) {
      pitcherPropDetailsById.set(pick.id, details);
    }
  }

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <div className="app-card rounded-[2rem] p-8 mb-6">
        <div className="inline-flex items-center rounded-full border border-teal-700/15 bg-white/75 px-3 py-1 text-sm font-medium text-teal-900 mb-3">
          Pick ledger
        </div>
        <h1 className="text-4xl font-semibold text-slate-950 mb-2">Official Saved Picks</h1>
        <p className="text-slate-600 max-w-2xl">
          Review the official board picks in one place, with status, signals, and ranking details for both leagues.
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
                <span className={getResultBadgeClass(pick.status)}>{getPickStatusLabel(pick.status)}</span>
              </div>
            </div>

            <div className="grid gap-2 text-slate-700">
              <p><strong>Date:</strong> {pick.pick_date}</p>
              <p><strong>Start Time:</strong> {formatStartTime(pick.game_start_time)} ET</p>
              <p><strong>Sport:</strong> {pick.sport}</p>
              <p><strong>Market:</strong> {pick.market_scope} / {pick.market_type}</p>
              {pick.player_name && <p><strong>Player:</strong> {pick.player_name}</p>}
              <p><strong>Pick:</strong> {pick.side}</p>
              <p><strong>Line Taken:</strong> {pick.line_taken ?? (pick.market_type === "moneyline" ? "ML" : "Locked pregame")}</p>
              <p><strong>Odds:</strong> {pick.odds_taken}</p>
              <p><strong>Stake:</strong> {pick.stake_units}u</p>
              <p><strong>Signal:</strong> {pick.edge_label ?? pick.side}</p>
              <p><strong>Edge:</strong> {formatEdge(pick.edge, pick.sport, pick.market_type)}</p>
              <p><strong>Top Pick Rank:</strong> {pick.top_pick_rank ?? "Not ranked"}</p>
              <p><strong>Final Score:</strong> {pick.final_score ?? "Pending"}</p>
              {pick.market_scope === "player_prop" && <p><strong>Final Stat:</strong> {pick.final_stat ?? "Pending"}</p>}
              {pick.market_scope === "player_prop" && pick.market_type === "pitcher_strikeouts" && (
                <p>
                  <strong>Final IP:</strong>{" "}
                  {isPendingPickStatus(pick.status)
                    ? "Pending"
                    : pitcherPropDetailsById.get(pick.id)?.finalInningsPitched ?? "Unavailable"}
                </p>
              )}
              <p>
                <strong>Units Result:</strong>{" "}
                {pick.units_result !== null
                  ? `${Number(pick.units_result).toFixed(2)}u`
                  : resolvePickStatus(pick.status) === "push"
                    ? "0.00u"
                    : "Pending"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
