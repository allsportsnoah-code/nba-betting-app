import Link from "next/link";

const rangeOptions = [
  { value: "cm", label: "Current Month" },
  { value: "4d", label: "Past 4 Days" },
  { value: "1w", label: "1 Week" },
  { value: "2w", label: "Past 2 Weeks" },
  { value: "1m", label: "1 Month" },
  { value: "6m", label: "6 Months" },
  { value: "ytd", label: "Year to Date" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All Time" },
];

const sportOptions = [
  { value: "all", label: "All Sports" },
  { value: "NBA", label: "NBA" },
  { value: "MLB", label: "MLB" },
  { value: "SOCCER", label: "Soccer" },
];

const scopeOptions = [
  { value: "all", label: "All Markets" },
  { value: "team", label: "Official Team Bets" },
  { value: "player_prop", label: "Official Player Props" },
];

const starOptions = [
  { value: "free", label: "Free Picks" },
  { value: "top", label: "Top Picks" },
  { value: "value", label: "Best Value" },
  { value: "5", label: "5 Star" },
  { value: "4", label: "4 Star" },
  { value: "3", label: "3 Star" },
  { value: "2", label: "2 Star" },
  { value: "1", label: "1 Star" },
];

const viewOptions = [
  { value: "overview", label: "Overview" },
  { value: "calendar", label: "Month Calendar" },
];

type FieldName = "range" | "sport" | "scope" | "stars" | "view" | "month";

type FilterPatch = {
  range?: string;
  sport?: string;
  scope?: string;
  stars?: string[];
  view?: string;
  month?: string;
};

function formatMonthLabel(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  if (!year || !monthValue) return month;

  const labelDate = new Date(Date.UTC(year, monthValue - 1, 1, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(labelDate);
}

function getStarsParam(stars: string[]) {
  return stars.length > 0 ? stars.join(",") : "none";
}

export default function PerformanceRangeSelect({
  current,
  sport,
  scope,
  stars,
  view,
  month,
  monthOptions,
}: {
  current: string;
  sport: string;
  scope: string;
  stars: string[];
  view: string;
  month: string;
  monthOptions: string[];
}) {
  const calendarMonthOptions = monthOptions.length > 0 ? monthOptions : month ? [month] : [];
  const starsParam = getStarsParam(stars);

  function buildHref(next: FilterPatch = {}) {
    const params = new URLSearchParams();
    const nextStars = next.stars ?? stars;
    const nextMonth = next.month ?? month;

    params.set("range", next.range ?? current);
    params.set("sport", next.sport ?? sport);
    params.set("scope", next.scope ?? scope);
    params.set("view", next.view ?? view);
    params.set("stars", getStarsParam(nextStars));

    if (nextMonth) {
      params.set("month", nextMonth);
    }

    return `/performance?${params.toString()}`;
  }

  function getToggledStars(value: string) {
    return stars.includes(value)
      ? stars.filter((item) => item !== value)
      : [...stars, value];
  }

  function getViewMonth(nextView: string) {
    return nextView === "calendar" ? month || monthOptions[0] || "" : month;
  }

  function getMonthHref(direction: "older" | "newer") {
    if (monthOptions.length === 0) return null;

    const currentIndex = monthOptions.indexOf(month);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex =
      direction === "older"
        ? Math.min(monthOptions.length - 1, safeIndex + 1)
        : Math.max(0, safeIndex - 1);

    if (nextIndex === safeIndex) return null;

    return buildHref({ month: monthOptions[nextIndex] });
  }

  function renderHiddenFields(omit: FieldName[] = []) {
    const omitted = new Set(omit);
    const fields: Record<FieldName, string> = {
      range: current,
      sport,
      scope,
      stars: starsParam,
      view,
      month,
    };

    return (Object.keys(fields) as FieldName[])
      .filter((name) => !omitted.has(name) && fields[name] !== "")
      .map((name) => <input key={name} type="hidden" name={name} value={fields[name]} />);
  }

  const olderMonthHref = getMonthHref("older");
  const newerMonthHref = getMonthHref("newer");

  return (
    <div className="app-panel rounded-3xl p-5 mb-6 grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <label className="block text-sm font-medium text-slate-700">View</label>
          {view === "calendar" ? (
            <span className="text-xs text-slate-500">
              Month view uses the full archive with your current sport, market, and rating filters.
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {viewOptions.map((option) => {
            const isActive = view === option.value;

            return (
              <Link
                key={option.value}
                href={buildHref({ view: option.value, month: getViewMonth(option.value) })}
                className={
                  isActive
                    ? "app-pill app-pill-active inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition"
                    : "app-pill inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
                }
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      {view === "overview" ? (
        <div className="md:col-span-3">
          <label className="block text-sm font-medium text-slate-700 mb-2">Performance Range</label>
          <div className="flex flex-wrap gap-2">
            {rangeOptions.map((option) => {
              const isActive = current === option.value;

              return (
                <Link
                  key={option.value}
                  href={buildHref({ range: option.value })}
                  className={
                    isActive
                      ? "app-pill app-pill-active inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition"
                      : "app-pill inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
                  }
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Calendar Month</label>
          <div className="flex items-center gap-2">
            {olderMonthHref ? (
              <Link
                href={olderMonthHref}
                className="app-pill inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition"
              >
                Older
              </Link>
            ) : (
              <span className="app-pill inline-flex cursor-not-allowed items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-slate-700 opacity-40">
                Older
              </span>
            )}

            <form action="/performance" method="get" className="flex min-w-0 flex-1 items-center gap-2">
              {renderHiddenFields(["month"])}
              <select name="month" defaultValue={month} className="app-input min-w-0">
                {calendarMonthOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatMonthLabel(option)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="app-pill inline-flex shrink-0 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:text-slate-950"
              >
                Apply
              </button>
            </form>

            {newerMonthHref ? (
              <Link
                href={newerMonthHref}
                className="app-pill inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition"
              >
                Newer
              </Link>
            ) : (
              <span className="app-pill inline-flex cursor-not-allowed items-center justify-center rounded-full px-3 py-2 text-sm font-medium text-slate-700 opacity-40">
                Newer
              </span>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Sport</label>
        <div className="flex flex-wrap gap-2">
          {sportOptions.map((option) => {
            const isActive = sport === option.value;

            return (
              <Link
                key={option.value}
                href={buildHref({ sport: option.value })}
                className={
                  isActive
                    ? "app-pill app-pill-active inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition"
                    : "app-pill inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
                }
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Market Scope</label>
        <div className="flex flex-wrap gap-2">
          {scopeOptions.map((option) => {
            const isActive = scope === option.value;

            return (
              <Link
                key={option.value}
                href={buildHref({ scope: option.value })}
                className={
                  isActive
                    ? "app-pill app-pill-active inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition"
                    : "app-pill inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
                }
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="md:col-span-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <label className="block text-sm font-medium text-slate-700">Confidence Rating</label>
          <Link
            href={buildHref({ stars: [] })}
            className="text-sm font-medium text-slate-700 hover:text-slate-950"
          >
            Clear all
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {starOptions.map((option) => {
            const isActive = stars.includes(option.value);

            return (
              <Link
                key={option.value}
                href={buildHref({ stars: getToggledStars(option.value) })}
                className={
                  isActive
                    ? "app-pill app-pill-active inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition"
                    : "app-pill inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
                }
              >
                {isActive ? `Selected: ${option.label}` : option.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
