"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

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

const boardOptions = [
  { value: "all", label: "All Official Picks" },
  { value: "top", label: "Top Picks" },
  { value: "value", label: "Best Value" },
  { value: "free", label: "Free Picks" },
];

export default function GradesFilterSelect({
  sport,
  scope,
  board,
}: {
  sport: string;
  scope: string;
  board: string;
}) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [pendingValues, setPendingValues] = useState({ sport, scope, board });

  const selectedSport = loading ? pendingValues.sport : sport;
  const selectedScope = loading ? pendingValues.scope : scope;
  const selectedBoard = loading ? pendingValues.board : board;

  function updateParams(next: { sport?: string; scope?: string; board?: string }) {
    const nextValues = {
      sport: next.sport ?? sport,
      scope: next.scope ?? scope,
      board: next.board ?? board,
    };
    const params = new URLSearchParams(searchParams.toString());
    params.set("sport", nextValues.sport);
    params.set("scope", nextValues.scope);
    params.set("board", nextValues.board);

    setPendingValues(nextValues);
    setLoading(true);
    window.location.assign(`/grades?${params.toString()}`);
  }

  return (
    <div className="app-panel rounded-3xl p-5 mb-6 grid gap-4 md:grid-cols-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Sport</label>
        <select
          value={selectedSport}
          onChange={(e) => updateParams({ sport: e.target.value })}
          disabled={loading}
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
          value={selectedScope}
          onChange={(e) => updateParams({ scope: e.target.value })}
          disabled={loading}
          className="app-input"
        >
          {scopeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Board</label>
        <select
          value={selectedBoard}
          onChange={(e) => updateParams({ board: e.target.value })}
          disabled={loading}
          className="app-input"
        >
          {boardOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="md:col-span-3 text-sm font-medium text-slate-600">
          Loading selected Grades view...
        </div>
      ) : null}
    </div>
  );
}
