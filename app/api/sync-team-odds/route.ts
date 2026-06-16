import { NextRequest, NextResponse } from "next/server";
import { setCachedData } from "@/lib/cache";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { recordManualSyncUsage, requireSyncAccess } from "@/lib/ownerAuth";
import { getRequestOrigin } from "@/lib/requestOrigin";

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req, { countAgainstLimit: true });
    if (!access.ok) return access.response;

    const dayParam = req.nextUrl.searchParams.get("day");
    const origin = getRequestOrigin(req);

    const oddsRes = await fetch(`${origin}/api/odds?day=${dayParam ?? "today"}`, {
      cache: "no-store",
    });

    const odds = await oddsRes.json();

    if (!odds.ok) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: odds.error }, { status: 500 }, { fallbackPath: "/dashboard" });
    }

    const formattedDate = odds.businessDate;
    const gameCount = Array.isArray(odds.data) ? odds.data.length : 0;

    await setCachedData(`team_odds_${dayParam ?? "today"}`, {
      ...odds,
      businessDate: formattedDate,
    });

    if (gameCount === 0) {
      return apiJsonOrNativeRedirect(req, {
        ok: true,
        skipped: true,
        message: `No NBA games found for ${formattedDate}. Team odds were cached as an empty slate.`,
        businessDate: formattedDate,
        gameCount,
      }, undefined, { fallbackPath: "/dashboard" });
    }

    if (access.access === "owner") {
      await recordManualSyncUsage("sync-team-odds");
    }

    return apiJsonOrNativeRedirect(req, {
      ok: true,
      message: `Cached team odds for ${formattedDate}`,
      businessDate: formattedDate,
      gameCount,
    }, undefined, { fallbackPath: "/dashboard" });
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
      { fallbackPath: "/dashboard" }
    );
  }
}
