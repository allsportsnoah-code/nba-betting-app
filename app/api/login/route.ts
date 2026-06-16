import { NextRequest, NextResponse } from "next/server";
import { credentialsMatch, setOwnerSession } from "@/lib/ownerAuth";
import { getRequestUrl } from "@/lib/requestOrigin";

async function readCredentials(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await req.json();
    return {
      username: String(body.username ?? ""),
      password: String(body.password ?? ""),
      wantsJson: true,
    };
  }

  const form = await req.formData();
  return {
    username: String(form.get("username") ?? ""),
    password: String(form.get("password") ?? ""),
    wantsJson: false,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { username, password, wantsJson } = await readCredentials(req);

    if (!credentialsMatch(username, password)) {
      if (wantsJson) {
        return NextResponse.json({ ok: false, error: "Invalid login." }, { status: 401 });
      }

      return NextResponse.redirect(getRequestUrl(req, "/login?error=invalid"), { status: 303 });
    }

    const response = wantsJson
      ? NextResponse.json({ ok: true })
      : NextResponse.redirect(getRequestUrl(req, "/"), { status: 303 });

    setOwnerSession(response, username);
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
