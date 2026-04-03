import PerformanceChart from "@/app/components/PerformanceChart";
import PerformanceRangeSelect from "@/app/components/PerformanceRangeSelect";
import { getConfidenceLabel, getPickConfidenceStars } from "@/lib/starRatings";

type PerformancePick = {
  id: number;
  pick_date: string;
  sport: string;
  status: "pending" | "win" | "loss" | "push";
  game_label: string;
  side: string;
  units_result?: number | null;
  edge?: number | null;
  market_type?: string | null;
  confidence_score?: number | null;
  is_top_pick?: boolean | null;
  notes?: string | null;
};

type BreakdownRow = {
  label: string;
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  netUnits: number;
};

async function getPicks() {
  const res = await fetch("http://localhost:3000/api/picks", {
    cache: "no-store",
  });
  return res.json();
}

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

function filterByRange(rows: PerformancePick[], range: string) {
  if (range === "all") return rows;

  const today = new Date();
  const start = new Date(today);

  if (range === "3d") start.setDate(today.getDate() - 3);
  if (range === "1w") start.setDate(today.getDate() - 7);
  if (range === "1m") start.setMonth(today.getMonth() - 1);
  if (range === "6m") start.setMonth(today.getMonth() - 6);
  if (range === "1y") start.setFullYear(today.getFullYear() - 1);
  if (range === "ytd") {
    start.setMonth(0);
    start.setDate(1);
  }

  return rows.filter((row) => new Date(row.pick_date) >= start);
}

function filterBySport(rows: PerformancePick[], sport: string) {
  if (sport === "all") return rows;
  return rows.filter((row) => row.sport === sport);
}

function filterByStars(rows: PerformancePick[], stars: string) {
  if (stars === "all") return rows;
  if (stars === "top") return rows.filter((row) => row.is_top_pick);
  if (stars === "value") return rows.filter((row) => row.notes === "best_value");
  const targetStars = Number(stars);
  return rows.filter((row) => getPickConfidenceStars(row) === targetStars);
}

function buildDailyNetMap(rows: PerformancePick[]) {
  const dailyMap: Record<string, number> = {};

  for (const row of rows) {
    if (row.status === "pending") continue;

    const date = row.pick_date;
    const units = Number(row.units_result ?? 0);
    dailyMap[date] = Number(((dailyMap[date] ?? 0) + units).toFixed(2));
  }

  return dailyMap;
}

function buildCumulativeSeries(rows: PerformancePick[]) {
  const dailyMap = buildDailyNetMap(rows);
  const dates = Object.keys(dailyMap).sort((a, b) => a.localeCompare(b));

  let running = 0;

  return dates.map((date) => {
    running += dailyMap[date];
    running = Number(running.toFixed(2));

    return {
      label: date,
      value: running,
    };
  });
}

