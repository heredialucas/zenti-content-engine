import { NextResponse } from "next/server";
import { authIsConfigured, createSessionToken, isSameOrigin, SESSION_COOKIE, verifyPassword } from "@/src/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  if (!authIsConfigured()) return NextResponse.json({ error: "Private access is not configured. Set APP_PASSWORD and a SESSION_SECRET of at least 32 characters." }, { status: 503 });

  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 2_000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("password" in body) || typeof body.password !== "string" || body.password.length > 256) {
      return NextResponse.json({ error: "Enter the access password." }, { status: 400 });
    }
    if (!verifyPassword(body.password)) return NextResponse.json({ error: "That password was not recognized." }, { status: 401 });

    const { token, expires } = createSessionToken();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Could not sign in. Please try again." }, { status: 400 });
  }
}
