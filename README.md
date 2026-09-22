# ChatScope

> Upload your conversation. Understand the conversation.

ChatScope is an AI-powered WhatsApp conversation intelligence platform. Export a chat as `.txt`, upload it, and get instant analytics plus grounded natural-language Q&A — in English, Hindi, or Hinglish.

**Free to run.** No accounts, no paid services — deterministic analytics run locally and AI features use the Google Gemini free tier. The API key stays server-side.

## Features

- **Robust WhatsApp parser** — 12h/24h time, iOS bracketed format, multiline messages, Hindi/Unicode senders, media/deleted/link/emoji detection.
- **Analytics dashboard** — overview, activity by date/hour/day, monthly trends, response times (mean + median), conversation starters, who-replies-to-whom interaction flows, word cloud, per-person signature words, emojis.
- **Ask Your Chat** — streaming, evidence-backed answers with confidence badges. Statistical questions ("who talks more?") are answered deterministically with exact numbers — zero AI cost.
- **Multi-stage retrieval** — inverted index, BM25, morphology, fuzzy matching, corpus-derived concept expansion, Q&A thread stitching, negation handling, and optional free-tier semantic embeddings. Gemini-assisted query reformulation as a last resort.
- **Self-improving** — 👍/👎 feedback tunes retrieval scoring; successful query patterns are learned and reused (corpus-scoped, so one chat never contaminates another).
- **Message browser** — search and filter the raw conversation.
- **PDF export** — print-optimized report of the whole dashboard.
- **No accounts at all** — upload → analyze → walk away. There is no sign-in, no history and nothing saved: chats live in server memory only and vanish on restart.

## Project structure

```
chatscope/
├── backend/
│   ├── server.js           # Express API: upload, ask (JSON + SSE stream), messages, feedback, status, auth
│   ├── parser.js           # WhatsApp .txt parser
│   ├── analytics.js        # Deterministic analytics engine
│   ├── analyticsAnswer.js  # Deterministic router for statistical questions + suggestions
│   ├── retrieval.js        # Multi-signal adaptive retrieval engine (BM25, fuzzy, Q&A stitching, learning)
│   ├── embeddings.js       # Optional semantic layer (Gemini text-embedding-004, free tier)
│   ├── resourceMeter.js    # Live Gemini/Groq/embedding usage + quota attribution
│   ├── sms.js              # Thin SMS provider interface (config-gated)
│   ├── userContext.js       # Per-request state scoping: guests = root, users = private folders
│   ├── tests/              # parser / analytics / retrieval / auth / user-isolation suites
│   ├── dataDir.js          # backend/data/ resolver + per-user scoping
│   └── data/               # runtime state — never committed
└── frontend/               # React + Vite + TypeScript + Tailwind + Recharts
```

## Setup

### Backend

```bash
cd backend
npm install
cp .env.example .env        # then add your GEMINI_API_KEY
npm start                   # http://localhost:5000
```

