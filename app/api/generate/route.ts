import { NextResponse } from "next/server";
import { z } from "zod";
import { SOURCES } from "@/src/lib/catalog";
import { hasSession, isSameOrigin } from "@/src/lib/auth";
import { generateEditorialPackage } from "@/src/lib/gemini";
import { readApprovedSource } from "@/src/lib/source-reader";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  recentTopics: z.array(z.string().trim().min(1).max(140)).max(8),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  if (!(await hasSession())) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "Gemini is not configured yet. Add GEMINI_API_KEY to your local environment or Vercel settings." }, { status: 503 });

  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 8_000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    const payload: unknown = await request.json();
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) return NextResponse.json({ error: "Could not use the recent-topic history. Please try again." }, { status: 400 });

    const readResults = await Promise.all(SOURCES.map((source) => readApprovedSource(source)));
    if (!readResults.some((result) => result.status === "read")) {
      return NextResponse.json({
        error: "The approved Zenti pages could not be read this time. Try again later; no source claims were generated.",
        sourceStatuses: readResults.map(({ source, status, error }) => ({ id: source.id, status, error })),
      }, { status: 424 });
    }

    const contentPackage = await generateEditorialPackage({
      recentTopics: parsed.data.recentTopics.map((topic) => topic.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 140)),
    }, readResults);
    return NextResponse.json({
      contentPackage,
      sourceStatuses: readResults.map(({ source, status, error }) => ({ id: source.id, status, error })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed. Please try again.";
    if (message.includes("GEMINI_API_KEY")) return NextResponse.json({ error: message }, { status: 503 });
    if (message.includes("invalid JSON") || message.includes("required content format") || message.includes("recently used topic") || message.includes("Scene dialogue did not match")) {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    return NextResponse.json({ error: "Could not generate the package. Check your Gemini API setup and try again." }, { status: 502 });
  }
}
