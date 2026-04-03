import { NextRequest, NextResponse } from "next/server";
import { isAutomationRequest } from "@/lib/ownerAuth";

async function callRoute(origin: string, path: string) {
  const secret = process.env.AUTO_SYNC_SECRET ?? "";
  const res = await fetch(`${origin}${path}`, {
    cache: "no-store",
    headers: secret ? { "x-auto-sync-secret": secret } : {},
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Auto sync failed for ${path}`);
  }

  return data;
}

export async function GET(req: NextRequest) {
  try {
    if (!isAutomationRequest(req)) {
      return NextResponse.json({ ok: false, error: "Automation secret required." }, { status: 401 });
    }

    const task = req.nextUrl.searchParams.get("task") ?? "slate";
    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const origin = req.nextUrl.origin;
    const results: Record<string, unknown> = {};

    if (task === "slate" || task === "all") {
      results.nbaOdds = await callRoute(origin, `/api/sync-team-odds?day=${day}`);
      results.nbaTop = await callRoute(origin, `/api/sync-top-picks?day=${day}`);
      results.mlbOdds = await callRoute(origin, `/api/sync-mlb-odds?day=${day}`);
      results.mlbTop = await callRoute(origin, `/api/sync-mlb-top-picks?day=${day}`);
    }

    if (task === "grade" || task === "all") {
      results.grade = await callRoute(origin, "/api/grade-picks");
    }

    return NextResponse.json({ ok: true, task, day, results });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