Get a free API key at [Google AI Studio](https://aistudio.google.com/apikey).

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

### Tests

```bash
cd backend
npm test               # 202 assertions: parser, analytics, retrieval, redact, settings, vault, auth, user isolation
npm run test:restart   # two-phase restart parity: session + chats survive a real process restart
npm run smoke          # 10 end-to-end checks against a running server (guest mode)
```

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/upload` | POST | Upload a `.txt` WhatsApp export (multipart field `chat`). Returns analytics. |
| `/api/ask` | POST | `{ question }` → JSON answer with evidence + confidence. |
| `/api/ask/stream` | POST | Same pipeline, Server-Sent Events: `meta` → `token*` → `done`. |
| `/api/messages` | GET | `?search=&sender=&page=` — browsable message index. |
| `/api/feedback` | POST | `{ question, isPositive }` — trains retrieval scoring. |
| `/api/status` | GET | Chat state, analytics (for session restore), suggestions. |
| `/api/auth/session` | GET | `{ user, guest, providers, googleClientId }` — the frontend's session bootstrap. |
| `/api/auth/google` | POST | `{ credential }` (Google ID token) → session cookie. |
| `/api/auth/otp/request` | POST | `{ identifier }` — emails/SMS a 6-digit code (rate-limited). |
| `/api/auth/otp/verify` | POST | `{ identifier, code }` → session cookie. |
| `/api/auth/logout` | POST | Clears the session cookie. |

## Configuration

All environment variables are documented in [`backend/.env.example`](backend/.env.example): `GEMINI_API_KEY`, `GROQ_API_KEY`, `GEMINI_MODEL`, `PORT`, `CORS_ORIGIN`, `DEBUG_RETRIEVAL`, and the frontend's `VITE_API_URL`.

## Secrets & key safety

- Every secret lives in **environment variables only** (`backend/.env`, loaded server-side). No key, token, password or connection string exists as a string literal anywhere in the source.
- The frontend exposes exactly one value to the browser: `VITE_API_URL` (a backend address, not a credential). Never place a secret in any `VITE_*` variable — Vite bundles those into the JavaScript every visitor downloads.
- `.gitignore` excludes every `.env*` variant (the `.env.example` files with placeholders are the only exceptions). `.dockerignore` keeps `.env` out of image builds.
- `GEMINI_API_KEY` / `GROQ_API_KEY` are never printed in logs or returned by any API response — endpoints expose booleans (`geminiConfigured`) and usage counters only.

> **⚠️ If a secret was ever hardcoded or committed in the past:** treat it as compromised. Delete it from the code, then **rotate/revoke it immediately** in the provider dashboard (Google AI Studio for Gemini, console.groq.com for Groq) — removing it from the files does NOT remove it from git history.

## Deployment

The backend serves the built frontend automatically when `frontend/dist` exists, so a single service works:

```bash
cd frontend && npm run build
cd ../backend && npm start     # one port serves API + UI
```

A `Dockerfile` is provided for container deployments (Render, Railway, Fly.io, etc.). Set `GEMINI_API_KEY` (and optionally `CORS_ORIGIN`) in your host's dashboard. The server **refuses to start** without `GEMINI_API_KEY`; in production, cross-origin browser access requires `CORS_ORIGIN` to name your frontend origin (same-origin deployments need nothing). Errors returned to clients carry only a generic message plus an `X-Request-Id` correlation id — full details stay in the server log.

### Access from anywhere (free, no port forwarding)

Because chats are personal, the recommended "deployment" is your own machine plus a Cloudflare quick tunnel — a permanent-feeling HTTPS URL, zero cost, data stays local:

```bash
# 1. one-time install:  winget install Cloudflare.cloudflared
# 2. build the frontend once, then from backend/:
npm start        # terminal 1
npm run tunnel   # terminal 2 — prints a public https://*.trycloudflare.com URL
```

Open that URL from any device — the frontend and API share the origin, so no CORS setup is needed. Quick tunnels change URL on each run; for a fixed hostname, create a free named Cloudflare tunnel.

For an always-on cloud host, use a provider with a **persistent disk** (e.g. Oracle Cloud Always Free). Ephemeral free hosts (Render/Railway) wipe `backend/data/` on restart, losing the saved analysis. `GET /health` is available for uptime monitors.

## Privacy model: nothing is saved

ChatScope is fully ephemeral by design. There are no accounts, sessions or sign-in anywhere in the app.

- Chats, analytics, facts and embeddings live in **server memory only**; nothing is ever written to disk.
- Restarting the server (or just closing it) wipes every trace — a visitor can analyze a chat and walk away with zero footprint.
- The "Delete all data" action in the dashboard clears the in-memory session instantly.

Because there is nothing to save, there is nothing to leak, sell or subpoena.

## Privacy

- Chats stay on your server; only the minimum relevant evidence is sent to Gemini.
- Uploaded files are deleted after parsing; debug logging of chat content is off by default.
- Learning memory is corpus-scoped, bounded and content-free; no accounts, no tracking, no history.
