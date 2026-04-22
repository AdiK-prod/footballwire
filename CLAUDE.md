# Football Wire — Project Context

## What We're Building
Daily NFL team newsletter app. Subscribers pick their team and receive
a curated 5-minute morning briefing every day.

- Domain: footballwire.uk (registered on Cloudflare)
- Sending: newsletter@mail.footballwire.uk
- Subscriber app: footballwire.uk
- Admin dashboard: footballwire.uk/admin
- PRD: prd_v3.md
- Backlog: BACKLOG.md

---

## Stack

- React + Vite + Tailwind CSS — frontend
- Supabase — PostgreSQL + Auth + Edge Functions (webhooks only)
- Vercel — deployment + Cron (pipeline scheduling)
- Resend — email delivery (verified domain required)
- Anthropic Claude API / claude-haiku-4-5-20251001 — AI layer

---

## Current Phase

Phases 1–4 complete. Phase 5 (Admin Dashboard) — next.

Update this line when a phase is confirmed complete by the user.

---

## Execution Protocol

Cursor runs autonomously through all Active tasks for the current phase.
Do not ask for permission between individual tasks.
Mark each task [x] in BACKLOG.md immediately upon completion.
Move completed tasks to the Completed section in BACKLOG.md.

**When the phase is fully complete:**
1. Verify every DoD checkbox in prd_v3.md for that phase
2. For checkboxes that can be verified programmatically (migrations ran, indexes exist, build passes) — verify and mark them
3. For checkboxes that require human confirmation (app runs locally, Vercel deployed, email renders) — list them explicitly and wait
4. Report a clear summary of what was built
5. Do not add next phase tasks or begin next phase until user confirms

**Stop and wait ONLY when:**
- Current phase is fully complete — report summary + DoD verification
- A task requires external action only the user can do (credentials, DNS setup, Vercel env vars, Resend verification)
- Two valid architectural approaches exist with meaningful tradeoffs — state both options clearly and ask which to proceed with
- An error cannot be resolved after two attempts — report what failed, what was tried, and what is needed
- The PRD is ambiguous or contradicts existing code — state the conflict precisely

**Never stop for:**
- Individual task completion within a phase
- Routine file creation, component building, schema migrations
- Stylistic or naming decisions already covered by rules in this file
- Test failures that are fixable — fix and continue
- Decisions already answered by CLAUDE.md or prd_v3.md
- Display bugs discovered mid-task — fix them and continue

---

## Architecture Rules

**Supabase Edge Functions vs Vercel Cron**
- Pipeline scheduling: Vercel Cron ONLY — never Supabase Edge Functions
- Source validation: Vercel API route (`/api/validate-source`) — never Supabase Edge Function
- Edge Functions: stateless webhooks only (open pixel, feedback tracking, unsubscribe)
- Reason: Edge Functions have cold start latency and per-invocation cost that compounds on daily pipeline runs

**File structure — where logic lives**
- All Supabase queries → `src/lib/db/` — never inline in components
- All Claude API calls → `src/lib/ai/` — never from components or routes
- All Resend calls → Vercel Cron or Edge Functions — never from frontend
- All RSS fetching → `src/lib/rss/` using `rss-parser` npm package
- All environment variables → `src/lib/config.ts` — never `process.env` scattered throughout
- Business logic → `src/lib/` — components render only, no logic

**Multi-team**
- Every query on articles, newsletters, sources must filter by team_id
- team_id = NULL means general source — always handle this case explicitly
- Never hardcode a team name, color, slug, or ID — always from DB
- Team active state = derived from subscriber count — never stored
- Active team query: `SELECT COUNT(*) FROM subscribers WHERE team_id = X AND is_active = true`

**Admin performance**
- All admin queries must use indexed columns — check schema before writing
- No unbounded queries — every list query must have LIMIT
- No N+1 patterns — use joins or batch queries, never sequential per-row queries
- All admin list views paginated — max 50 rows default
- Admin API response target < 500ms p95

---

## Database Rules

- Use Supabase query builder — no raw SQL strings outside migration files
- Never query current active subscribers for engagement rate calculations
  → Always use newsletter_sends snapshot as denominator
- Required indexes exist on: team_id, fetch_date, source_id, passed_threshold,
  newsletter_id, run_at — always use these columns in WHERE clauses

---

## Pipeline Rules

- One team failure must never block other teams — wrap each team in try/catch
- All article_scores_log entries written in single bulk insert at end of pipeline
  → Never write per-article mid-pipeline — accumulate in memory, flush once
- pipeline_runs row: created at start (status: partial), closed at end (completed | failed)
- Failure path always closes pipeline_runs row with status: failed + error message

**Step 2 Filter — relevance gate (v3 requirement):**
- Non-NFL keyword pre-filter on title: discard if title contains ufl, mls, mlb, nba, nhl, golf, soccer, tennis, cricket, college football, ncaa
- Same-day URL deduplication: skip URLs already in article_scores_log for this team + fetch_date
- Claude team relevance check per article: `checkTeamRelevance` in `src/lib/ai/claudePipeline.ts`
  - General source: relevant=true AND confidence >= 70
  - Team-specific source: relevant=true AND confidence >= 50
  - Claude API failure → default to not_relevant — never pass articles through on error
- Articles that fail relevance: logged with rejection_reason = not_relevant, selection_reasoning = "Rejected: not_relevant — [reasoning]"

**Current scoring reality (Phases 1–7):**
Article scoring is category-derived with fixed composite scores — not per-article AI scoring.
Phase 8 replaces this with true 4-dimension Claude API scoring.
The `checkTeamRelevance` call IS a Claude API call (relevance gate, not scoring).

