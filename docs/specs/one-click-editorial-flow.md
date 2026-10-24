# One-click editorial flow

## Goal

Reduce the workspace to one deliberate action: ask Zenti Content Engine to choose the next source-backed editorial angle and return the complete package. Do not ask the user to invent a topic, audience, editorial objective, or source list.

## Decisions

- Generation is never triggered by login, page load, or refresh. The user starts it with **Create next package**; this is the cost-consent action for one Gemini text request.
- One Gemini request both selects an angle and writes the entire content package. Do not add a separate idea-suggestion call or any multimedia provider.
- The app always attempts the four existing allowlisted sources. It only cites sources actually read, reports failures, and stops if none can be read.
- Audience stays fixed to prospective referral partners. The CTA stays fixed to Profit from Payments. All generated content and interface copy remain in English; there is no language selector.
- **Propose another** makes another explicit request and sends at most the eight recent topics saved in this browser so Gemini can avoid repeating them. Store no extra user-provided brief or account data.
- After generation, divide the result into four compact tabs: Overview, Content, Scenes, and Metrics. Start on Overview. Do not put the complete package into one long screen.
- Keep tab labels and instructional UI provider-agnostic. Scene prompts themselves remain optimized for Google Flow for now; they are still generated/copied as plain text.
- Put source/claim audit in a concise disclosure on Overview. Make metric examples visible in Overview and detailed on Metrics.
- Metrics use fixed fictional demo values (8,420 views, 18.6-second average watch time, 43% completion, 136 CTA visits) with a prominent persistent label: `Illustrative demo data — fictional values; not actual Zenti results, benchmarks, or forecasts.` Never include those values in the generated content package or its exports.
- The Scenes tab explains that prompts are currently copied into Google Flow manually and links to Google Flow, Gemini video, and Runway. Mention direct video-provider API integration as future work only. No video/image/audio generation, publishing, external analytics, or social account connections are made now.

## Acceptance criteria

- All UI and generated editorial copy is English. No language selector, free-text brief, source checkboxes, or modal steps. Post-generation tabs are limited to Overview, Content, Scenes, and Metrics.
- A fresh visit makes zero Gemini calls. One click makes at most one Gemini call after server-side source reads.
- The generated topic is selected by the model from successful source text, avoids recent browser topics, and is displayed as a recommendation with its editorial angle.
- The package retains script, scene prompts, social copy, source traceability, claim statuses, review notes, copy/download actions, and the proposed measurement plan.
- The metrics summary is visible immediately on Overview, and every demo number is unmistakably labeled as fictional/non-Zenti data. Metrics never leak into package copy or exports.
- Failed generation preserves the last valid package and provides a clear retry path; no fabricated success is shown.
- Gemini and private-session secrets remain server-only. Recent-topic history is validated, bounded, versioned, and never treated as factual source material.

## Verification and rollback

- Run lint, typecheck, production build, dependency audit, and a local HTTP check for the no-key / no-session paths. Do not run a real paid Gemini request without configured credentials and explicit test approval.
- The change is limited to the app UI and generation request/prompt; it has no database migration. Existing saved package/language/source-status keys remain valid; recent topics use a new versioned key. If the flow is rejected, restore the previous `workspace.tsx`, `globals.css`, generate route, and Gemini prompt from the pre-change versions in the task history. Do not deploy until the user approves the UX.
