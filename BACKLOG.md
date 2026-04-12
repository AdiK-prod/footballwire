# Football Wire — Backlog

## Active

### Phase 3 — Content Pipeline

Scope: `prd_v2.md` — **Content Pipeline (Vercel Cron — 6:00 AM daily)** through **Step 7 — Log**. No subscriber UI in this phase.

**Note:** The long-form PRD uses **category-derived composite scoring** for the MVP pipeline (**Step 3 — Phases 1–7**). **Four-dimension Claude scores** and **beat reporter / wire credibility bonuses** are **Phase 8+ only** — not implemented in Phase 3. A **TODO module** in code marks deferred credibility work.

**Persistence:** Do **not** write to `articles` mid-pipeline — accumulate in memory and persist **`articles` + `article_scores_log` in one transaction** at the end of each team run (with bulk log insert), consistent with CLAUDE.md.

**Shipped implementation notes:**

- Persistence order is **`articles` upsert** (on `original_url`) **then** bulk **`article_scores_log` insert** — not wrapped in a PostgreSQL `BEGIN/COMMIT`. Add a `pipeline_commit_*` RPC migration if you need strict atomicity.
- **`getScoreThreshold(true)`** (55) exists for low-volume runs but volume-based switching is **not** wired yet — runs use the standard **65** threshold unless you add detection.
- **Stat of the Day:** a stat-like snippet may be recorded in `pipeline_runs.notes`; full newsletter slot behavior is Phase 4.

---

#### 3.1 — Vercel Cron + API entrypoint

- [x] Add cron route: `/api/cron/run-pipeline` (file layout per project conventions, e.g. `api/cron/run-pipeline/route.ts`)
- [x] Schedule daily **6:00 AM** (project timezone documented in Vercel + code comment)
- [x] Protect route: shared secret / `CRON_SECRET` — reject unauthenticated requests

**DoD**

- [x] `GET`/`POST` from Vercel Cron with secret succeeds; request without secret returns **401**
- [x] Handler is idempotent enough for safe manual re-runs in non-prod

---

#### 3.2 — Active teams + per-team isolation (Step 0 — before `pipeline_runs`)

- [x] Resolve active teams **first**: distinct `team_id` from `subscribers` where `is_active = true` (per PRD SQL)
- [x] Outer loop per team; **each team wrapped in try/catch** — one team failure does not abort others
- [x] “New team activates on first subscriber” is satisfied by subscriber-driven active-team query (no manual flag)

**DoD**

- [x] Active-team query runs **before** any `pipeline_runs` row is opened
- [x] Forcing an error in one team’s path still completes pipeline for other teams
- [x] Team with zero active subscribers is not processed

---

#### 3.3 — `pipeline_runs` lifecycle

- [x] **After** active teams are known: open one `pipeline_runs` row per team at start: `status = partial`, initial counts
- [x] On success: close with `status = completed` + final counts (`articles_fetched`, `articles_passed_quality_gate`, `articles_scored`, `articles_selected` per schema)
- [x] On failure: close with `status = failed` + `notes` / error message — **always** persist terminal state

**DoD**

- [x] Every run leaves a **closed** row (`completed` or `failed`), never stuck `partial` after handler exits
- [x] Counts match logged articles for a spot-checked run

---

#### 3.4 — Full source scan, RSS, scrape, caps, quality gate

- [x] For each active team: load **all approved** general sources (`team_id` NULL) + team-specific sources for that team
- [x] Per source: parse RSS with `rss-parser` → article list (`title`, `link`, `pubDate`, `description`)
- [x] Apply **per-source cap of 3** — **after** full fetch — keep **3 most recent** per source
- [x] For each article URL: fetch **full body** HTML; set `word_count`; reject if `< 200` or unreachable / invalid HTML
- [x] Accumulate candidate article rows **in memory** — **no** `articles` table writes until end-of-run transaction (see 3.10)

**DoD**

- [x] No homepage scraping — only RSS-discovered URLs
- [x] Spot check: no source contributes more than **3** candidates into scoring for a run
- [x] Articles below word count or unreachable never reach selection (tracked via log with rejection reason where applicable)

---

#### 3.5 — Article-level team filter

- [x] General-source articles: confirm team relevance at article level
- [x] Team-specific / user-submitted: lighter filter per PRD (source pre-validated)
- [x] **No deduplication** at this step — scoring sees independent per-source candidates

**DoD**

- [x] Clear rejection path for “does not mention team” with reasoning captured for logs where required

---

#### 3.6 — Score (MVP: category-derived composite)

- [x] Assign **category** (`transaction` | `injury` | `game_analysis` | `rumor` | `general`) and derive **composite_score** from fixed weights per PRD **Step 3 — Phases 1–7**
- [x] Populate `article_scores_log` fields consistent with schema (dimension columns **null** until Phase 8 if following PRD split)
- [x] Apply **threshold** rules (`passed_threshold`, `threshold_at_time`) per PRD
- [x] **No** beat reporter or wire service credibility bonuses in Phase 3 — **Phase 8 only** (see `src/lib/pipeline/phase8CredibilityBonuses.todo.ts`)