**selection_reasoning format (Phase 3 deterministic strings):**
- Selected: `Selected: [category] article (score: [score])`
- Rejected quality gate: `Rejected: quality_gate (word_count)` or `Rejected: quality_gate (unreachable)`
- Rejected not relevant: `Rejected: not_relevant — [Claude reasoning]`
- Rejected duplicate: `Rejected: duplicate`
- Rejected below threshold: `Rejected: below_threshold (score: [score], threshold: [threshold])`

**Newsletter slot selection (current implementation):**
- Lead story: first non-injury article in sorted list
- Quick hits: next 4 non-injury articles (total 5 articles including lead)
- Injury block: all injury-tagged articles
- Stat of the Day: from fetched articles only — never freely generated

---

## Email / Resend Rules

- Verified domain required before sending to any subscriber
  → `onboarding@resend.dev` only allows sending to your own account email — not production
- `RESEND_FROM` must be set in Supabase secrets
  → Redeploy all Edge Functions after changing any secret
- Monitor failures via BOTH Resend dashboard AND Supabase edge function logs
- `failed_count` in assemble-and-send response means at least one recipient failed
- Per-subscriber delivery failures must surface in admin — not just aggregate counts

---

## AI / Claude API Rules

- Model: claude-haiku-4-5-20251001 for all pipeline calls
- Always request JSON-only responses when parsing structured data
- Strip markdown backticks before JSON.parse()
- Max tokens: 500 for summaries, 200 for scoring calls, 100 for binary checks
- Always wrap API calls in try/catch — API failure must never crash the pipeline
- Never call Claude API from React components or frontend code

---

## Security Rules

- Never expose Anthropic API key to frontend
- Never expose Supabase service role key to frontend or client-side code
- Browser Supabase client: anon key only — respect RLS patterns
- Service role key: server/edge only
- All /admin routes must verify Supabase Auth session server-side on every request
- Unsubscribe links must use a signed secure token — never raw subscriber_id

---

## TypeScript Rules

- Strict mode everywhere — no `any` types, use `unknown` or define explicit types
- Named exports only — no default exports except page-level components
- Async/await only — no `.then()` chains
- Every async function must have try/catch with meaningful error handling
- No `var` — only `const` and `let`
- No inline styles in JSX — Tailwind classes only

---

## Design Compliance

Design is a hard requirement — not optional context. Every UI component
must match the design system defined in prd_v3.md before a task is
considered complete.

**Token rules — apply exactly:**
- Page background: `#ffffff` — always pure white
- Card / surface background: `#f2f2f0` — never pure white for cards
- Active tab fill: `#e8e8e8` — never black, never dark
- Input background: `#fbfbfb`, border: `#e8e8e8`
- Primary text: `#111111`, muted: `#888888`, faint: `#bbbbbb`
- All team colors from DB — never hardcoded

**Team name display — always:**
- Full name = `${team.city} ${team.name}` everywhere in the UI
- Examples: "Buffalo Bills", "Kansas City Chiefs", "New England Patriots"
- Never city only, never nickname only

**Interactive states — all must be implemented:**
- Hover: defined and visible
- Selected / active: defined and visible
- Focus: defined for all form inputs
- A component with only a default state is incomplete

**Before marking any UI task complete, verify:**
- [ ] Colors match design tokens exactly
- [ ] Team names show full city + name
- [ ] All interactive states implemented
- [ ] DM Sans font applied
- [ ] No hardcoded team colors anywhere

**Fix obvious display bugs autonomously:**
If you discover a display bug, wrong field, missing state, or color mismatch
while completing a task — fix it without asking. Only stop if the fix
requires a schema migration, external dependency, or architectural decision.

---

## Naming Conventions

- Components: PascalCase (e.g. SubscriberCard.tsx)
- Hooks: camelCase prefixed with `use` (e.g. useSubscribers.ts)
- DB query functions: camelCase prefixed with `get` | `create` | `update` | `delete`
- Vercel Cron files: kebab-case in `/api/cron/`
- Edge Function files: kebab-case in `supabase/functions/`
- Environment variables: SCREAMING_SNAKE_CASE

---

## Cursor Behavior Rules

- **Focused diffs only** — do not expand scope beyond current phase tasks
- **No drive-by refactors** — do not edit files unrelated to the current task
- **No doc edits** — do not modify CLAUDE.md, BACKLOG.md, or prd_v2.md unless explicitly asked
- **Vertical slice rule** — if a feature writes to DB, the migration + pipeline write + admin UI ship together. Never build a UI that displays data the pipeline isn't writing yet
- After any pipeline change confirm with SQL:
  `SELECT COUNT(*) FROM pipeline_runs` and `SELECT COUNT(*) FROM article_scores_log`
- After each task: mark [x] in BACKLOG.md and move to Completed section immediately

---

## Production Validation

`npm run test` and `npm run build` do not validate production behavior.

Production validation required after any pipeline change:
- SQL counts: `SELECT COUNT(*) FROM pipeline_runs` and `article_scores_log`
- Manual cron invocation — check response body
- Supabase Edge Function logs for webhook endpoints
- Resend activity dashboard for delivery confirmation
- curl response bodies on open pixel and feedback endpoints

---

## Forbidden Patterns

- NO hardcoded team names, colors, slugs, or IDs anywhere in code
- NO direct fetch() to Anthropic API from React components
- NO `.then()` promise chains — async/await always
- NO `any` TypeScript type — ever
- NO unbounded DB queries without LIMIT
- NO business logic in React components
- NO environment variables accessed outside `src/lib/config.ts`
- NO Supabase Edge Functions for scheduled/pipeline work
- NO per-article DB writes mid-pipeline — bulk insert at end only
- NO service role key in frontend or client-side code
- NO sending email from unverified domain
- NO scraping source homepages to discover articles — always parse RSS feeds first, then fetch full article body from individual article URLs
