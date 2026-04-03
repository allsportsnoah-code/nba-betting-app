import Link from "next/link";
import CalendarFilterSelect from "@/app/components/CalendarFilterSelect";
import { getConfidenceLabel, getPickConfidenceStars } from "@/lib/starRatings";
import { americanToProfitPerUnit } from "@/lib/units";

type CalendarPick = {
  id: number;
  created_at?: string | null;
  pick_date: string;
  sport: string;
  side: string;
  status: string;
  game_label: string;
  line_taken?: number | null;
  home_team?: string | null;
  away_team?: string | null;
  projected_home_score?: number | null;
  projected_away_score?: number | null;
  final_score?: string | null;
  edge_label?: string | null;
  edge?: number | null;
  top_pick_rank?: number | null;
  units_result?: number | null;
  is_top_pick?: boolean | null;
  market_type?: string | null;
  confidence_score?: number | null;
  odds_taken?: number | null;
  locked_at?: string | null;
  game_start_time?: string | null;
  notes?: string | null;
};

async function getAllPicks() {
  const res = await fetch("http://localhost:3000/api/picks", {
    cache: "no-store",
  });
  return res.json();
}

function getCardColor(status: string) {
  if (status === "win") return "border-green-500 bg-green-50";
  if (status === "loss") return "border-red-500 bg-red-50";
  if (status === "push") return "border-yellow-500 bg-yellow-50";
  return "border-gray-300 bg-white";
}