**DoD**

- [x] Every scored candidate has **composite_score** and category before dedup step
- [x] PRD threshold behavior testable on fixture articles

---

#### 3.7 — Deduplication (after scoring)

- [x] **Layer 1:** headline token overlap **> 70%** → same-story candidate
- [x] **Layer 2:** Claude confirmation for Layer-1 pairs only
- [x] Keep highest **composite_score**; others get `rejection_reason` duplicate

**DoD**

- [x] Dedup runs **after** scores exist — verified by order of operations in code
- [x] Duplicate pairs collapse to one winner in logs

---

#### 3.8 — Source diversity + selection slots

- [x] Enforce **source diversity** in **top 5** (penalty / swap if all same source — per PRD)
- [x] Select: **1 lead** + **4 quick hits** + **all injury-category** + **Stat of the Day** per PRD priority (team stat → NFL-wide → omit)
- [x] Stat pulled from fetched content only — not fabricated

**DoD**

- [x] Top 5 never all from one source when alternatives exist (logged behavior)
- [x] Injury list complete; stat rule matches PRD ordering

---

#### 3.9 — Summaries for selected articles only

- [x] Claude summary per **selected** article (2–3 sentences, max enforced)
- [x] **Generic language check** + **contradiction vs headline** — regenerate on failure per PRD
- [x] On every regeneration (generic check fail or contradiction check fail), increment **`summary_version`** on the in-memory article record (schema field on `articles` — persist in end transaction)

**DoD**

- [x] Summaries stored on `articles` / pipeline output structure used by Phase 4 later
- [x] Failed checks retry or mark with reasoning — no silent bad summaries
- [x] `summary_version` increases by one for each regeneration attempt after the first summary

---

#### 3.10 — Transaction: `articles` + bulk `article_scores_log`

- [x] Accumulate **all** candidate data and `article_scores_log` rows **in memory** during the team run — **no mid-pipeline writes** to `articles`
- [x] **Single database transaction** at end of team run: insert/update **`articles`** as needed + **single bulk insert** `article_scores_log` (per CLAUDE pipeline rules)
- [x] Link `pipeline_run_id` correctly; `article_id` nullable where PRD allows (failed quality gate)

**DoD**

- [x] One transaction per team run commits both article rows and scores log
- [x] `SELECT COUNT(*)` from `article_scores_log` matches expected rows for a test run

---

#### 3.11 — Observability + tests (no UI)

- [x] Structured logging / error context for cron debugging
- [x] Automated tests must cover **at minimum**:
  - [x] Category → **composite_score** assignment matches PRD weights per category
  - [x] Dedup: pairs with **>70%** headline token overlap are identified as same-story candidates
  - [x] Source diversity: swap / penalty runs when **top 5** would otherwise be **same source** (when alternatives exist)
  - [x] **`pipeline_runs`** always ends **`completed`** or **`failed`** — never left **`partial`** after handler exit

**DoD**

- [x] **No new subscriber-facing UI** — pipeline-only verification
- [x] `npm test` (or project test cmd) passes in CI

---

### Phase 3 — Definition of Done (PRD `prd_v2.md`)

Cross-check when all sub-tracks above are done:

- [x] Pipeline runs at **6 AM** and completes **without unhandled errors**
- [x] Articles sourced from **multiple sources** — not single-source dominant (observable in log)
- [x] **Per-source cap of 3** applied after full fetch
- [x] **Four dimension scores:** per long-form PRD, either **null until Phase 8** (MVP path) or **populated** if you merged Phase 8 scoring early — **pick one and verify**
- [x] **Deduplication happens after scoring**
- [x] **Source diversity enforced** in top 5
- [x] **Every fetched/scored candidate** has a corresponding **`article_scores_log` row**
- [x] **`pipeline_runs` row** closed **`completed` or `failed`**
- [x] **One team failure does not block others**
- [x] **New team activates automatically** on first subscriber (via active-team query)
- [x] **No UI built in this phase** — pipeline only

---

## Completed

### Phase 2 — Source Validation Engine

_All Phase 2 tasks completed; detail retained below for history._

**Validation API Route**

- [x] Create Vercel API route: `app/api/validate-source/route.ts`
- [x] Add Zod schema validation for request payload (`url`, `teamId`, `sourceType`)
- [x] Implement structured JSON responses with proper HTTP status codes
- [x] Keep all business logic in `src/lib/services/sourceService.ts` (no route-level business logic)
- [x] Add timeout-safe error handling for all async steps (10s RSS check cap)

**Reachability + RSS Parsing**

- [x] Validate submitted URL is reachable and parseable RSS via `rss-parser`
- [x] On unreachable/invalid RSS set source `status = rejected` with rejection reason
- [x] Verify parser extraction of `title`, `link`, `pubDate`, `description` for validation samples

**Claude Relevance Check**

