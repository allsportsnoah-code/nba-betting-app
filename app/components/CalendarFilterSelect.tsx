"use client";

import { useRouter, useSearchParams } from "next/navigation";

const sportOptions = [
  { value: "all", label: "All Sports" },
  { value: "NBA", label: "NBA" },
  { value: "MLB", label: "MLB" },
];

const ratingOptions = [
  { value: "all", label: "All Picks" },
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
  rating,
}: {
  date: string;
  sport: string;
  rating: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParams(next: { sport?: string; rating?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", date);
    params.set("sport", next.sport ?? sport);
    params.set("rating", next.rating ?? rating);
    router.push(`/calendar?${params.toString()}`);
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
        <label className="block text-sm font-medium text-slate-700 mb-2">Pick Rating</label>
        <select
          value={rating}
          onChange={(e) => updateParams({ rating: e.target.value })}
          className="app-input"
        >
          {ratingOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
