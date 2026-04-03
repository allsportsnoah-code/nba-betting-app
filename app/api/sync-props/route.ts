import { NextRequest, NextResponse } from "next/server";
import { setCachedData } from "@/lib/cache";
import { recordManualSyncUsage, requireSyncAccess } from "@/lib/ownerAuth";

export async function GET(req: NextRequest) {
  try {
    const access = await requireSyncAccess(req, { countAgainstLimit: true });
    if (!access.ok) return access.response;

    const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
    const propType = req.nextUrl.searchParams.get("propType") ?? "points";
    const origin = req.nextUrl.origin;

    const propsRes = await fetch(`${origin}/api/props?day=${day}&propType=${propType}`, {
      cache: "no-store",
    });

    const props = await propsRes.json();

    if (!props.ok) {
      return NextResponse.json({ ok: false, error: props.error }, { status: 500 });
    }

    await setCachedData(`props_${day}_${propType}`, props);

    if (access.access === "owner") {
      await recordManualSyncUsage(`sync-props-${propType}`);
    }

    return NextResponse.json({
      ok: true,
      message: `Cached props for ${day} - ${propType}`,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
