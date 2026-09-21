import {
  FREE_PICK_PAYOUT_FLOOR,
} from "@/lib/mlbFreePicks";
import {
  getMlbHistorySnapshot,
  getMlbHistorySnapshotStar,
  getMlbSnapshotFreePickIds,
  getMlbSnapshotPropBestValueIds,
  getMlbSnapshotPropTopPickIds,
  getMlbSnapshotTeamBestValueIds,
  getMlbSnapshotTeamTopPickIds,
} from "@/lib/mlbHistorySnapshot";
import {
  getNbaHistorySnapshot,
  getNbaHistorySnapshotStar,
  getNbaSnapshotPropBestValueIds,
  getNbaSnapshotPropTopPickIds,
  getNbaSnapshotTeamBestValueIds,
  getNbaSnapshotTeamTopPickIds,
} from "@/lib/nbaHistorySnapshot";
import { getPickStatusLabel, resolvePickStatus } from "@/lib/pickStatus";
import {
  getPublicFreePickBaseStars,
  getPublicFreePickExclusionReasons,
  getPublicFreePickScore,
  getPublicFreePickStars,
  rankPublicFreePickRowsForHistory,
  type PublicFreePickLike,
} from "@/lib/publicFreePicks";
import {
  getFreshPublicFreePickIds,
  getPublicFreePickHistory,
} from "@/lib/publicFreePickHistory";
import { getConfidenceLabel } from "@/lib/starRatings";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { americanToProfitPerUnit } from "@/lib/units";

const FREE_PICK_STAKE_UNITS = 2;

type AllSportsFreePicksBoardProps = {
  pickDate?: string | null;
  className?: string;
};

type PublicPickRow = PublicFreePickLike & {
  side: string;
  status?: string | null;
  final_score?: string | null;
  final_stat?: number | null;
  units_result?: number | null;
};

const PUBLIC_PICK_SELECT = [
  "id",
  "created_at",
  "pick_date",
  "sport",
  "market_scope",
  "external_event_id",
  "game_label",
  "game_start_time",
  "home_team",
  "away_team",
  "player_name",
  "market_type",
  "side",
  "line_taken",
  "odds_taken",
  "projected_line",
  "market_line",
  "edge",
  "edge_label",
  "confidence_score",
  "is_top_pick",
  "top_pick_rank",
  "notes",
  "status",
  "final_score",
  "final_stat",
  "units_result",
  "locked_at",
  "projected_home_score",
  "projected_away_score",
].join(",");