function buildBreakdownByMarket(rows: PerformancePick[]) {
  const grouped = new Map<string, BreakdownRow>();

  for (const row of rows) {
    const label = row.market_type ?? "unknown";
    if (!grouped.has(label)) {
      grouped.set(label, {
        label,
        picks: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        winRate: 0,
        netUnits: 0,
      });
    }

    const entry = grouped.get(label);
    if (!entry) continue;

    entry.picks += 1;
    entry.netUnits = Number((entry.netUnits + Number(row.units_result ?? 0)).toFixed(2));
    if (row.status === "win") entry.wins += 1;
    if (row.status === "loss") entry.losses += 1;
    if (row.status === "push") entry.pushes += 1;
  }

  return Array.from(grouped.values())
    .map((entry) => {
      const decisions = entry.wins + entry.losses;
      return {
        ...entry,
        winRate: decisions > 0 ? Number(((entry.wins / decisions) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.netUnits - a.netUnits);
}

function buildBreakdownByStars(rows: PerformancePick[]) {
  const starBuckets = [5, 4, 3, 2, 1, 0];
  const grouped = new Map<number, BreakdownRow>();

  for (const stars of starBuckets) {
    grouped.set(stars, {
      label: getConfidenceLabel(stars),
      picks: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      winRate: 0,
      netUnits: 0,
    });
  }

  for (const row of rows) {
    const stars = getPickConfidenceStars(row);
    const entry = grouped.get(stars);
    if (!entry) continue;

    entry.picks += 1;
    entry.netUnits = Number((entry.netUnits + Number(row.units_result ?? 0)).toFixed(2));
    if (row.status === "win") entry.wins += 1;
    if (row.status === "loss") entry.losses += 1;
    if (row.status === "push") entry.pushes += 1;
  }

  return Array.from(grouped.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, entry]) => {
      const decisions = entry.wins + entry.losses;
      return {
        ...entry,
        winRate: decisions > 0 ? Number(((entry.wins / decisions) * 100).toFixed(1)) : 0,
      };
    })
    .filter((entry) => entry.picks > 0);
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; sport?: string; stars?: string }>;
}) {
  const params = await searchParams;

  const range =
    params.range === "3d" ||
    params.range === "1w" ||
    params.range === "1m" ||
    params.range === "6m" ||
    params.range === "ytd" ||
    params.range === "1y"
      ? params.range
      : "all";

  const sport = params.sport === "NBA" || params.sport === "MLB" ? params.sport : "all";
  const stars =
    params.stars === "top" ||
    params.stars === "value" ||
    params.stars === "1" ||
    params.stars === "2" ||
    params.stars === "3" ||
    params.stars === "4" ||
    params.stars === "5"
      ? params.stars
      : "all";

  const picksResponse = await getPicks();
  const currentBettingDate = getCurrentBettingDateEt();
  const allPicks = ((picksResponse.data ?? []) as PerformancePick[]).filter(
    (pick) => pick.pick_date <= currentBettingDate
  );
  const filtered = filterByStars(filterBySport(filterByRange(allPicks, range), sport), stars);

  const settled = filtered.filter((pick) => pick.status !== "pending");
  const pending = filtered.filter((pick) => pick.status === "pending");
  const cumulativeSeries = buildCumulativeSeries(filtered);
  const dailyNetMap = buildDailyNetMap(filtered);
  const marketBreakdown = buildBreakdownByMarket(settled);
  const starBreakdown = buildBreakdownByStars(settled);

  const dailyEntries = Object.keys(dailyNetMap)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({
      label: date,
      value: Number(dailyNetMap[date].toFixed(2)),
    }));

  const netUnits =
    cumulativeSeries.length > 0 ? cumulativeSeries[cumulativeSeries.length - 1].value : 0;

  const winningDays = dailyEntries.filter((day) => day.value > 0).length;
  const losingDays = dailyEntries.filter((day) => day.value < 0).length;
  const pushDays = dailyEntries.filter((day) => day.value === 0).length;

  const bestDay =
    dailyEntries.length > 0
      ? dailyEntries.reduce((best, current) => (current.value > best.value ? current : best))
      : null;

  const worstDay =
    dailyEntries.length > 0
      ? dailyEntries.reduce((worst, current) => (current.value < worst.value ? current : worst))
      : null;

  return (
    <main className="max-w-6xl mx-auto p-8">
      <div className="app-card rounded-[2rem] p-8 mb-6">
        <div className="inline-flex items-center rounded-full border border-teal-700/15 bg-white/75 px-3 py-1 text-sm font-medium text-teal-900 mb-3">
          Performance review
        </div>
        <h1 className="text-4xl font-semibold text-slate-950 mb-2">Performance</h1>
        <p className="text-slate-600 max-w-2xl">
          See what is actually working, compare star buckets, and review which markets are carrying the model.
        </p>
      </div>

      <PerformanceRangeSelect current={range} sport={sport} stars={stars} />

      <div className="app-panel rounded-3xl p-6 mb-6">
        <div className="text-sm uppercase tracking-[0.18em] text-slate-500 mb-2">Current Net Units</div>
        <div
          className={
            netUnits >= 0 ? "text-5xl font-semibold text-emerald-700" : "text-5xl font-semibold text-rose-700"
          }
        >
          {netUnits.toFixed(2)}u
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="app-stat rounded-3xl p-5">
          <strong>Settled Picks</strong>
          <div className="text-3xl mt-3 text-slate-950">{settled.length}</div>
        </div>
        <div className="app-stat rounded-3xl p-5">
          <strong>Pending Picks</strong>
          <div className="text-3xl mt-3 text-slate-950">{pending.length}</div>
        </div>
        <div className="app-stat rounded-3xl p-5">
          <strong>Winning Days</strong>
          <div className="text-3xl mt-3 text-slate-950">{winningDays}</div>
        </div>
        <div className="app-stat rounded-3xl p-5">
          <strong>Losing Days</strong>
          <div className="text-3xl mt-3 text-slate-950">{losingDays}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="app-stat rounded-3xl p-5">
          <strong>Push Days</strong>
          <div className="text-3xl mt-3 text-slate-950">{pushDays}</div>
        </div>
        <div className="app-stat rounded-3xl p-5">
          <strong>Best Day</strong>
          <div className="mt-3 text-slate-700">
            {bestDay ? `${bestDay.label} (${bestDay.value.toFixed(2)}u)` : "N/A"}
          </div>
        </div>
        <div className="app-stat rounded-3xl p-5">
          <strong>Worst Day</strong>
          <div className="mt-3 text-slate-700">
            {worstDay ? `${worstDay.label} (${worstDay.value.toFixed(2)}u)` : "N/A"}
          </div>
        </div>
      </div>

      <h2 className="app-section-title mb-3">Cumulative Units</h2>

      {cumulativeSeries.length === 0 ? (
        <div className="app-panel rounded-3xl p-5 mb-6">
          <p className="font-semibold mb-2">No graded results in this range yet.</p>
          <p className="text-sm text-slate-600">
            This usually means your saved picks are still pending, or no finished picks fall inside the selected range.
          </p>
        </div>
      ) : (
        <div className="mb-6">
          <PerformanceChart points={cumulativeSeries} />
        </div>
      )}

      <div className="app-panel rounded-3xl p-5">
        <h3 className="text-xl font-semibold text-slate-950 mb-3">Daily Net Units</h3>

        {dailyEntries.length === 0 ? (
          <p>No graded daily results yet.</p>
        ) : (
          <div className="space-y-2">
            {dailyEntries.map((day) => (
              <div
                key={day.label}
                className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3"
              >
                <span className="text-slate-700">{day.label}</span>
                <span
                  className={
                    day.value > 0
                      ? "text-green-700 font-semibold"
                      : day.value < 0
                      ? "text-red-700 font-semibold"
                      : "text-yellow-700 font-semibold"
                  }
                >
                  {day.value.toFixed(2)}u
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 mt-6 lg:grid-cols-2">
        <div className="app-panel rounded-3xl p-5">
          <h3 className="text-xl font-semibold text-slate-950 mb-3">Performance By Market</h3>

          {marketBreakdown.length === 0 ? (
            <p>No settled picks to analyze by market yet.</p>
          ) : (
            <div className="space-y-2">
              {marketBreakdown.map((row) => (
                <div
                  key={row.label}
                  className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-medium">{row.label}</div>
                    <div className="text-sm text-slate-600">
                      {row.picks} picks | {row.wins}-{row.losses}-{row.pushes} | {row.winRate}% win
                      rate
                    </div>
                  </div>
                  <div
                    className={
                      row.netUnits >= 0
                        ? "font-semibold text-green-700"
                        : "font-semibold text-red-700"
                    }
                  >
                    {row.netUnits.toFixed(2)}u
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-panel rounded-3xl p-5">
          <h3 className="text-xl font-semibold text-slate-950 mb-3">Performance By Star Rating</h3>

          {starBreakdown.length === 0 ? (
            <p>No settled picks to analyze by rating yet.</p>
          ) : (
            <div className="space-y-2">
              {starBreakdown.map((row) => (
                <div
                  key={row.label}
                  className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-medium">{row.label}</div>
                    <div className="text-sm text-slate-600">
                      {row.picks} picks | {row.wins}-{row.losses}-{row.pushes} | {row.winRate}% win
                      rate
                    </div>
                  </div>
                  <div
                    className={
                      row.netUnits >= 0
                        ? "font-semibold text-green-700"
                        : "font-semibold text-red-700"
                    }
                  >
                    {row.netUnits.toFixed(2)}u
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="app-panel rounded-3xl p-5 mt-6">
          <h3 className="text-xl font-semibold text-slate-950 mb-3">Pending Picks In This Range</h3>
          <div className="space-y-2">
            {pending.map((pick) => (
              <div key={pick.id} className="rounded-2xl border border-slate-200/80 bg-white/72 px-4 py-3">
                <div className="font-medium text-slate-950">{pick.game_label}</div>
                <div className="text-sm text-slate-600">
                  {pick.pick_date} | {pick.sport} | {pick.side} | {getConfidenceLabel(getPickConfidenceStars(pick))} | {pick.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
