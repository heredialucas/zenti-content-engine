import "server-only";
import * as https from "node:https";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { extractText, isPublicIp, type ReadSourceResult, type SourceReference } from "@/src/lib/source-reader";

const MAX_URL_LENGTH = 2_048;
const MAX_URL_BYTES = 3_000_000;
const MAX_DOCUMENT_BYTES = 3_000_000;
const MAX_EXTRACTED_CHARS = 12_000;
const MAX_PDF_PAGES = 12;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const PDF_TIMEOUT_MS = 8_000;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_QUERY_KEY = /^(?:access[_-]?token|api[_-]?key|auth(?:orization)?|code|credential|jwt|key|password|passwd|secret|session(?:id)?|sig(?:nature)?|token)$/i;

type PinnedResponse = {
  status: number;
  location?: string;
  contentType: string;
  contentEncoding: string;
  body: Buffer;
};

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
}

function parsePublicUrl(value: string): URL {
  if (value.length > MAX_URL_LENGTH) throw new Error("Keep the extra link under 2,048 characters.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid public HTTPS link.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || isIP(hostname)) {
    throw new Error("Use a public HTTPS page without login details, a custom port, or a fragment.");
  }
  if ([...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key))) {
    throw new Error("Remove access tokens or credential parameters from the link.");
  }
  return url;
}

async function resolvePublicAddresses(url: URL) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error("The link host resolved to a private or reserved address and was blocked.");
  }
  return addresses;
}

