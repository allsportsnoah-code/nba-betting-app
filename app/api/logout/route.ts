import { NextResponse } from "next/server";
import { clearOwnerSession } from "@/lib/ownerAuth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearOwnerSession(response);
  return response;
}
