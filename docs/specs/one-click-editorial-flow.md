# One-click editorial flow

## Goal

Reduce the workspace to one deliberate action: ask Zenti Content Engine to choose the next source-backed editorial angle and return the complete package. Do not ask the user to invent a topic, audience, editorial objective, or source list.

## Decisions

- Generation is never triggered by login, page load, or refresh. The user starts it with **Create next package**; this is the cost-consent action for one Gemini text request.
- One Gemini request both selects an angle and writes the entire content package. Do not add a separate idea-suggestion call or any multimedia provider.
- The app always attempts the four existing allowlisted sources. It only cites sources actually read, reports failures, and stops if none can be read.
- Before generation, the user may optionally add one public HTTPS URL and one PDF or plain-text file (maximum 3 MB). Curated sources remain automatic; arbitrary crawling is not allowed.
- External URLs are fetched only on submit, after protocol/host/DNS checks, with DNS-pinned HTTPS requests, validated public addresses on every redirect, a timeout, redirect cap, and response-size/content-type limits. Reject credentials, IP literals, non-HTTPS, private/reserved destinations, and common credential query parameters.
- Uploaded documents are inspected by extension and file signature, parsed in memory only, limited to 12 PDF pages and 12,000 extracted characters, and never saved as files by the app. Scanned/password-protected PDFs are unsupported. Tell the user that extracted text is sent to Gemini and that the generated package/source URL is kept in this browser; warn against confidential material.
- Supplementary URL/document content is treated as untrusted reference text, not instructions. Cite it only if actually read and only with an exact, server-verified excerpt. Report failures separately and continue with other readable sources.
- Audience stays fixed to prospective referral partners. The CTA stays fixed to Profit from Payments. All generated content and interface copy remain in English; there is no language selector.
- **Propose another** makes another explicit request and sends at most the eight recent topics saved in this browser so Gemini can avoid repeating them. Store no extra user-provided brief or account data.
- After generation, divide the result into four compact tabs: Overview, Content, Scenes, and Metrics. Start on Overview. Do not put the complete package into one long screen.
- Keep tab labels and instructional UI provider-agnostic. Scene prompts themselves remain optimized for Google Flow for now; they are still generated/copied as plain text.
- Put source/claim audit in a concise disclosure on Overview. Make metric examples visible in Overview and detailed on Metrics.
- Metrics use fixed fictional demo values (8,420 views, 18.6-second average watch time, 43% completion, 136 CTA visits) with a prominent persistent label: `Illustrative demo data — fictional values; not actual Zenti results, benchmarks, or forecasts.` Never include those values in the generated content package or its exports.
- The Scenes tab explains that prompts are currently copied into Google Flow manually and links to Google Flow, Gemini video, and Runway. Mention direct video-provider API integration as future work only. No video/image/audio generation, publishing, external analytics, or social account connections are made now.

## Acceptance criteria

- All UI and generated editorial copy is English. No language selector, free-text brief, source checkboxes, or modal steps. Post-generation tabs are limited to Overview, Content, Scenes, and Metrics.
- A fresh visit makes zero Gemini calls. One click makes at most one Gemini call after server-side source reads and optional extra-source processing.
- The generated topic is selected by the model from successful source text, avoids recent browser topics, and is displayed as a recommendation with its editorial angle.
- The package retains script, scene prompts, social copy, source traceability (including extra references), claim statuses, review notes, copy/download actions, and the proposed measurement plan.
- Extra source files and extracted source text are not kept server-side or saved in localStorage. The generated package (including a supplied public source URL) is saved in this browser; eligible excerpts are traceable in the returned package.
- The metrics summary is visible immediately on Overview, and every demo number is unmistakably labeled as fictional/non-Zenti data. Metrics never leak into package copy or exports.
- Failed generation preserves the last valid package and provides a clear retry path; no fabricated success is shown.
- Gemini and private-session secrets remain server-only. Recent-topic history is validated, bounded, versioned, and never treated as factual source material.

## Verification and rollback

- Run lint, typecheck, production build, dependency audit, and a local HTTP check for the no-key / no-session paths. Do not run a real paid Gemini request without configured credentials and explicit test approval.
- The change has no database migration. Extra URLs/files are per-request only and never stored server-side; existing browser package/source-status keys remain valid. If rejected, restore the prior UI, route, and reader from the task history. Do not deploy until the user approves the flow.
