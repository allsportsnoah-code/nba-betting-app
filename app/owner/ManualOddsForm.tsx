"use client";

import { useState, type FormEvent } from "react";

type ImportStatus = {
  tone: "success" | "error";
  text: string;
};

const CSV_TEMPLATE = [
  "sportsbook,away_team,home_team,time,away_ml,home_ml,draw_ml,away_spread,away_spread_odds,home_spread,home_spread_odds,total,over_odds,under_odds",
  "DraftKings,New York Yankees,Boston Red Sox,7:10 PM,-115,-105,,-1.5,+145,1.5,-175,8.5,-110,-110",
].join("\n");

export default function ManualOddsForm() {
  const [sport, setSport] = useState("MLB");
  const [day, setDay] = useState("today");
  const [competition, setCompetition] = useState("world_cup");
  const [businessDate, setBusinessDate] = useState("");
  const [rawOdds, setRawOdds] = useState("");
  const [refreshPicks, setRefreshPicks] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ImportStatus | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/manual-odds", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sport,
          day,
          competition,
          businessDate,
          rawOdds,
          refreshPicks,
        }),
      });

      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setStatus({
          tone: "error",
          text: data.error ?? "Manual odds import failed.",
        });
        return;
      }

      const refreshMessage =
        data.pickRefresh?.ok === true
          ? " Picks refreshed."
          : data.warning
            ? ` ${data.warning}`
            : "";

      setStatus({
        tone: data.warning ? "error" : "success",
        text: `Imported ${data.gameCount} game(s) for ${data.businessDate}.${refreshMessage}`,
      });
    } catch {
      setStatus({
        tone: "error",
        text: "Manual odds import failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Sport
          <select
            value={sport}
            onChange={(event) => setSport(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
          >
            <option value="MLB">MLB</option>
            <option value="NBA">NBA</option>
            <option value="SOCCER">Soccer</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Day
          <select
            value={day}
            onChange={(event) => setDay(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
          >
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Business date
          <input
            type="date"
            value={businessDate}
            onChange={(event) => setBusinessDate(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
          />
        </label>

        {sport === "SOCCER" ? (
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Competition
            <select
              value={competition}
              onChange={(event) => setCompetition(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
            >
              <option value="world_cup">World Cup</option>
              <option value="mls">MLS</option>
            </select>
          </label>
        ) : (
          <div />
        )}
      </div>

      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        Odds CSV or JSON
        <textarea
          value={rawOdds}
          onChange={(event) => setRawOdds(event.target.value)}
          placeholder={CSV_TEMPLATE}
          rows={9}
          className="min-h-56 rounded-2xl border border-slate-200 bg-white px-3 py-3 font-mono text-xs leading-5 text-slate-900 shadow-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRawOdds(CSV_TEMPLATE)}
          className="app-button app-button-secondary"
        >
          Load CSV Template
        </button>

        <label className="app-pill flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={refreshPicks}
            onChange={(event) => setRefreshPicks(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600"
          />
          Refresh picks
        </label>

        <button
          type="submit"
          disabled={loading}
          className="app-button app-button-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Importing..." : "Import Odds"}
        </button>
      </div>

      {status ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            status.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {status.text}
        </p>
      ) : null}
    </form>
  );
}
