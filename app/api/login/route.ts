import { NextRequest, NextResponse } from "next/server";
import { credentialsMatch, setOwnerSession } from "@/lib/ownerAuth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");

    if (!credentialsMatch(username, password)) {
      return NextResponse.json({ ok: false, error: "Invalid login." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    setOwnerSession(response, username);
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
