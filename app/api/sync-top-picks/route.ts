import { NextRequest, NextResponse } from "next/server";
import { requireSyncAccess } from "@/lib/ownerAuth";

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req);
    if (!access.ok) return access.response;

    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const origin = req.nextUrl.origin;

    const res = await fetch(`${origin}/api/daily-picks?day=${day}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json({ ok: false, error: data.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: `Top picks synced for ${day}`,
      data: data.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
