"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    try {
      setLoading(true);
      await fetch("/api/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="rounded-full border border-teal-700/15 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 hover:border-teal-700/20 hover:bg-white"
    >
      {loading ? "Signing out..." : "Logout"}
    </button>
  );
}