function formatLine(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatProjectedScore(
  homeTeam: string | null | undefined,
  awayTeam: string | null | undefined,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined
) {
  if (!homeTeam || !awayTeam || homeScore === null || awayScore === null) return "N/A";
  return `${awayTeam} ${awayScore} vs ${homeTeam} ${homeScore}`;
}

function formatPotentialPayout(odds: number | null | undefined) {
  if (odds === null || odds === undefined) return "N/A";
  return `${americanToProfitPerUnit(odds).toFixed(2)}u`;
}

function formatEdge(value: number | null | undefined, sport: string, marketType: string | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  if (sport !== "MLB") return `${value}`;
  if (marketType === "moneyline") return `${value}% win probability`;
  if (marketType === "spread") return `${value} runs`;
  if (marketType === "total") return `${value} runs`;
  return `${value}`;
}

function filterBySport(rows: CalendarPick[], sport: string) {
  if (sport === "all") return rows;
  return rows.filter((row) => row.sport === sport);
}

function filterByRating(rows: CalendarPick[], rating: string) {
  if (rating === "all") return rows;
  if (rating === "top") return rows.filter((row) => row.is_top_pick);
  if (rating === "value") return rows.filter((row) => row.notes === "best_value");
  const targetStars = Number(rating);
  return rows.filter((row) => getPickConfidenceStars(row) === targetStars);
}

function getDisplayDate(pick: CalendarPick) {
  if (!pick.game_start_time) return pick.pick_date;

  const gameStart = new Date(pick.game_start_time);
  if (Number.isNaN(gameStart.getTime())) return pick.pick_date;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(gameStart);
}

function dedupeCalendarPicks(rows: CalendarPick[]) {
  const deduped = new Map<string, CalendarPick>();

  for (const row of rows) {
    const displayDate = getDisplayDate(row);
    const key = [
      displayDate,
      row.sport,
      row.game_label,
      row.market_type ?? "",
      row.side,
    ].join("::");

    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, row);
      continue;
    }

    const rowMatchesDisplayDate = row.pick_date === displayDate;
    const existingMatchesDisplayDate = existing.pick_date === displayDate;

    if (rowMatchesDisplayDate && !existingMatchesDisplayDate) {
      deduped.set(key, row);
      continue;
    }

    if (rowMatchesDisplayDate === existingMatchesDisplayDate) {
      const existingCreated = existing.created_at ? new Date(existing.created_at).getTime() : 0;
      const rowCreated = row.created_at ? new Date(row.created_at).getTime() : 0;

      if (rowCreated > existingCreated) {
        deduped.set(key, row);
      }
    }
  }

  return Array.from(deduped.values());
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; sport?: string; rating?: string }>;
}) {
  const params = await searchParams;
  const allPicksResponse = await getAllPicks();
  const allPicks = dedupeCalendarPicks((allPicksResponse.data ?? []) as CalendarPick[]);

  const uniqueDates = Array.from(new Set(allPicks.map(getDisplayDate))).sort((a, b) => b.localeCompare(a));

  const selectedDate = params.date ?? uniqueDates[0] ?? new Date().toISOString().slice(0, 10);
  const sport = params.sport === "NBA" || params.sport === "MLB" ? params.sport : "all";
  const rating =
    params.rating === "top" ||
    params.rating === "value" ||
    params.rating === "1" ||
    params.rating === "2" ||
    params.rating === "3" ||
    params.rating === "4" ||
    params.rating === "5"
      ? params.rating
      : "all";

  const datePicks = allPicks.filter((pick) => getDisplayDate(pick) === selectedDate);
  const filteredPicks = filterByRating(filterBySport(datePicks, sport), rating);

  return (
    <main className="max-w-6xl mx-auto p-8">
      <div className="app-card rounded-[2rem] p-8 mb-6">
        <div className="inline-flex items-center rounded-full border border-sky-700/15 bg-white/75 px-3 py-1 text-sm font-medium text-sky-900 mb-3">
          Slate archive
        </div>
        <h1 className="text-4xl font-semibold text-slate-950 mb-2">Calendar</h1>
        <p className="text-slate-600 max-w-2xl">
          Browse saved betting days, isolate the strongest plays, and review how picks looked when they were made.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {uniqueDates.length === 0 ? (
          <div className="text-gray-600">No saved dates yet.</div>
        ) : (
          uniqueDates.map((date) => (
            <Link
              key={date}
              href={`/calendar?date=${date}&sport=${sport}&rating=${rating}`}
              className={`app-pill px-4 py-2 rounded-full ${
                selectedDate === date ? "app-pill-active" : "text-slate-800"
              }`}
            >
              {date}
            </Link>
          ))
        )}
      </div>

      <CalendarFilterSelect date={selectedDate} sport={sport} rating={rating} />

      <h2 className="app-section-title mb-3">Picks for {selectedDate}</h2>

      {filteredPicks.length === 0 ? (
        <div className="app-panel rounded-3xl p-5">
          No picks match the selected date and filters yet.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPicks.map((pick) => (
            <div key={pick.id} className={`rounded-3xl p-5 shadow-sm ${getCardColor(pick.status)}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <h3 className="text-xl font-semibold text-slate-950">{pick.game_label}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {pick.locked_at && (
                    <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
                      Locked
                    </div>
                  )}
                  <div className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-sm font-medium text-slate-700">
                    {pick.sport} | {getConfidenceLabel(getPickConfidenceStars(pick))}
                  </div>
                </div>
              </div>

              <p className="text-slate-700">
                <strong>Pick:</strong> {pick.side}
              </p>
              <p className="text-slate-700">
                <strong>Market:</strong> {pick.market_type ?? "N/A"}
              </p>
              <p className="text-slate-700">
                <strong>Line:</strong> {formatLine(pick.line_taken)}
              </p>
              {pick.sport === "MLB" && (
                <>
                  <p className="text-slate-700">
                    <strong>Current odds:</strong> {pick.odds_taken ?? "N/A"}
                  </p>
                  <p className="text-slate-700">
                    <strong>Potential payout:</strong> {formatPotentialPayout(pick.odds_taken)}
                  </p>
                </>
              )}
              <p className="text-slate-700">
                <strong>Predicted Score:</strong>{" "}
                {formatProjectedScore(
                  pick.home_team,
                  pick.away_team,
                  pick.projected_home_score,
                  pick.projected_away_score
                )}
              </p>
              <p className="text-slate-700">
                <strong>Final Score:</strong> {pick.final_score ?? "Pending"}
              </p>
              <p className="text-slate-700">
                <strong>Status:</strong> {pick.status}
              </p>
              <p className="text-slate-700">
                <strong>Signal:</strong> {pick.edge_label ?? "N/A"}
              </p>
              <p className="text-slate-700">
                <strong>Edge:</strong> {formatEdge(pick.edge, pick.sport, pick.market_type)}
              </p>
              <p className="text-slate-700">
                <strong>Top Pick Rank:</strong> {pick.top_pick_rank ?? "N/A"}
              </p>
              <p className="text-slate-700">
                <strong>Units Result:</strong>{" "}
                {pick.units_result !== null && pick.units_result !== undefined
                  ? `${Number(pick.units_result).toFixed(2)}u`
                  : "Pending"}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
