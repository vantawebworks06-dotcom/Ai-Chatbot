# Velora

**Intelligent support. Real human connection.**

Velora is an AI customer-support platform. Businesses install a chat widget on their website with one line of code. The AI answers customers from that business's own knowledge base. When it can't, or when the customer asks, the conversation moves to a live human agent in the same chat window.

---

## How it works

```
 Customer's browser                  Velora (Next.js on Vercel)                 Supabase
 ──────────────────                  ──────────────────────────                 ────────
 widget.js  ── visitor token ──▶  /api/widget/*  ── service key ──▶  Postgres (RLS)
   (Shadow DOM, polls)               │  support engine                    │ businesses, knowledge,
                                     │   1. deterministic handoff rules   │ conversations, messages
                                     │   2. retrieve this business's      │ pgvector + full-text search
                                     │      knowledge only                │
                                     │   3. Claude → JSON {reply,         │
                                     │      needs_human, confidence}      │
                                     │   4. answer or hand off            │
 Business dashboard ── session ──▶  /dashboard (server components) ──▶  RLS: members only
 Agent inbox        ── session ──▶  /agent ◀── Supabase Realtime ──────  RLS: platform agents
```

| Piece | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router) + TypeScript + Tailwind | One codebase for API, dashboards and marketing site; deploys to Vercel |
| Database, auth, storage | Supabase (Postgres, Auth, Storage) | Row-level security enforces tenant isolation inside the database |
| Real-time | Supabase Realtime (agent inbox) and polling (widget) | See [Limitations](#limitations) |
| AI | Anthropic Claude (`claude-opus-5-5`) behind a provider interface | Structured JSON output, so the code (not the model's prose) decides handoff |
| Retrieval | Postgres full-text search, plus optional vector search (pgvector + Voyage) | Works with no extra API key; add embeddings for large knowledge bases |

### Handoff: when a person takes over

A conversation moves to the human queue when any of these is true. The first three don't depend on the AI at all.

1. The customer presses **Talk to a person**, or writes something like "talk to a human" or "agent".
2. The customer asks for a refund, a cancellation, an exception or a billing correction, or makes a complaint.
3. The customer says twice that the answers aren't helping.
4. The AI reports that the knowledge base doesn't cover the question, that it needs to take an action, or that its confidence is low.
5. The AI call fails or times out.

When an agent claims or replies, the AI stops replying in that conversation. The agent can later return it to AI mode or close it.

### Multi-tenant security

- Every table has row-level security. Business members see only their own business. Platform agents (you) see all businesses.
- The widget never touches the database directly. It sends a public client ID and a random per-visitor token, which is stored only as a hash. The server checks both, plus an optional domain allow-list.
- Agent actions (claim, reply, return to AI, close) are database functions that refuse anyone who isn't a platform agent.
- Knowledge retrieval always filters by business ID inside SQL, and can only be called by the server.
- Secrets (`SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`) are read only in server code that's marked `server-only`.

---

## Folder structure

```
public/
  widget.js               Embeddable chat widget (vanilla JS, Shadow DOM)
  test-site.html          Test page that loads your widget
src/
  app/
    page.tsx              Marketing page
    login/ signup/ onboarding/
    auth/                 Email confirm, sign-out, post-login redirect
    dashboard/            Business dashboard: overview, conversations, knowledge, chatbot, install, settings
    agent/                Platform agent inbox (real-time)
    api/widget/           Public widget API: session, messages, handoff, typing
  lib/
    ai/                   Provider interface + Claude implementation + optional embeddings
    support/              Handoff rules, prompt builder, support engine, Supabase store
    knowledge/            Chunking, PDF/text extraction, indexing
    widget/               Visitor tokens, CORS and origin checks
    supabase/             Browser, server and admin (service-role) clients
  components/             UI primitives, logo, app shell, transcript
  proxy.ts                Refreshes auth sessions
supabase/migrations/      Database schema, versioned in Git
tests/unit/               Handoff rules, engine, chunking, prompt, widget security
tests/integration/        Live-database isolation tests + end-to-end journey
scripts/make-agent.mjs    Grants agent-inbox access to a user
```

---

## Setup (Windows)

You need [Node.js 20+](https://nodejs.org) and Git. Run these commands in PowerShell in the project folder.

### 1. Accounts and keys

| What | Where | Goes in |
|---|---|---|
| Supabase project URL | Supabase → Project Settings → API Keys | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key | same page | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| **Secret key** (server only) | same page → "Secret keys" | `SUPABASE_SECRET_KEY` |
| Anthropic API key | console.anthropic.com → API Keys (billing required) | `ANTHROPIC_API_KEY` |
| Voyage API key (optional) | voyageai.com | `VOYAGE_API_KEY` + `EMBEDDINGS_PROVIDER=voyage` |

```powershell
Copy-Item .env.example .env.local   # then open .env.local and fill in the values
npm install
```

### 2. Database

```powershell
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push:dry    # preview which migrations will run
npm run db:push        # apply them
```

In Supabase → Authentication → URL Configuration, set **Site URL** to your app's URL (`http://localhost:3000` while developing) and add `http://localhost:3000/**` and your production URL to **Redirect URLs**.

### 3. Run it

```powershell
npm run dev
```

Open http://localhost:3000, sign up, and create your business.

### 4. Make yourself the agent

```powershell
npm run make-agent -- you@example.com "Your Name"
```

Sign out and back in. You'll land on `/agent`, the live inbox for every business.

---

## Install the chatbot on a website

1. In the dashboard, open **Install** and copy the snippet:
   ```html
   <script src="https://YOUR-DOMAIN/widget.js" data-client-id="BUSINESS_ID" defer></script>
   ```
2. Paste it before `</body>` on the website.
3. To try it without a website, click **Open test page** on the same screen. It opens `/test-site.html?client_id=...`.
4. Optional: under **Allowed websites**, list your domains so other sites can't embed your widget.

---

## Testing

```powershell
npm test                 # unit tests: handoff rules, engine, isolation in prompts, chunking, widget security
```

The integration tests run against your real Supabase project. They create temporary users and businesses with addresses like `velora-test-...@example.com`, and delete them when they finish.

```powershell
$env:RUN_INTEGRATION = "1"; npm run test:integration
```

That runs the tenant-isolation, authorization and agent-action tests. To also run the **end-to-end customer journey** against a running app with the real AI, start `npm run dev` in another window, then run:

```powershell
$env:RUN_INTEGRATION = "1"; $env:BASE_URL = "http://localhost:3000"; npm run test:integration
```

---

## Deploy (Vercel)

1. Import the GitHub repo at vercel.com/new.
2. Add every variable from `.env.local` under Project → Settings → Environment Variables.
3. Deploy. Then add the production URL to Supabase Auth → URL Configuration.
4. Each `git push` to `main` redeploys. Database changes go through `npm run db:push`.

---

## Changing the database

```powershell
npx supabase migration new <short_name>   # write SQL in the new file
npm run db:push:dry
npm run db:push
git add supabase/migrations; git commit -m "..."
```

---

## Limitations

- **Widget updates use polling.** It checks every 2 seconds while an agent is involved and every 5 seconds otherwise, and slows down in background tabs. Supabase Realtime would require giving anonymous website visitors database sessions. Polling keeps the widget dependency-free and the database closed to visitors. A later upgrade could use Supabase anonymous sign-ins or a broadcast channel.
- **One business per owner account in the dashboard.** The schema supports several, but the UI doesn't have a business switcher yet.
- **Scanned PDFs (images of text) aren't read.** Use text-based PDFs or paste the content.
- **Basic rate limit** of 12 customer messages per minute per conversation. Put Vercel's firewall in front of `/api/widget` for production traffic.
- **The AI can't take actions.** It never processes refunds or changes orders. Those requests always go to a person.
