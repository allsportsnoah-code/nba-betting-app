"use client";

import { useRouter, useSearchParams } from "next/navigation";

const rangeOptions = [
  { value: "3d", label: "Past 3 Days" },
  { value: "1w", label: "1 Week" },
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
];

const starOptions = [
  { value: "all", label: "All Ratings" },
  { value: "top", label: "Top Picks" },
  { value: "value", label: "Best Value" },
  { value: "5", label: "5 Star" },
  { value: "4", label: "4 Star" },
  { value: "3", label: "3 Star" },
  { value: "2", label: "2 Star" },
  { value: "1", label: "1 Star" },
];

export default function PerformanceRangeSelect({
  current,
  sport,
  stars,
}: {
  current: string;
  sport: string;
  stars: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParams(next: { range?: string; sport?: string; stars?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", next.range ?? current);
    params.set("sport", next.sport ?? sport);
    params.set("stars", next.stars ?? stars);
    router.push(`/performance?${params.toString()}`);
  }

  return (
    <div className="app-panel rounded-3xl p-5 mb-6 grid gap-4 md:grid-cols-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Performance Range</label>
        <select
          value={current}
          onChange={(e) => updateParams({ range: e.target.value })}
          className="app-input"
        >
          {rangeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

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
        <label className="block text-sm font-medium text-slate-700 mb-2">Confidence Rating</label>
        <select
          value={stars}
          onChange={(e) => updateParams({ stars: e.target.value })}
          className="app-input"
        >
          {starOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