function requestPinned(url: URL, maxBytes: number): Promise<PinnedResponse> {
  return resolvePublicAddresses(url).then((addresses) => new Promise((resolve, reject) => {
    const pinnedLookup: NonNullable<https.RequestOptions["lookup"]> = (hostname, options, callback) => {
      if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
        const error = Object.assign(new Error("Unexpected DNS lookup host."), { code: "EHOSTUNREACH" });
        callback(error, "", 0);
        return;
      }
      const requestedFamily = typeof options === "number" ? options : options.family;
      const family = requestedFamily === "IPv4" ? 4 : requestedFamily === "IPv6" ? 6 : requestedFamily;
      const candidates = addresses.filter((item) => !family || family === 0 || item.family === family);
      if (!candidates.length) {
        const error = Object.assign(new Error("No validated address for requested family."), { code: "EHOSTUNREACH" });
        callback(error, "", 0);
        return;
      }
      if (typeof options === "object" && options.all) callback(null, candidates);
      else callback(null, candidates[0].address, candidates[0].family);
    };

    const request = https.request(url, {
      method: "GET",
      lookup: pinnedLookup,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      maxHeaderSize: 16_384,
      headers: {
        accept: "text/html, application/xhtml+xml, text/plain, application/pdf",
        "accept-encoding": "identity",
        "user-agent": "ZentiContentEnginePrototype/1.0 (+public-page-reader)",
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = typeof response.headers.location === "string" ? response.headers.location : undefined;
      const contentType = typeof response.headers["content-type"] === "string" ? response.headers["content-type"] : "";
      const contentEncoding = typeof response.headers["content-encoding"] === "string" ? response.headers["content-encoding"] : "identity";
      const declaredLength = Number(response.headers["content-length"] ?? 0);

      if (REDIRECT_CODES.has(status)) {
        response.destroy();
        resolve({ status, location, contentType, contentEncoding, body: Buffer.alloc(0) });
        return;
      }
      if (declaredLength > maxBytes) {
        response.destroy();
        reject(new Error("The source exceeds the allowed size."));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.byteLength;
        if (total > maxBytes) {
          response.destroy(new Error("The source exceeds the allowed size."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => resolve({ status, location, contentType, contentEncoding, body: Buffer.concat(chunks, total) }));
      response.on("error", reject);
    });

    request.on("error", reject);
    request.end();
  }));
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("PDF text extraction timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const { extractText: extractPdfText, getDocumentProxy } = await import("unpdf");
  const pdf = await withTimeout(getDocumentProxy(bytes, { maxImageSize: 4_000_000, stopAtErrors: true }), PDF_TIMEOUT_MS);
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDFs are limited to ${MAX_PDF_PAGES} pages.`);
    const { text } = await withTimeout(extractPdfText(pdf, { mergePages: true }), PDF_TIMEOUT_MS);
    return normalizeText(text);
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}

function safeFailure(error: unknown): string {
  if (!(error instanceof Error)) return "Could not read this extra source.";
  if (error.message.startsWith("Enter a valid") || error.message.startsWith("Use a public") || error.message.startsWith("Remove access") || error.message.startsWith("Choose a PDF") || error.message.startsWith("TXT files") || error.message.startsWith("The selected file") || error.message.startsWith("The document is empty")) return error.message;
  if (error.message.includes("private or reserved")) return error.message;
  if (error.message.includes("redirect")) return "The link redirected outside the safe source rules.";
  if (error.message.includes("unsuccessful response")) return "The link returned an unsuccessful response.";
  if (error.message.includes("extractable text")) return "This source did not contain enough extractable text.";
  if (error.message.includes("must return")) return error.message;
  if (error.message.includes("allowed size")) return error.message;
  if (error.message.includes("page")) return error.message;
  if (error.message.includes("timed out") || error.name === "TimeoutError" || error.name === "AbortError") return "Reading this source timed out.";
  return "Could not read or extract text from this source.";
}

export async function readAdditionalUrl(value: string): Promise<ReadSourceResult> {
  let current: URL;
  try {
    current = parsePublicUrl(value.trim());
  } catch (error) {
    return { source: { id: "additional-link", title: "Additional link", kind: "link" }, status: "unavailable", error: safeFailure(error) };
  }

  const source: SourceReference = { id: "additional-link", title: `Additional page · ${current.hostname}`, url: current.toString(), kind: "link" };
  try {
    let response: PinnedResponse | undefined;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      response = await requestPinned(current, MAX_URL_BYTES);
      if (!REDIRECT_CODES.has(response.status)) break;
      if (!response.location || redirectCount === MAX_REDIRECTS) throw new Error("The link redirected too many times.");
      current = parsePublicUrl(new URL(response.location, current).toString());
    }
    if (!response || response.status < 200 || response.status >= 300) throw new Error("The source returned an unsuccessful response.");
    if (response.contentEncoding !== "identity") throw new Error("Compressed extra sources are not supported.");

    const contentType = response.contentType.split(";", 1)[0].trim().toLowerCase();
    let text: string;
    if (contentType === "application/pdf" || response.body.subarray(0, 5).toString("ascii") === "%PDF-") {
      text = await extractPdf(new Uint8Array(response.body));
    } else if (contentType === "text/html" || contentType === "application/xhtml+xml") {
      text = extractText(response.body.toString("utf8"));
    } else if (contentType === "text/plain") {
      text = normalizeText(new TextDecoder("utf-8", { fatal: true }).decode(response.body));
    } else {
      throw new Error("The link must return an HTML page, plain-text file, or PDF.");
    }
    if (text.length < 120) throw new Error("This source did not contain enough extractable text.");
    return { source, status: "read", text: text.slice(0, MAX_EXTRACTED_CHARS) };
  } catch (error) {
    return { source, status: "unavailable", error: safeFailure(error) };
  }
}

export async function readUploadedDocument(file: File): Promise<ReadSourceResult> {
  const extension = file.name.toLowerCase().split(".").at(-1);
  const kind = extension === "pdf" ? "PDF" : extension === "txt" ? "text file" : "document";
  const source: SourceReference = {
    id: "additional-document",
    title: `Uploaded ${kind}`,
    kind: "document",
  };
  try {
    if (file.size === 0) throw new Error("The selected document is empty.");
    if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Documents must be 3 MB or smaller.");
    if (extension !== "pdf" && extension !== "txt") throw new Error("Choose a PDF or TXT file.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    let text: string;
    if (extension === "pdf") {
      if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") throw new Error("The selected file is not a valid PDF.");
      text = await extractPdf(bytes);
    } else {
      if (file.type && file.type !== "text/plain" && file.type !== "application/octet-stream") {
        throw new Error("TXT files must use the plain-text format.");
      }
      text = normalizeText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    }
    if (text.length < 40) throw new Error("The document did not contain enough extractable text.");
    return { source, status: "read", text: text.slice(0, MAX_EXTRACTED_CHARS) };
  } catch (error) {
    return { source, status: "unavailable", error: safeFailure(error) };
  }
}
