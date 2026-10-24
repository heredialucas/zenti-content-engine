import { NextResponse } from "next/server";
import { z } from "zod";
import { SOURCES } from "@/src/lib/catalog";
import { hasSession, isSameOrigin } from "@/src/lib/auth";
import { readAdditionalUrl, readUploadedDocument } from "@/src/lib/additional-source-reader";
import { generateEditorialPackage } from "@/src/lib/gemini";
import { readApprovedSource } from "@/src/lib/source-reader";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  recentTopics: z.array(z.string().trim().min(1).max(140)).max(8),
  additionalUrl: z.string().trim().max(2_048).optional().default(""),
});

const MAX_FORM_BODY_BYTES = 3_300_000;
const MAX_DOCUMENT_BYTES = 3_000_000;

class FormBodyTooLargeError extends Error {}

async function readLimitedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) throw new Error("Expected a multipart form.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("The request body is empty.");

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new FormBodyTooLargeError("The request body exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, { headers: { "content-type": contentType } }).formData();
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  if (!(await hasSession())) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "Gemini is not configured yet. Add GEMINI_API_KEY to your local environment or Vercel settings." }, { status: 503 });

  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(length) && length > MAX_FORM_BODY_BYTES) return NextResponse.json({ error: "The document must be 3 MB or smaller." }, { status: 413 });
    let formData: FormData;
    try {
      formData = await readLimitedFormData(request, MAX_FORM_BODY_BYTES);
    } catch (error) {
      if (error instanceof FormBodyTooLargeError) return NextResponse.json({ error: "The document must be 3 MB or smaller." }, { status: 413 });
      return NextResponse.json({ error: "Could not read the extra sources. Check the file and try again." }, { status: 400 });
    }
    const allowedFields = new Set(["recentTopics", "additionalUrl", "document"]);
    if ([...formData.keys()].some((field) => !allowedFields.has(field))) {
      return NextResponse.json({ error: "The request included an unsupported field." }, { status: 400 });
    }
    if (formData.getAll("recentTopics").length !== 1 || formData.getAll("additionalUrl").length > 1 || formData.getAll("document").length > 1) {
      return NextResponse.json({ error: "Add only one recent-topic list, one link, and one document." }, { status: 400 });
    }
    const recentTopicsValue = formData.get("recentTopics");
    if (typeof recentTopicsValue !== "string") return NextResponse.json({ error: "Could not use the recent-topic history. Please try again." }, { status: 400 });

    let recentTopics: unknown;
    try {
      recentTopics = JSON.parse(recentTopicsValue);
    } catch {
      return NextResponse.json({ error: "Could not use the recent-topic history. Please try again." }, { status: 400 });
    }
    const urlValue = formData.get("additionalUrl");
    const documentValue = formData.get("document");
    if (urlValue !== null && typeof urlValue !== "string") return NextResponse.json({ error: "The extra link must be text." }, { status: 400 });
    if (documentValue !== null && !(documentValue instanceof File)) return NextResponse.json({ error: "Choose one PDF or TXT document." }, { status: 400 });
    if (documentValue instanceof File && documentValue.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: "The document must be 3 MB or smaller." }, { status: 413 });

    const payload: unknown = {
      recentTopics,
      additionalUrl: urlValue ?? "",
    };
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) return NextResponse.json({ error: "Check the extra link and try again." }, { status: 400 });

    const extraReads: Promise<Awaited<ReturnType<typeof readApprovedSource>>>[] = [];
    if (parsed.data.additionalUrl) extraReads.push(readAdditionalUrl(parsed.data.additionalUrl));
    if (documentValue instanceof File) extraReads.push(readUploadedDocument(documentValue));
    const readResults = await Promise.all([
      ...SOURCES.map((source) => readApprovedSource(source)),
      ...extraReads,
    ]);
    if (!readResults.some((result) => result.status === "read")) {
      return NextResponse.json({
        error: "No source could be read this time. Check the extra material or try again later; no claims were generated.",
        sourceStatuses: readResults.map(({ source, status, error }) => ({ ...source, status, error })),
      }, { status: 424 });
    }

    const contentPackage = await generateEditorialPackage({
      recentTopics: parsed.data.recentTopics.map((topic) => topic.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 140)),
    }, readResults);
    return NextResponse.json({
      contentPackage,
      sourceStatuses: readResults.map(({ source, status, error }) => ({ ...source, status, error })),
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
