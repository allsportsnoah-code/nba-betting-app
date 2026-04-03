import { NextRequest, NextResponse } from "next/server";
import { setCachedData } from "@/lib/cache";
import { recordManualSyncUsage, requireSyncAccess } from "@/lib/ownerAuth";

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req, { countAgainstLimit: true });
    if (!access.ok) return access.response;

    const dayParam = req.nextUrl.searchParams.get("day");
    const origin = req.nextUrl.origin;

    const oddsRes = await fetch(`${origin}/api/odds?day=${dayParam ?? "today"}`, {
      cache: "no-store",
    });

    const odds = await oddsRes.json();

    if (!odds.ok) {
      return NextResponse.json({ ok: false, error: odds.error }, { status: 500 });
    }

    const formattedDate = odds.businessDate;

    await setCachedData(`team_odds_${dayParam ?? "today"}`, {
      ...odds,
      businessDate: formattedDate,
    });

    if (access.access === "owner") {
      await recordManualSyncUsage("sync-team-odds");
    }

    return NextResponse.json({
      ok: true,
      message: `Cached team odds for ${formattedDate}`,
      businessDate: formattedDate,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
