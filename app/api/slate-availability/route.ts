import { NextRequest, NextResponse } from "next/server";
import { getNbaSlateAvailability, getSoccerSlateAvailability } from "@/lib/slateAvailability";

export async function GET(req: NextRequest) {
  const day = req.nextUrl.searchParams.get("day") === "tomorrow" ? "tomorrow" : "today";
  const sportParam = req.nextUrl.searchParams.get("sport");
  const sport = sportParam === "SOCCER" ? "SOCCER" : "NBA";

  const availability =
    sport === "SOCCER"
      ? await getSoccerSlateAvailability(req.nextUrl.searchParams.get("competition"), day)
      : await getNbaSlateAvailability(day);

  return NextResponse.json(availability, { status: availability.ok ? 200 : 502 });
}