function getCurrentBettingDateEt() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");

  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (hour < 5) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }

  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(
    anchor.getUTCDate()
  ).padStart(2, "0")}`;
}

async function resolvePickDate(preferredDate: string | null | undefined) {
  if (preferredDate) return preferredDate;

  const supabase = getSupabaseServer();
  const today = getCurrentBettingDateEt();
  const { data } = await supabase
    .from("picks")
    .select("pick_date")
    .in("sport", ["MLB", "NBA"])
    .lte("pick_date", today)
    .order("pick_date", { ascending: false })
    .limit(1);

  return (data?.[0]?.pick_date as string | undefined) ?? today;
}

function buildOfficialIds({
  mlbSnapshot,
  nbaSnapshot,
}: {
  mlbSnapshot: Awaited<ReturnType<typeof getMlbHistorySnapshot>>;
  nbaSnapshot: Awaited<ReturnType<typeof getNbaHistorySnapshot>>;
}) {
  const mlbIds = new Set([
    ...getMlbSnapshotFreePickIds(mlbSnapshot),
    ...getMlbSnapshotTeamTopPickIds(mlbSnapshot),
    ...getMlbSnapshotTeamBestValueIds(mlbSnapshot),
    ...getMlbSnapshotPropTopPickIds(mlbSnapshot),
    ...getMlbSnapshotPropBestValueIds(mlbSnapshot),
  ]);
  const nbaIds = new Set([
    ...getNbaSnapshotTeamTopPickIds(nbaSnapshot),
    ...getNbaSnapshotTeamBestValueIds(nbaSnapshot),
    ...getNbaSnapshotPropTopPickIds(nbaSnapshot),
    ...getNbaSnapshotPropBestValueIds(nbaSnapshot),
  ]);

  return { mlbIds, nbaIds };
}

function isSnapshotBackedOfficialPick(
  row: PublicPickRow,
  officialIds: ReturnType<typeof buildOfficialIds>
) {
  if (row.sport === "MLB" && officialIds.mlbIds.size > 0) return officialIds.mlbIds.has(row.id);
  if (row.sport === "NBA" && officialIds.nbaIds.size > 0) return officialIds.nbaIds.has(row.id);
  return Boolean(row.is_top_pick) || row.notes === "best_value";
}

function getSnapshotStar(
  row: PublicPickRow,
  mlbSnapshot: Awaited<ReturnType<typeof getMlbHistorySnapshot>>,
  nbaSnapshot: Awaited<ReturnType<typeof getNbaHistorySnapshot>>
) {
  if (row.sport === "MLB") return getMlbHistorySnapshotStar(mlbSnapshot, row.id);
  if (row.sport === "NBA") return getNbaHistorySnapshotStar(nbaSnapshot, row.id);
  return null;
}

function formatStartTime(value: string | null | undefined) {
  if (!value) return "Time pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time pending";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatMarketLabel(row: PublicPickRow) {
  if (row.market_scope === "player_prop") {
    return (row.market_type ?? "Player Prop")
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  if (row.market_type === "moneyline") return "Moneyline";
  if (row.market_type === "spread") return row.sport === "MLB" ? "Run Line" : "Spread";
  if (row.market_type === "total") return "Total";
  return "Team Bet";
}

function formatTitle(row: PublicPickRow) {
  if (row.market_scope === "player_prop") {
    return row.player_name ?? `${row.sport ?? "Player"} Prop`;
  }

  return row.game_label ?? `${row.sport ?? "Team"} Game`;
}

function formatSubTitle(row: PublicPickRow) {
  if (row.market_scope === "player_prop") return row.game_label ?? null;
  return null;
}

function formatPayout(odds: number | null | undefined) {
  if (odds === null || odds === undefined) return "Pregame not saved";
  return `${(americanToProfitPerUnit(odds) * FREE_PICK_STAKE_UNITS).toFixed(2)}u`;
}

function splitEdgeLabel(value: string | null | undefined) {
  const parts = (value ?? "")
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    signal: parts[0] ?? null,
    reasons: parts
      .filter((part) => part.startsWith("Reasons:"))
      .map((part) => part.replace(/^Reasons:\s*/, ""))
      .join(", "),
    watch: parts
      .filter((part) => part.startsWith("Watch:") || part.startsWith("Learning:"))
      .map((part) => part.replace(/^(Watch|Learning):\s*/, ""))
      .join(", "),
  };
}

function getCardTone(status: string | null | undefined) {
  const resolvedStatus = resolvePickStatus(status);
  if (resolvedStatus === "win") return "border-emerald-200/80 bg-emerald-50/90";
  if (resolvedStatus === "loss") return "border-rose-200/80 bg-rose-50/90";
  if (resolvedStatus === "push") return "border-amber-200/80 bg-amber-50/90";
  return "border-white/70 bg-white/78";
}

function formatProjectedScore(row: PublicPickRow) {
  if (
    row.projected_home_score === null ||
    row.projected_home_score === undefined ||
    row.projected_away_score === null ||
    row.projected_away_score === undefined
  ) {
    return null;
  }

  const awayTeam = row.away_team ?? row.game_label?.split(" @ ")[0] ?? "Away";
  const homeTeam = row.home_team ?? row.game_label?.split(" @ ")[1] ?? "Home";
  return `${awayTeam} ${row.projected_away_score} - ${homeTeam} ${row.projected_home_score}`;
}

async function getBoardData(preferredDate: string | null | undefined) {
  const pickDate = await resolvePickDate(preferredDate);
  const supabase = getSupabaseServer();
  const [mlbSnapshot, nbaSnapshot, publicHistory, rowsResult] = await Promise.all([
    getMlbHistorySnapshot(pickDate),
    getNbaHistorySnapshot(pickDate),
    getPublicFreePickHistory(pickDate),
    supabase
      .from("picks")
      .select(PUBLIC_PICK_SELECT)
      .eq("pick_date", pickDate)
      .in("sport", ["MLB", "NBA"])
      .in("market_scope", ["team", "player_prop"])
      .order("is_top_pick", { ascending: false })
      .order("top_pick_rank", { ascending: true })
      .order("created_at", { ascending: false }),
  ]);

  const rows = ((rowsResult.data ?? []) as unknown as PublicPickRow[]).filter(
    (row) => typeof row.id === "number" && typeof row.side === "string" && row.side.trim().length > 0
  );
  const officialIds = buildOfficialIds({ mlbSnapshot, nbaSnapshot });
  const candidateRows = rows.filter((row) => isSnapshotBackedOfficialPick(row, officialIds));
  const publicFreePickIds = getFreshPublicFreePickIds(publicHistory, [mlbSnapshot, nbaSnapshot]);
  const freePickRows = rankPublicFreePickRowsForHistory(candidateRows, publicFreePickIds);
  const freePickIds = new Set(freePickRows.map((row) => row.id));
  const skippedRows = candidateRows
    .filter((row) => !freePickIds.has(row.id))
    .map((row) => {
      const frozenStars = getSnapshotStar(row, mlbSnapshot, nbaSnapshot);
      const isFrozenMlbFreePick = row.sport === "MLB" && getMlbSnapshotFreePickIds(mlbSnapshot).includes(row.id);
      const baseStars = getPublicFreePickBaseStars(row);
      const stars = getPublicFreePickStars(row, frozenStars, isFrozenMlbFreePick);
      return {
        row,
        baseStars,
        stars,
        score: getPublicFreePickScore(row),
        reasons: getPublicFreePickExclusionReasons(row),
      };
    })
    .filter((item) => item.reasons.length > 0 && (item.baseStars >= 5 || item.stars >= 4))
    .sort((a, b) => b.baseStars - a.baseStars || b.stars - a.stars || b.score - a.score)
    .slice(0, 4);

  return {
    pickDate,
    freePickRows,
    skippedRows,
    mlbSnapshot,
    nbaSnapshot,
  };
}

export default async function AllSportsFreePicksBoard({
  pickDate,
  className = "mb-8",
}: AllSportsFreePicksBoardProps) {
  let boardData;
  try {
    boardData = await getBoardData(pickDate);
  } catch {
    return null;
  }
  const { pickDate: resolvedPickDate, freePickRows, skippedRows, mlbSnapshot, nbaSnapshot } = boardData;

  return (
    <section className={`app-card rounded-[2rem] p-6 ${className}`}>
      <div className="inline-flex items-center rounded-full border border-teal-700/15 bg-white/70 px-3 py-1 text-sm font-medium text-teal-900 mb-3">
        5-star picks: payout floor off | 4-star MLB floor: {FREE_PICK_PAYOUT_FLOOR.toFixed(2)}u
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950 mb-2">Free Picks</h2>
          <p className="text-slate-600 max-w-3xl">
            Best 3 from MLB/NBA Top Picks and Best Value for {resolvedPickDate}, ranked together so every eligible pick gets a fair shot. MLB 4-star picks still need the public payout floor; displayed 5-star picks can qualify even at lower payouts. Free Picks are tracked as 2u plays.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {freePickRows.length === 0 ? (
          <div className="lg:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-white/55 px-4 py-5 text-sm text-slate-600">
            No Free Picks qualified yet for this betting day.
          </div>
        ) : (
          freePickRows.map((row, index) => {
            const labelParts = splitEdgeLabel(row.edge_label);
            const frozenStars = getSnapshotStar(row, mlbSnapshot, nbaSnapshot);
            const isFrozenMlbFreePick = row.sport === "MLB" && getMlbSnapshotFreePickIds(mlbSnapshot).includes(row.id);
            const stars = getPublicFreePickStars(row, frozenStars, isFrozenMlbFreePick);
            const projectedScore = formatProjectedScore(row);
            const subtitle = formatSubTitle(row);

            return (
              <div
                key={`all-sports-free-${row.id}`}
                className={`rounded-3xl border p-5 shadow-sm ${getCardTone(row.status)}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-1">
                      Free Pick #{index + 1}
                    </div>
                    <h3 className="text-xl font-semibold text-slate-950">{formatTitle(row)}</h3>
                    {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
                  </div>
                  <div className="flex max-w-[48%] flex-wrap items-center justify-end gap-1.5 shrink-0">
                    <div className="rounded-full border border-indigo-200/80 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800">
                      {row.sport}
                    </div>
                    <div className="rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {formatStartTime(row.game_start_time)}
                    </div>
                    <div className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {getConfidenceLabel(stars)}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-sm text-slate-700">
                  <p>
                    <strong>Pick:</strong> {row.side}
                  </p>
                  <p>
                    <strong>Market:</strong> {formatMarketLabel(row)}
                  </p>
                  {row.line_taken !== null && row.line_taken !== undefined ? (
                    <p>
                      <strong>Line:</strong> {row.line_taken}
                    </p>
                  ) : null}
                  <p>
                    <strong>Current odds:</strong> {row.odds_taken ?? "N/A"}
                  </p>
                  <p>
                    <strong>Stake:</strong> {FREE_PICK_STAKE_UNITS}u
                  </p>
                  <p>
                    <strong>Potential payout:</strong> {formatPayout(row.odds_taken)}
                  </p>
                  {projectedScore ? (
                    <p>
                      <strong>Predicted score:</strong> {projectedScore}
                    </p>
                  ) : null}
                  {row.final_score ? (
                    <p>
                      <strong>Final score:</strong> {row.final_score}
                    </p>
                  ) : null}
                  {row.final_stat !== null && row.final_stat !== undefined ? (
                    <p>
                      <strong>Final stat:</strong> {row.final_stat}
                    </p>
                  ) : null}
                  <p>
                    <strong>Signal:</strong> {labelParts.signal ?? row.side}
                  </p>
                  {labelParts.reasons ? (
                    <p>
                      <strong>Why:</strong> {labelParts.reasons}
                    </p>
                  ) : null}
                  {labelParts.watch ? (
                    <p>
                      <strong>Watch:</strong> {labelParts.watch}
                    </p>
                  ) : null}
                  <p>
                    <strong>Edge:</strong> {row.edge ?? "N/A"}
                  </p>
                  <p>
                    <strong>Status:</strong> {getPickStatusLabel(row.status)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {freePickRows.length < 3 && skippedRows.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 text-sm text-slate-700">
          <div className="mb-2 font-semibold text-slate-950">Why only {freePickRows.length}/3 Free Picks?</div>
          <p className="mb-3 text-slate-600">
            The board only pulls from MLB/NBA Top Picks and Best Value rows that also clear the stricter public-pick guardrails.
          </p>
          <div className="space-y-2">
            {skippedRows.map((item) => (
              <div key={`skipped-free-${item.row.id}`} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-950">{formatTitle(item.row)}</span>
                  <span className="rounded-full border border-white/70 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                    {item.row.sport} | {item.stars} Stars
                  </span>
                  {item.baseStars > item.stars ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      capped from {item.baseStars}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-slate-600">
                  {formatMarketLabel(item.row)} | {item.row.side}
                </div>
                <div className="mt-1 text-amber-700">
                  Held out: {item.reasons.slice(0, 2).join("; ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
