"use client";

import { useMemo, useState, type FormEvent } from "react";

function getFormParts(endpoint: string) {
  const url = new URL(endpoint, "http://betting-lab.local");

  return {
    action: url.pathname,
    fields: Array.from(url.searchParams.entries()),
  };
}

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
  const formParts = useMemo(() => getFormParts(endpoint), [endpoint]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const res = await fetch(endpoint, {
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }

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
    <form
      action={formParts.action}
      method="get"
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200/80 bg-white/78 p-3 shadow-sm"
    >
      {formParts.fields.map(([name, value], index) => (
        <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="native" value="1" />
      <button
        type="submit"
        disabled={loading}
        className="app-button app-button-primary flex w-full items-center justify-between gap-3 text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{loading ? "Working..." : label}</span>
        <span className="text-sm font-semibold text-white/80">{loading ? "..." : "Run"}</span>
      </button>
      {message ? (
        <p className="mt-2 text-sm font-medium text-slate-700">{message}</p>
      ) : description ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
      ) : null}
    </form>
  );
}
