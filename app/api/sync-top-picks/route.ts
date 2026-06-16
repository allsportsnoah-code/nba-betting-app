import { NextRequest, NextResponse } from "next/server";
import { apiJsonOrNativeRedirect } from "@/lib/nativeApiResponse";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getRequestOrigin } from "@/lib/requestOrigin";

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const origin = getRequestOrigin(req);

    const res = await fetch(`${origin}/api/daily-picks?day=${day}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (!data.ok) {
      return apiJsonOrNativeRedirect(req, { ok: false, error: data.error }, { status: 500 }, { fallbackPath: "/dashboard" });
    }

    return apiJsonOrNativeRedirect(req, {
      ok: true,
      message: `Top picks synced for ${day}`,
      data: data.data ?? [],
    }, undefined, { fallbackPath: "/dashboard" });
  } catch (error) {
    return apiJsonOrNativeRedirect(
      req,
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
      { fallbackPath: "/dashboard" }
    );
  }
}
