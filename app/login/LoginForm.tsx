"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "Login failed.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setMessage("Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="app-panel rounded-3xl p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="app-input"
          autoComplete="username"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="app-input"
          autoComplete="current-password"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="app-button app-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Signing in..." : "Owner Login"}
      </button>

      {message && <p className="text-sm text-rose-700">{message}</p>}
    </form>
  );
}
