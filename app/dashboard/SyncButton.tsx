"use client";

import { useState } from "react";

export default function SyncButton({
  label,
  endpoint,
  description,
}: {
  label: string;
  endpoint: string;
  description?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleClick() {
    try {
      setLoading(true);
      setMessage("");

      const res = await fetch(endpoint);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.error || "Sync failed");
        return;
      }

      setMessage("Done");
      window.location.reload();
    } catch {
      setMessage("Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="app-button app-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Working..." : label}
      </button>
      {message && <p className="text-sm mt-2 text-slate-600">{message}</p>}
      {description && !message && <p className="text-xs mt-2 text-slate-500">{description}</p>}
    </div>
  );
}
