import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { SOURCES, type SourceRecord } from "@/src/lib/catalog";

const MAX_SOURCE_BYTES = 450_000;
const MAX_TEXT_CHARS = 14_000;
const REQUEST_TIMEOUT_MS = 8_000;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

export type SourceReference = {
  id: string;
  title: string;
  url?: string;
  kind: "official" | "link" | "document";
};

export type ReadSourceResult = {
  source: SourceReference;
  status: "read" | "unavailable";
  text?: string;
  error?: string;
};

export function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    return !(
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 88 && octets[2] === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && octets[2] === 100) ||
      (a === 203 && b === 0 && octets[2] === 113) ||
      a >= 224
    );
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    const parts = normalized.split(":");
    const firstHextet = Number.parseInt(parts[0] || "0", 16);
    const secondHextet = Number.parseInt(parts[1] || "0", 16);
    const globallyRoutable = firstHextet >= 0x2000 && firstHextet <= 0x3fff;
    const reservedDocumentation = (firstHextet === 0x2001 && (secondHextet <= 0x01ff || secondHextet === 0x0db8))
      || firstHextet === 0x2002
      || (firstHextet === 0x3fff && secondHextet <= 0x0fff);
    return globallyRoutable && !reservedDocumentation;
  }
  return false;
}

async function assertPublicDestination(url: URL): Promise<void> {
  if (url.protocol !== "https:" || url.port || url.username || url.password) {
    throw new Error("Source URL was rejected by the safety check.");
  }
  const allowed = SOURCES.some((source) => source.url === url.href);
  if (!allowed) throw new Error("Source redirect was outside the approved catalog.");

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error("Source host did not resolve to a public address.");
  }
}

async function readLimitedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_SOURCE_BYTES) throw new Error("Source page exceeded the size limit.");
  if (!response.body) throw new Error("Source page had no readable content.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error("Source page exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&", nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…",
  };
  return text
    .replace(/&#(\d+);?/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([\da-f]+);?/gi, (_, digits: string) => String.fromCodePoint(parseInt(digits, 16)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => named[name.toLowerCase()] ?? entity);
}

export function extractText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|svg|nav|footer|header|noscript|iframe|form|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<(br|\/p|\/h[1-6]|\/li|\/section|\/article|\/div)\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/[\t\r ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

export async function readApprovedSource(source: SourceRecord): Promise<ReadSourceResult> {
  const sourceReference: SourceReference = {
    id: source.id,
    title: source.title,
    url: source.url,
    kind: "official",
  };
  let current: URL;
  try {
    current = new URL(source.url);
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      await assertPublicDestination(current);
      const response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "user-agent": "ZentiContentEnginePrototype/1.0 (+public-page-reader)", accept: "text/html" },
      });

      if (REDIRECT_CODES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === 3) throw new Error("Source redirected too many times.");
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
      if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
        throw new Error("Source did not return an HTML page.");
      }

      const text = extractText(await readLimitedBody(response));
      if (text.length < 200) throw new Error("Source page did not contain enough readable text.");
      return { source: sourceReference, status: "read", text };
    }
    throw new Error("Source redirect could not be followed safely.");
  } catch (error) {
    const safeMessage = error instanceof Error && error.name === "TimeoutError"
      ? "Timed out while reading this page."
      : error instanceof Error && error.message.includes("fetch failed")
        ? "Could not reach this page."
        : error instanceof Error
          ? error.message
          : "Could not read this page.";
    return { source: sourceReference, status: "unavailable", error: safeMessage };
  }
}

export function excerptIsGrounded(excerpt: string, sourceTexts: Map<string, string>): boolean {
  const normalizedExcerpt = excerpt.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalizedExcerpt.length < 24) return false;
  return [...sourceTexts.values()].some((text) =>
    text.toLowerCase().replace(/\s+/g, " ").includes(normalizedExcerpt)
  );
}
