import { NextResponse } from "next/server";
import { hasSession, isSameOrigin, SESSION_COOKIE } from "@/src/lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  if (!(await hasSession())) return NextResponse.json({ ok: true });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