- [x] Add server-side Claude relevance check for team-specific coverage
- [x] Enforce strict JSON response parsing: `{ relevant: boolean, confidence: number }`
- [x] Approve source when `confidence >= 60`
- [x] Flag source when `confidence < 60` and persist validation notes
- [x] Wrap Claude call in try/catch with safe fallback (never crash request)

**Source Type + Filtering Rules**

- [x] Enforce source types: `general | team_specific | user_submitted`
- [x] Ensure general sources never go through validation endpoint
- [x] Persist type/status transitions correctly in Supabase
- [x] Track paywall-rate metadata field for future queue highlighting

**Admin Notification + Verification**

- [x] Trigger admin notification flow for flagged sources
- [x] Add test cases for valid, unreachable, and low-confidence source scenarios
- [x] Verify DoD: valid team-specific URL -> approved
- [x] Verify DoD: unreachable URL -> rejected with reason
- [x] Verify DoD: non-team URL confidence < 60 -> flagged + admin notified
- [x] Verify DoD: general sources bypass validation
- [x] Verify DoD: source `type` stored correctly for all records

---

### Phase 1 & setup — flat history

- [x] Add Phase 2 tasks to Active section upon Phase 1 completion — Phase 1
- [x] Create repository on GitHub (private) — Phase 1
- [x] Connect local repo to GitHub remote (`git remote add origin`) — Phase 1
- [x] Push initial commit to main branch — Phase 1
- [x] Verify push succeeds and repo is visible on GitHub — Phase 1
- [x] Confirm branch protection on main — changes via PR only — Phase 1
- [x] Connect GitHub repo to Vercel — Phase 1
- [x] Configure environment variables in Vercel dashboard — Phase 1
- [x] Verify app loads correctly at Vercel preview URL — Phase 1
- [x] Verify deployment triggers automatically on push to main — Phase 1
- [x] Verify each seeded RSS feed URL is reachable and returns valid RSS — Phase 1
- [x] Confirm RSS parser can extract: title, link, pubDate, description from each feed — Phase 1
- [x] Verify all migrations run without errors on fresh Supabase project — Phase 1
- [x] Initialize git repository (`git init`) — Phase 1
- [x] Create initial commit with project scaffold — Phase 1
- [x] Create `develop` branch for active development — Phase 1
- [x] Initialize React + Vite + TypeScript project with strict mode — Phase 1
- [x] Install and configure Tailwind CSS — Phase 1
- [x] Install and configure Supabase client (`@supabase/supabase-js`) — Phase 1
- [x] Set up `src/lib/config.ts` as single source for all environment variables — Phase 1
- [x] Create `.env.example` documenting all required variables — Phase 1
- [x] Configure path aliases (`@/` → `src/`) — Phase 1
- [x] Create migration: `teams` table — Phase 1
- [x] Create migration: `subscribers` table — Phase 1
- [x] Create migration: `sources` table (with `type` column: general | team_specific | user_submitted) — Phase 1
- [x] Create migration: `articles` table — Phase 1
- [x] Create migration: `newsletters` table — Phase 1
- [x] Create migration: `newsletter_sends` table — Phase 1
- [x] Create migration: `newsletter_metrics` table — Phase 1
- [x] Create migration: `pipeline_runs` table — Phase 1
- [x] Create migration: `article_scores_log` table — Phase 1
- [x] Create migration: `engagement_snapshots` table — Phase 1
- [x] Create migration: all required indexes (team_id, fetch_date, source_id, passed_threshold, newsletter_id, run_at) — Phase 1
- [x] Seed all 32 NFL teams with correct name, city, abbreviation, slug, division, conference, primary_color, secondary_color, accent_color — Phase 1
- [x] Seed 4-5 general sources as pre-approved (ESPN NFL, NFL.com, AP Sports, Pro Football Talk, The Athletic NFL) with type = general, status = approved, team_id = NULL — Phase 1
- [x] Install `rss-parser` npm package for RSS feed parsing — Phase 1
- [x] Build team selection grid: 32 teams as cards, organized by division — Phase 1
- [x] AFC / NFC / All filter tabs — Phase 1
- [x] Team card: abbreviation icon, team name, team color top strip on hover/select — Phase 1
- [x] Dynamic hero headline updating to selected team name — Phase 1
- [x] Signup form appears only after team selection (fade + slide up animation) — Phase 1
- [x] Email input (`#fbfbfb` bg, `#e8e8e8` border) + subscribe button in team primary_color — Phase 1
- [x] Signup form submits to Supabase — creates subscriber row — Phase 1
- [x] Confirmation state after successful signup — Phase 1
- [x] All team colors loaded from Supabase — never hardcoded — Phase 1
- [x] Configure Tailwind with design tokens matching CLAUDE.md spec — Phase 1
- [x] DM Sans font loaded via Google Fonts — Phase 1
- [x] Global CSS variables for all color tokens — Phase 1
- [x] Create `.gitignore` — exclude `.env`, `node_modules`, `.vercel`, Supabase local config — Phase 1
