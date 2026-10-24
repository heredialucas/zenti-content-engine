# Zenti Content Engine

An independent, private editorial workspace that chooses a source-backed topic and creates a content package plus copyable Google Flow prompts with one deliberate action. The user does not have to write a brief or select sources.

> **Prototype notice:** This project is not endorsed by Zenti. It does not generate or store images, video, or audio, publish posts, connect social accounts, or automate Google Flow. Video generation happens manually in the user's Google Flow account.

## Requirements

- Node.js 20.9 or later
- pnpm 10+
- A Gemini API key for content generation

## Run locally

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Set these values in your ignored `.env.local` (do not paste credentials into source files or commit them):

```env
GEMINI_API_KEY=your-key-from-google-ai-studio
GEMINI_TEXT_MODEL=gemini-3.8-flash
APP_PASSWORD=choose-a-strong-private-password
SESSION_SECRET=replace-with-a-random-secret-of-at-least-32-characters
```

Generate a session secret locally, for example:

```bash
openssl rand -hex 32
```

Then start the app:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the password from `APP_PASSWORD`. The interface and generated editorial package are English-only. The page never calls Gemini just by opening or refreshing. Clicking **Create next package** reads the four approved sources and makes one text-generation request for both the idea and complete package. **Propose another** makes another request and passes only up to eight recent topic labels from this browser to help avoid repetition. Without Gemini credentials, generation returns a clear configuration error; no sample AI package is fabricated.

Other checks:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

## Deploy to Vercel

1. Import this project directory as its own Vercel project.
2. Add `GEMINI_API_KEY`, `GEMINI_TEXT_MODEL`, `APP_PASSWORD`, and `SESSION_SECRET` under **Project → Settings → Environment Variables** for the environments you will use.
3. Set a long, unique workspace password and a random `SESSION_SECRET` with at least 32 characters. Never use a `NEXT_PUBLIC_` variable for secrets.
4. Deploy. The app is server-rendered and expects Node.js runtime route handlers.

The password gate is a lightweight single-workspace access control, not individual user accounts or a substitute for provider quota limits. Configure usage limits/alerts in Google AI Studio or Google Cloud as appropriate. A shared password does not cap Gemini usage.

Local OpenCode skills are installed with `autoskills` for development; they are agent instructions, not app dependencies, and are excluded from the deployment repository. In a fresh working copy, run `pnpm dlx autoskills --yes --agent opencode` to install the detected set.

## What it does

- Reads only the four hard-coded URLs in `src/lib/catalog.ts`; arbitrary URLs and crawler behavior are not supported.
- Checks HTTP(S), the exact approved redirect targets, DNS resolution, and private/reserved IP ranges before requesting a source. Each response has a timeout and a 450 KB response-size limit; extracted text sent to Gemini is capped per page.
- Marks pages read or unavailable for each generation. If all approved pages fail, generation stops. Only successfully read pages are cited in the package.
- Calls Gemini only from `app/api/generate/route.ts`, using `@google/genai`, structured JSON output, and Zod server-side validation. The default model is `gemini-3.8-flash` with low thinking effort.
- Verifies that any claim marked `supported` includes a sufficiently long verbatim excerpt in one of its cited, successfully fetched pages. Other claims are downgraded to `needs_review`.
- Generates in English only. Stores the last package, source statuses, and up to eight recent topic labels in versioned browser `localStorage`. No database, external analytics, or server-side content history is used.
- Copies the full package and downloads it as Markdown.
- After generation, the workspace is divided into Overview, Content, Scenes, and Metrics tabs. The navigation is provider-agnostic; scene prompt text remains tuned to the current video provider.
- The Scenes tab links to Google Flow for manual prompt use and to Gemini video and Runway as possible future integrations. These links do not invoke provider APIs.
- Metrics show a clearly labeled fictional demo snapshot (8,420 views, 18.6-second average watch time, 43% completion, and 136 CTA visits). Those values are not real Zenti data, benchmarks, or forecasts, and never appear in package exports.

## Costs and media boundary

The app makes **text-only Gemini API** requests. Gemini API usage can be subject to quotas and billing; a Google AI subscription does not automatically cover API calls. Model availability, limits, and prices can change—check Google's [model documentation](https://ai.google.dev/gemini-api/docs/models) and [pricing](https://ai.google.dev/gemini-api/docs/pricing) before use.

There are no calls to Veo, Google Flow, image generation, audio generation, or voice services. Prompts are plain text. The user manually opens Flow, supplies an authorized reference image there, generates clips, then reviews and edits them separately. This application never receives or stores those images.

## Source and editorial caveats

- Source pages can change, move, or block requests. Failed pages are reported and are never represented as read.
- A verbatim excerpt check helps catch unsupported citations; it is not independent fact-checking. Review claims, original pages, suitability, and wording before use.
- Ask the provider to avoid unsupported business claims. Never rely on AI output for approval guarantees, payment underwriting decisions, commissions, income outcomes, or legal/compliance advice.
- Metrics include clearly labeled fictional demo values for layout illustration only. They are not actual YouTube, LinkedIn, Whop, or Zenti results, benchmarks, or forecasts, and they are not included in generated package exports.

## Design

See [`DESIGN.md`](./DESIGN.md) for the visual tokens, layout, interaction, and accessibility rules.
