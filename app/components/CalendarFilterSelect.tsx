"use client";

import { useRouter, useSearchParams } from "next/navigation";

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

const ratingOptions = [
  { value: "free", label: "Free Picks" },
  { value: "top", label: "Top Picks" },
  { value: "value", label: "Best Value" },
  { value: "5", label: "5 Star" },
  { value: "4", label: "4 Star" },
  { value: "3", label: "3 Star" },
  { value: "2", label: "2 Star" },
  { value: "1", label: "1 Star" },
];

export default function CalendarFilterSelect({
  date,
  sport,
  scope,
  rating,
}: {
  date: string;
  sport: string;
  scope: string;
  rating: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParams(next: { sport?: string; scope?: string; rating?: string[] }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", date);
    params.set("sport", next.sport ?? sport);
    params.set("scope", next.scope ?? scope);
    const nextRating = next.rating ?? rating;

    if (nextRating.length === 0) {
      params.delete("rating");
    } else {
      params.set("rating", nextRating.join(","));
    }

    router.push(`/calendar?${params.toString()}`);
  }

  function toggleRating(value: string) {
    const nextRating = rating.includes(value)
      ? rating.filter((item) => item !== value)
      : [...rating, value];

    updateParams({ rating: nextRating });
  }

  return (
    <div className="app-panel rounded-3xl p-5 mb-6 grid gap-4 md:grid-cols-2">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Sport</label>
        <select
          value={sport}
          onChange={(e) => updateParams({ sport: e.target.value })}
          className="app-input"
        >
          {sportOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Market Scope</label>
        <select
          value={scope}
          onChange={(e) => updateParams({ scope: e.target.value })}
          className="app-input"
        >
          {scopeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="md:col-span-2">
        <div className="flex items-center justify-between gap-3 mb-2">
          <label className="block text-sm font-medium text-slate-700">Pick Rating</label>
          <button
            type="button"
            onClick={() => updateParams({ rating: [] })}
            className="text-sm font-medium text-slate-700 hover:text-slate-950"
          >
            Clear all
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {ratingOptions.map((option) => {
            const isActive = rating.includes(option.value);

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleRating(option.value)}
                className={
                  isActive
                    ? "app-pill app-pill-active rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition"
                    : "app-pill rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
                }
              >
                {isActive ? `Selected: ${option.label}` : option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
