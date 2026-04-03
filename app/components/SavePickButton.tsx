"use client";

import { useState } from "react";

type SavePickPayload = {
  pick_date: string;
  sport: "NBA" | "NFL" | "MLB";
  market_scope: "team" | "player_prop" | "live";
  market_type: string;
  game_label: string;
  home_team?: string | null;
  away_team?: string | null;
  player_name?: string | null;
  sportsbook?: string;
  side: string;
  line_taken?: number | null;
  odds_taken: number;
  stake_units: number;
  confidence_score?: number | null;
  projected_line?: number | null;
  market_line?: number | null;
  edge?: number | null;
  edge_label?: string | null;
  top_pick_rank?: number | null;
  is_top_pick?: boolean;
  status?: "pending" | "win" | "loss" | "push";
  final_score?: string | null;
  final_stat?: number | null;
  closing_line?: number | null;
  clv?: number | null;
  notes?: string | null;
};

export default function SavePickButton({ payload }: { payload: SavePickPayload }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    try {
      setSaving(true);
      setMessage("");

      const res = await fetch("/api/picks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.error || "Failed to save pick");
        return;
      }

      setMessage("Saved");
    } catch {
      setMessage("Failed to save pick");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-3 py-2 rounded-lg border bg-black text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Pick"}
      </button>

      {message && <p className="text-sm mt-2">{message}</p>}
    </div>
  );
}