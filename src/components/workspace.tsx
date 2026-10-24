"use client";

import { startTransition, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clipboard,
  FileText,
  Film,
  LogOut,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { SOURCES } from "@/src/lib/catalog";
import type { ContentPackage } from "@/src/lib/package-schema";

type PackageTab = "overview" | "content" | "scenes" | "metrics";
type SourceKind = "official" | "link" | "document";
type SourceState = { status: "read" | "unavailable"; error?: string; title?: string; url?: string; kind?: SourceKind };
type SourceStatuses = Record<string, SourceState>;

const PACKAGE_KEY = "zenti:last-package:v1";
const SOURCE_STATUS_KEY = "zenti:last-source-statuses:v1";
const RECENT_TOPICS_KEY = "zenti:recent-topics:v1";
const LEGACY_LANGUAGE_KEY = "zenti:content-language:v1";
const MAX_RECENT_TOPICS = 8;
const MAX_EXTRA_FILE_BYTES = 3_000_000;
const ALLOWED_SOURCE_IDS = new Set([...SOURCES.map((source) => source.id), "additional-link", "additional-document"]);
const SENSITIVE_QUERY_KEY = /^(?:access[_-]?token|api[_-]?key|auth(?:orization)?|code|credential|jwt|key|password|passwd|secret|session(?:id)?|sig(?:nature)?|token)$/i;

const PACKAGE_TABS: { id: PackageTab; label: string; icon: typeof FileText }[] = [
  { id: "overview", label: "Overview", icon: Sparkles },
  { id: "content", label: "Content", icon: FileText },
  { id: "scenes", label: "Scenes", icon: Film },
  { id: "metrics", label: "Metrics", icon: BarChart3 },
];

const ILLUSTRATIVE_METRICS = [
  { label: "Views", value: "8,420", description: "Video views in an example 7-day window", measure: "Use the publishing platform's own view definition." },
  { label: "Average watch time", value: "18.6 sec", description: "Average time watched per view", measure: "Compare videos of similar length." },
  { label: "Completion rate", value: "43%", description: "Example share of viewers reaching the end", measure: "Use the platform's completion definition." },
  { label: "CTA link visits", value: "136", description: "Example visits to the campaign link", measure: "Use tagged links or destination analytics." },
] as const;

function packageAsMarkdown(result: ContentPackage): string {
  return `# ${result.shortTitle}

**Recommended topic:** ${result.topic}
**Audience:** ${result.targetAudience}

## Editorial angle

${result.contentAngle}

## Hook

${result.hook}

## Voiceover script

${result.voiceoverScript}

## Scenes

${result.scenePlan.map((scene) => `### Scene ${scene.sceneNumber} — ${scene.purpose} (${scene.durationSeconds}s)

**Dialogue:** ${scene.spokenLine}

**Visual:** ${scene.visualDescription}

**On-screen text (add in editing):** ${scene.onScreenText}

**Video prompt:**

${scene.flowPrompt}`).join("\n\n")}

## Full presenter prompt

${result.fullFlowPrompt}

## Global consistency prompt

${result.globalFlowConsistencyPrompt}

## YouTube

**${result.youtubeTitle}**

${result.youtubeDescription}

## LinkedIn

${result.linkedinPost}

## CTA

[${result.ctaText}](${result.ctaUrl})

## Sources actually read

${result.sources.map((source) => source.url ? `- [${source.title}](${source.url})` : `- ${source.title} (uploaded document)`).join("\n")}

## Claims to review

${result.claims.map((claim) => `- **${claim.status === "supported" ? "Supported excerpt — verify in context" : "Needs human review"}:** ${claim.claim}${claim.supportingExcerpt ? `\n  > ${claim.supportingExcerpt}` : ""}`).join("\n")}

## Human review notes

${result.humanReviewNotes.map((note) => `- ${note}`).join("\n")}`;
}

function isStoredPackage(value: unknown): value is ContentPackage {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const requiredText = ["topic", "targetAudience", "contentAngle", "shortTitle", "hook", "voiceoverScript", "fullFlowPrompt", "globalFlowConsistencyPrompt", "youtubeTitle", "youtubeDescription", "linkedinPost", "ctaText", "ctaUrl"];
  return requiredText.every((field) => typeof data[field] === "string")
    && Array.isArray(data.scenePlan)
    && Array.isArray(data.sources)
    && data.sources.every((source) => {
      if (!source || typeof source !== "object") return false;
      const item = source as Record<string, unknown>;
      return typeof item.id === "string" && typeof item.title === "string"
        && (item.url === undefined || isSafeHttpsUrl(item.url))
        && (item.kind === undefined || item.kind === "official" || item.kind === "link" || item.kind === "document");
    })
    && Array.isArray(data.claims)
    && Array.isArray(data.humanReviewNotes);
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Browser storage is optional. */ }
}

function safeRecentTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((topic): topic is string => typeof topic === "string")
    .map((topic) => topic.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 140))
    .filter(Boolean)
    .slice(0, MAX_RECENT_TOPICS);
}

function safeSourceStatuses(value: unknown): SourceStatuses {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const statuses: SourceStatuses = {};
  for (const id of ALLOWED_SOURCE_IDS) {
    const candidate = record[id];
    if (!candidate || typeof candidate !== "object" || !("status" in candidate)) continue;
    if (candidate.status !== "read" && candidate.status !== "unavailable") continue;
    const metadata = candidate as Record<string, unknown>;
    const url = isSafeHttpsUrl(metadata.url) ? metadata.url : undefined;
    statuses[id] = {
      status: candidate.status,
      ...(typeof metadata.error === "string" ? { error: metadata.error.slice(0, 180) } : {}),
      ...(typeof metadata.title === "string" ? { title: metadata.title.slice(0, 160) } : {}),
      ...(url ? { url } : {}),
      ...(metadata.kind === "official" || metadata.kind === "link" || metadata.kind === "document" ? { kind: metadata.kind } : {}),
    };
  }
  return statuses;
}

function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validateAdditionalUrl(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) {
      return "Use a public HTTPS link without sign-in details or a custom port.";
    }
    if ([...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key))) {
      return "Remove access tokens or credentials from the link before adding it.";
    }
    return null;
  } catch {
    return "Enter a valid HTTPS link.";
  }
}

