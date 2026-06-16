import { NextRequest, NextResponse } from "next/server";
import { requireSyncAccess } from "@/lib/ownerAuth";
import { getRequestOrigin } from "@/lib/requestOrigin";

export async function GET(req: NextRequest) {
  const access = await requireSyncAccess(req);

  if (!access.ok) {
    return access.response;
  }

  return NextResponse.json({
    ok: true,
    access: access.access,
    origin: getRequestOrigin(req),
  });
}
