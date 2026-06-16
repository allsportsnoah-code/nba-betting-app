import { NextRequest, NextResponse } from "next/server";
import { clearOwnerSession } from "@/lib/ownerAuth";
import { getRequestUrl } from "@/lib/requestOrigin";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const accept = req.headers.get("accept") ?? "";
  const wantsJson = contentType.includes("application/json") || accept.includes("application/json");

  const response = wantsJson
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(getRequestUrl(req, "/"), { status: 303 });
  clearOwnerSession(response);
  return response;
}