function downloadPackage(result: ContentPackage) {
  const blob = new Blob([packageAsMarkdown(result)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zenti-content-package.md";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function CopyButton({ text, label = "Copy", subtle = false }: { text: string; label?: string; subtle?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className={`btn ${subtle ? "btn-quiet" : "btn-secondary"} btn-small`} type="button" onClick={copy} aria-live="polite">
      {copied ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function LoadingMark() {
  return <span className="loading-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function ExtraSourceControls({
  additionalUrl,
  document,
  error,
  busy,
  onUrlChange,
  onDocumentChange,
  onError,
}: {
  additionalUrl: string;
  document: File | null;
  error: string;
  busy: boolean;
  onUrlChange: (value: string) => void;
  onDocumentChange: (file: File | null) => void;
  onError: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").at(-1);
    if (extension !== "pdf" && extension !== "txt") {
      onError("Choose a PDF or TXT document.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_EXTRA_FILE_BYTES) {
      onError("Documents must be 3 MB or smaller.");
      event.target.value = "";
      return;
    }
    onError("");
    onDocumentChange(file);
  }

  function clearFile() {
    onDocumentChange(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="source-inputs">
      <details className="approved-sources">
        <summary>4 Zenti sources included automatically</summary>
        <ul>{SOURCES.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
      </details>
      <details className="extra-source-details">
        <summary>Add a public link or document <span>Optional</span></summary>
        <div className="extra-source-fields">
          <label htmlFor="additional-source-url">Public HTTPS link</label>
          <input
            autoComplete="off"
            className="control"
            disabled={busy}
            id="additional-source-url"
            maxLength={2_048}
            name="additionalUrl"
            onChange={(event) => { onUrlChange(event.target.value); onError(""); }}
            placeholder="https://…"
            type="url"
            value={additionalUrl}
          />
          <label htmlFor="additional-source-file">PDF or TXT document · up to 3 MB</label>
          <div className="file-picker-row">
            <input
              accept=".pdf,.txt,application/pdf,text/plain"
              className="file-input"
              disabled={busy}
              id="additional-source-file"
              name="document"
              onChange={chooseFile}
              ref={fileInput}
              type="file"
            />
            {document && <button className="btn btn-quiet btn-small" disabled={busy} onClick={clearFile} type="button">Remove</button>}
          </div>
          {document && <p className="selected-file">Selected: {document.name} · {(document.size / 1_000_000).toFixed(1)} MB</p>}
          <p className="source-privacy-note">Selected material is sent to Gemini with each package request. The app does not save the file; the generated package and source links stay in this browser. Use public, non-confidential material only.</p>
          {error && <p className="source-input-error" role="alert">{error}</p>}
        </div>
      </details>
    </div>
  );
}

export function Workspace() {
  const [result, setResult] = useState<ContentPackage | null>(null);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatuses>({});
  const [recentTopics, setRecentTopics] = useState<string[]>([]);
  const [additionalUrl, setAdditionalUrl] = useState("");
  const [additionalDocument, setAdditionalDocument] = useState<File | null>(null);
  const [sourceInputError, setSourceInputError] = useState("");
  const [activeTab, setActiveTab] = useState<PackageTab>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let savedPackage: ContentPackage | null = null;
    let savedStatuses: SourceStatuses = {};
    let savedTopics: string[] = [];
    try {
      const oldLanguagePreference = readStorage(LEGACY_LANGUAGE_KEY);
      const packageJson = readStorage(PACKAGE_KEY);
      if (packageJson && (!oldLanguagePreference || oldLanguagePreference === "English")) {
        const parsed: unknown = JSON.parse(packageJson);
        if (isStoredPackage(parsed)) savedPackage = parsed;
      }
      const statusesJson = readStorage(SOURCE_STATUS_KEY);
      if (statusesJson) savedStatuses = safeSourceStatuses(JSON.parse(statusesJson));
      const topicsJson = readStorage(RECENT_TOPICS_KEY);
      if (topicsJson) savedTopics = safeRecentTopics(JSON.parse(topicsJson));
      if (savedPackage && !savedTopics.some((topic) => topic.toLowerCase() === savedPackage?.topic.toLowerCase())) {
        savedTopics = safeRecentTopics([savedPackage.topic, ...savedTopics]);
      }
    } catch {
      // Invalid or disabled localStorage must not prevent using the workspace.
    }

    startTransition(() => {
      setResult(savedPackage);
      setSourceStatuses(savedStatuses);
      setRecentTopics(savedTopics);
      setReady(true);
    });
  }, []);

  async function createNextPackage() {
    if (busy) return;
    const extraUrlError = validateAdditionalUrl(additionalUrl);
    if (extraUrlError) {
      setSourceInputError(extraUrlError);
      return;
    }
    if (additionalDocument && additionalDocument.size > MAX_EXTRA_FILE_BYTES) {
      setSourceInputError("Documents must be 3 MB or smaller.");
      return;
    }
    setSourceInputError("");
    setBusy(true);
    setError("");

    try {
      const formData = new FormData();
      formData.set("recentTopics", JSON.stringify(recentTopics));
      formData.set("additionalUrl", additionalUrl.trim());
      if (additionalDocument) formData.set("document", additionalDocument, additionalDocument.name);
      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });
      const payload: {
        contentPackage?: unknown;
        error?: string;
        sourceStatuses?: { id: string; status: "read" | "unavailable"; error?: string; title?: string; url?: string; kind?: SourceKind }[];
      } = await response.json();

      if (payload.sourceStatuses) {
        const statuses = safeSourceStatuses(Object.fromEntries(payload.sourceStatuses.map((item) => [item.id, item])));
        setSourceStatuses(statuses);
        writeStorage(SOURCE_STATUS_KEY, JSON.stringify(statuses));
      }
      if (!response.ok) throw new Error(payload.error || "The package could not be created. Try again.");
      if (!isStoredPackage(payload.contentPackage)) throw new Error("The response did not pass validation. No package was saved; try again.");

      const nextPackage = payload.contentPackage;
      const nextTopics = safeRecentTopics([nextPackage.topic, ...recentTopics.filter((topic) => topic !== nextPackage.topic)]);
      setResult(nextPackage);
      setRecentTopics(nextTopics);
      setActiveTab("overview");
      writeStorage(PACKAGE_KEY, JSON.stringify(nextPackage));
      writeStorage(RECENT_TOPICS_KEY, JSON.stringify(nextTopics));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The package could not be created. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = PACKAGE_TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % PACKAGE_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + PACKAGE_TABS.length) % PACKAGE_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = PACKAGE_TABS.length - 1;
    else return;
    event.preventDefault();
    const nextTab = PACKAGE_TABS[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`package-tab-${nextTab.id}`)?.focus();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  const unavailableCount = Object.values(sourceStatuses).filter((source) => source.status === "unavailable").length;
  const activeTabLabel = PACKAGE_TABS.find((tab) => tab.id === activeTab)?.label ?? "Overview";

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <a className="brand-lockup" href="#main-content" aria-label="Zenti Content Engine home">
          <span className="brand-mark"><Sparkles size={16} aria-hidden="true" /></span>
          <span className="brand-name">Zenti Content Engine</span>
          <span className="prototype-tag">Prototype</span>
        </a>
        <div className="topbar-actions">
          <button className="btn btn-quiet btn-small sign-out" type="button" onClick={signOut} aria-label="Sign out">
            <LogOut size={14} aria-hidden="true" /><span>Sign out</span>
          </button>
        </div>
      </header>

      <div className="workspace-content" id="main-content" tabIndex={-1}>
        {!result ? (
          <section className="start-panel">
            <div className="start-mark"><Sparkles size={19} aria-hidden="true" /></div>
            <p className="eyebrow">Editorial workspace</p>
            <h1>Create the next package.</h1>
            <p className="start-copy">A source-backed idea, script, social copy, and scene prompts—without writing a brief.</p>
            <ExtraSourceControls
              additionalUrl={additionalUrl}
              document={additionalDocument}
              error={sourceInputError}
              busy={busy}
              onUrlChange={setAdditionalUrl}
              onDocumentChange={setAdditionalDocument}
              onError={setSourceInputError}
            />
            <button className="btn btn-primary btn-large" type="button" onClick={createNextPackage} disabled={busy || !ready}>
              {busy ? <><LoadingMark /> Reading sources & building your package…</> : <><Sparkles size={16} aria-hidden="true" /> Create next package</>}
            </button>
            <p className="action-note">One text-generation request after you click. No video generation or publishing.</p>
            {busy && <div className="progress-line" role="status">Reading approved sources and creating one source-backed package.</div>}
            {error && <div className="status-message status-error" role="alert">{error}</div>}
          </section>
        ) : (
          <>
            <header className="result-header">
              <div className="result-heading">
                <p className="eyebrow">Recommended next package</p>
                <h1>{result.topic}</h1>
                <p className="package-title">Short-form title: {result.shortTitle}</p>
                <p className="angle-copy">{result.contentAngle}</p>
                <p className="result-audience">For {result.targetAudience.toLowerCase()}</p>
              </div>
              <div className="result-actions">
                <CopyButton text={packageAsMarkdown(result)} label="Copy package" />
                <button className="btn btn-quiet btn-small" type="button" onClick={() => downloadPackage(result)}>
                  <ArrowDownToLine size={14} aria-hidden="true" /> Download
                </button>
              </div>
            </header>

            <ExtraSourceControls
              additionalUrl={additionalUrl}
              document={additionalDocument}
              error={sourceInputError}
              busy={busy}
              onUrlChange={setAdditionalUrl}
              onDocumentChange={setAdditionalDocument}
              onError={setSourceInputError}
            />

            <div className="repeat-action-row">
              <button className="btn btn-primary" type="button" onClick={createNextPackage} disabled={busy}>
                {busy ? <><LoadingMark /> Creating…</> : <><RotateCw size={15} aria-hidden="true" /> Propose another</>}
              </button>
              <span>Uses the sources selected above.</span>
            </div>

            {error && <div className="status-message status-error" role="alert">{error}</div>}
            {busy && <div className="progress-line" role="status">Finding a fresh angle and building the complete package…</div>}

            <div className="package-tabs" role="tablist" aria-label="Generated package sections">
              {PACKAGE_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  aria-controls="package-tab-panel"
                  aria-selected={activeTab === id}
                  className={`package-tab ${activeTab === id ? "active" : ""}`}
                  id={`package-tab-${id}`}
                  key={id}
                  onClick={() => setActiveTab(id)}
                  onKeyDown={handleTabKeyDown}
                  role="tab"
                  tabIndex={activeTab === id ? 0 : -1}
                  type="button"
                >
                  <Icon size={15} aria-hidden="true" />{label}
                </button>
              ))}
            </div>

            <section className="tab-panel" id="package-tab-panel" role="tabpanel" aria-labelledby={`package-tab-${activeTab}`} tabIndex={0}>
              <div className="sr-only" aria-live="polite">Showing {activeTabLabel}</div>
              {activeTab === "overview" && <>
                {unavailableCount > 0 && <div className="source-warning" role="status">{unavailableCount} source{unavailableCount === 1 ? " was" : "s were"} unavailable and not used. See Sources & fact review below.</div>}
                <section className="overview-hook">
                  <div className="section-heading"><h2>Opening hook</h2><CopyButton text={result.hook} label="Copy hook" subtle /></div>
                  <blockquote className="hook-quote">“{result.hook}”</blockquote>
                </section>

                <section className="overview-metrics" aria-labelledby="overview-metrics-heading">
                  <div className="section-heading">
                    <div><h2 id="overview-metrics-heading">Performance snapshot</h2></div>
                    <span className="demo-badge">Demo data</span>
                  </div>
                  <p className="demo-disclaimer">Illustrative demo data — fictional values; not actual Zenti results, benchmarks, or forecasts.</p>
                  <div className="metric-grid metric-grid-compact">
                    {ILLUSTRATIVE_METRICS.map((metric) => <article className="metric-card" key={metric.label}>
                      <span className="metric-demo-tag">DEMO</span><h3>{metric.label}</h3><strong className="metric-value">{metric.value}</strong>
                    </article>)}
                  </div>
                  <button className="text-action" type="button" onClick={() => setActiveTab("metrics")}>How these metrics would be measured <ArrowUpRight size={13} aria-hidden="true" /></button>
                </section>

                <details className="source-audit-disclosure">
                  <summary><span>Sources & fact review</span><span className="disclosure-meta">{result.sources.length} read{unavailableCount ? ` · ${unavailableCount} unavailable` : ""}</span></summary>
                  <div className="disclosure-content">
                    <p className="section-note">Only pages actually read for this package appear as sources. Verify claims against the original pages before using them.</p>
                    <ul className="source-audit-list">
                      {result.sources.map((source) => <li className="source-read" key={source.id}>
                        <CheckCircle2 size={15} aria-hidden="true" />
                        <span>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span>{source.title}</span>}<small>{source.kind === "document" ? "Uploaded document · read for this package" : source.kind === "link" ? "Extra link · read for this package" : "Read for this package"}</small></span>
                      </li>)}
                      {Object.entries(sourceStatuses).filter(([id, status]) => status.status === "unavailable" && !result.sources.some((source) => source.id === id)).map(([id, source]) => <li className="source-unavailable" key={id}>
                        <AlertTriangle size={15} aria-hidden="true" />
                        <span>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title ?? source.url}</a> : <span>{source.title ?? "Extra document"}</span>}<small>{source.error || "Not read; not used"}</small></span>
                      </li>)}
                    </ul>
                    <div className="claim-audit">
                      <h3>Claims to review</h3>
                      {result.claims.length ? result.claims.map((claim, index) => <article key={`${claim.claim}-${index}`}>
                        <span className={claim.status === "supported" ? "claim-supported" : "claim-review"}>{claim.status === "supported" ? "Excerpt found · verify in context" : "Needs human review"}</span>
                        <p>{claim.claim}</p>
                        {claim.supportingExcerpt && <blockquote>“{claim.supportingExcerpt}”</blockquote>}
                      </article>) : <p>No factual claims were returned. Review the package before use.</p>}
                      {result.humanReviewNotes.length > 0 && <ul>{result.humanReviewNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul>}
                    </div>
                  </div>
                </details>
              </>}

              {activeTab === "content" && <>
                <section className="content-section">
                  <div className="section-heading"><div><p className="eyebrow">Short-form video</p><h2>Voiceover script</h2></div><CopyButton text={result.voiceoverScript} label="Copy script" /></div>
                  <p className="script-text">{result.voiceoverScript}</p>
                  <div className="content-cta"><strong>{result.ctaText}</strong><a href={result.ctaUrl} target="_blank" rel="noreferrer">{result.ctaUrl} <ArrowUpRight size={13} aria-hidden="true" /></a></div>
                </section>
                <section className="social-section">
                  <div className="section-heading"><div><p className="eyebrow">Ready to adapt</p><h2>Social copy</h2></div></div>
                  <article className="social-card"><div className="social-card-heading"><h3>YouTube</h3><CopyButton text={`${result.youtubeTitle}\n\n${result.youtubeDescription}`} label="Copy" subtle /></div><strong>{result.youtubeTitle}</strong><p>{result.youtubeDescription}</p></article>
                  <article className="social-card"><div className="social-card-heading"><h3>LinkedIn</h3><CopyButton text={result.linkedinPost} label="Copy" subtle /></div><p>{result.linkedinPost}</p></article>
                  <a className="cta-link" href={result.ctaUrl} target="_blank" rel="noreferrer">{result.ctaUrl} <ArrowUpRight size={13} aria-hidden="true" /></a>
                </section>
              </>}

              {activeTab === "scenes" && <section className="scenes-section">
                <div className="section-heading"><div><p className="eyebrow">Video production</p><h2>Scene prompts</h2></div></div>
                <aside className="provider-note" aria-label="How to create the video">
                  <div>
                    <strong>Make the video manually today</strong>
                    <p>Copy a scene prompt into Google Flow. A future version could connect directly to a video provider; this prototype does not call video APIs.</p>
                  </div>
                  <nav className="provider-links" aria-label="Video creation tools">
                    <a href="https://flow.google" target="_blank" rel="noreferrer">Google Flow <ArrowUpRight size={13} aria-hidden="true" /></a>
                    <a href="https://gemini.google/overview/video-generation" target="_blank" rel="noreferrer">Gemini video <ArrowUpRight size={13} aria-hidden="true" /></a>
                    <a href="https://runway.com/product/ai-video-generator" target="_blank" rel="noreferrer">Runway <ArrowUpRight size={13} aria-hidden="true" /></a>
                  </nav>
                </aside>
                <p className="section-note">Use the same authorized presenter reference for every scene.</p>
                <div className="consistency-row">
                  <div><strong>Use one presenter throughout</strong><p>Keep the reference, framing, background, lighting, and pace consistent.</p></div>
                  <CopyButton text={result.globalFlowConsistencyPrompt} label="Copy consistency prompt" />
                </div>
                <div className="scene-list">
                  {result.scenePlan.map((scene) => (
                    <article className="scene-row" key={scene.sceneNumber}>
                      <div className="scene-summary">
                        <span className="scene-index">{String(scene.sceneNumber).padStart(2, "0")}</span>
                        <div className="scene-title"><h3>{scene.purpose}</h3><span>{scene.durationSeconds}s · “{scene.spokenLine}”</span></div>
                        <CopyButton text={scene.flowPrompt} label="Copy prompt" />
                      </div>
                      <details className="scene-details">
                        <summary>Visual direction & full prompt</summary>
                        <p className="visual-direction">{scene.visualDescription}</p>
                        <div className="prompt-copy"><p>{scene.flowPrompt}</p><CopyButton text={scene.flowPrompt} label="Copy full prompt" subtle /></div>
                        {scene.onScreenText && <p className="overlay-note">Text overlay to add later: {scene.onScreenText}</p>}
                      </details>
                    </article>
                  ))}
                </div>
                <details className="secondary-disclosure">
                  <summary>Full presenter prompt</summary>
                  <div className="disclosure-content"><p>{result.fullFlowPrompt}</p><CopyButton text={result.fullFlowPrompt} label="Copy full prompt" /></div>
                </details>
              </section>}

              {activeTab === "metrics" && <section className="metrics-section">
                <div className="section-heading"><div><h2>Performance metrics</h2></div><span className="demo-badge">Demo data</span></div>
                <p className="demo-disclaimer demo-disclaimer-prominent">Illustrative demo data — fictional values; not actual Zenti results, benchmarks, or forecasts. No publishing or analytics accounts are connected.</p>
                <div className="metric-grid">
                  {ILLUSTRATIVE_METRICS.map((metric) => <article className="metric-card" key={metric.label}>
                    <span className="metric-demo-tag">DEMO</span><h3>{metric.label}</h3><strong className="metric-value">{metric.value}</strong><p>{metric.description}</p><small>{metric.measure}</small>
                  </article>)}
                </div>
                <div className="improve-panel">
                  <h3>How to learn from real results</h3>
                  <ul>
                    <li>Use each platform’s own definition and compare videos of similar length.</li>
                    <li>Review retention by scene to find where viewers leave.</li>
                    <li>Tag the CTA link and compare visits with qualified referral inquiries.</li>
                    <li>Change one element at a time; treat small samples as directional, not proof.</li>
                  </ul>
                </div>
              </section>}
            </section>
          </>
        )}

        <footer className="workspace-footer">Independent prototype · Not endorsed by Zenti · Gemini text requests may use API quota or billing</footer>
      </div>
    </main>
  );
}
