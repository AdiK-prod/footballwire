# Football Wire — Product Requirements Document v2

---

## Project Overview

Football Wire (`footballwire.uk`) is a daily team-specific NFL newsletter delivering a curated 5-minute morning briefing to fans of any NFL team. Each subscriber selects their team at signup and receives a personalized daily digest assembled from approved sources, AI-summarized for clarity and brevity.

**Core philosophy:** Empowerment without prescription — give fans full visibility into their team's news without telling them what to think about it.

**Domain:** `footballwire.uk` — registered on Cloudflare
**Sending domain:** `mail.footballwire.uk` — configured via Resend
**Subscriber app:** `footballwire.uk`
**Admin dashboard:** `footballwire.uk/admin`

---

## Target Persona

**The Commuter Fan** — 35-50 year old professional, loyal NFL fan, reads on mobile during commute or over morning coffee. Wants to feel fully caught up on their team in under 5 minutes. Values clean, trustworthy design. Will form a daily habit if the product earns their trust.

---

## Success Metrics

- Day 1 Open Rate > 50%
- 5-of-7 Weekly Engagement Rate > 40%
- 👍 Satisfaction Rate > 70% positive

---

## Optimization Hierarchy

All technical decisions are evaluated in this priority order:

1. **Cost** — minimize infrastructure and API spend
2. **Performance** — fast, responsive, no janky admin UX
3. **Maintainability** — simple code that is easy to reason about
4. **Ease of development** — developer experience is last, not first

---

## Technical Architecture

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Fast builds, small bundle, utility-first styling |
| Backend | Supabase (PostgreSQL + Auth) | Managed DB + auth, generous free tier, good DX |
| Pipeline scheduling | Vercel Cron Functions | Free tier covers daily runs, no cold start on schedule, simpler than Edge Functions |
| Webhook endpoints | Supabase Edge Functions | Stateless only: open pixel, feedback, unsubscribe |
| Source validation | Vercel API route (`/api/validate-source`) | User-triggered, needs server-side Claude call |
| Deployment | Vercel | Free tier, CI/CD on push, preview deployments |
| Email delivery | Resend | Best cost/deliverability ratio, excellent Supabase integration |
| AI layer | Anthropic Claude API — Haiku | Cheapest capable model for summarization and scoring |
| Domain | Cloudflare Registrar — `footballwire.uk` | Cheapest registrar, no markup |
| Task management | BACKLOG.md in repo | Cursor reads and updates — no external tooling overhead |

**Why Vercel Cron over Supabase Edge Functions for pipeline:**
Edge Functions have cold start latency and per-invocation cost that compounds on a pipeline processing 75+ articles daily. Vercel Cron runs scheduled functions in a warm Node.js environment at no cost within free tier limits. Edge Functions are retained only for stateless webhook endpoints where latency matters less than simplicity.

---

## Database Schema

### teams
```
id, name, city, slug, abbreviation
primary_color, secondary_color, accent_color
logo_url, division, conference
```
Note: No `is_active` field. A team is considered active when it has at least one active subscriber. Active state is always derived — never stored.

### subscribers
```
id, email, team_id (FK → teams)
subscribed_at, is_active, last_opened_at
```

### sources
```
id, team_id (FK → teams, NULL for general sources)
url, name
type (general | team_specific | user_submitted)
status (pending | approved | rejected | flagged)
relevance_score, submitted_by, created_at
paywall_rate (float — % of articles that hit paywall)
beat_reporter (boolean — true for known beat reporters, +10 credibility bonus in Phase 8)
is_wire_service (boolean — true for AP, Reuters etc, +5 credibility bonus in Phase 8)
```

### articles
```
id, source_id, team_id (FK → teams)
title, original_url
raw_content (full body — not RSS excerpt)
ai_summary, published_at
category (transaction | injury | game_analysis | rumor | general)
relevance_score, significance_score, credibility_score
uniqueness_score, composite_score
selection_reasoning, rejection_reason
validation_notes
passed_threshold (boolean)
summary_version (integer)
previously_published (boolean)
word_count
is_mid_game (boolean)
stat_source_article_id (FK → articles, nullable)
```

### newsletters
```
id, team_id (FK → teams)
sent_at, subject_line, html_content
status (draft | sent | failed)
```

### newsletter_sends
```
id, newsletter_id, subscriber_id
sent_at, status (sent | failed | bounced)
error_reason
```

### newsletter_metrics
```
id, newsletter_id, subscriber_id
opened_at, feedback (thumbs_up | thumbs_down | null)
```

### pipeline_runs
```
id, team_id (FK → teams)
run_at, status (partial | completed | failed)
articles_fetched, articles_passed_quality_gate
articles_scored, articles_selected
notes
```

### article_scores_log
```
id, pipeline_run_id, article_id (FK → articles, NULLABLE — null for articles that failed quality gate)
team_id, source_id, source_name, source_type
fetch_date, headline, original_url, word_count
relevance_score, significance_score, credibility_score
uniqueness_score, composite_score
selection_reasoning, rejection_reason
passed_quality_gate, passed_threshold
threshold_at_time, summary_generated
```

### engagement_snapshots
```
id, team_id, computed_at, period_start, period_end
active_subscribers, day1_open_rate
weekly_engagement_rate, satisfaction_rate, churned_count
```

### churn_events
```
id, subscriber_id, team_id
churned_at, reason (unsubscribed | inactive_14_days)
```

**Required DB indexes:**
```sql
CREATE INDEX idx_subscribers_team ON subscribers(team_id) WHERE is_active = true;
CREATE INDEX idx_articles_team_date ON articles(team_id, published_at);
CREATE INDEX idx_sources_team_type ON sources(team_id, type, status);
CREATE INDEX idx_article_scores_team_date ON article_scores_log(team_id, fetch_date);
CREATE INDEX idx_article_scores_threshold ON article_scores_log(passed_threshold);
CREATE INDEX idx_newsletter_sends_status ON newsletter_sends(newsletter_id, status);
CREATE INDEX idx_pipeline_runs_team ON pipeline_runs(team_id, run_at);
```

---

## Source Management

### Three Source Tiers

| Type | team_id | Example | Validation | Article filtering |
|---|---|---|---|---|
| **General** | NULL | ESPN, NFL.com, AP Sports | Pre-approved — no validation needed | Filter at article level by team relevance |
| **Team-specific** | set | SeahawksWire.com, beat reporters | Full validation pipeline | Assumed relevant at source level, verified at article level |
| **User-submitted** | set | Fan blogs, local papers | Full validation pipeline | Same as team-specific |

### General Sources — Seeded at Initialization
4-5 pre-approved global RSS feeds covering all NFL teams. Every activated team gets newsletter content from day one using these sources. No waiting for team-specific validation.

RSS feeds are parsed using `rss-parser` npm package. The pipeline:
1. Fetches RSS feed → extracts article list (title, link, pubDate, description)
2. Filters articles by team relevance
3. Fetches full article body from each individual article URL
4. Never scrapes source homepages — always starts from RSS feed

Seed list:
- ESPN NFL (`https://www.espn.com/espn/rss/nfl/news`)
- NFL.com (`https://www.nfl.com/rss/rsslanding`)
- AP Sports NFL (`https://apnews.com/apf-sports`)
- Pro Football Talk (`https://profootballtalk.nbcsports.com/feed/`)
- The Athletic NFL (`https://theathletic.com/rss/nfl`)

### Source Validation Pipeline
Applies to team-specific and user-submitted sources only.
Implemented as a Vercel API route (`/api/validate-source`) — NOT a Supabase Edge Function.

**Check 1 — Reachability**
- Fetch URL, confirm parseable RSS feed returned (using rss-parser)
- Timeout: 10 seconds
- Fail: status = rejected, reason = unreachable

**Check 2 — Team Relevance**
- Claude API: "Does this source substantively cover [TEAM NAME]? Reply JSON: { relevant: boolean, confidence: 0-100 }"
- confidence >= 60: status = approved
- confidence < 60: status = flagged, admin notified

**Paywall Detection**
- Sources with > 30% paywall rate flagged in admin Source Queue

---

## Team Activation

A team is active when `SELECT COUNT(*) FROM subscribers WHERE team_id = X AND is_active = true > 0`.

**On first subscriber signup for a team:**
1. Subscriber row created in DB
2. Team is now considered active — no additional action needed
3. Pipeline will include this team on the next scheduled 6 AM run
4. First newsletter sends the following morning using general sources only
5. Admin is notified of new team activation

No `is_active` field on teams table. No manual admin activation step. Derived state only.

---

## Content Pipeline (Vercel Cron — 6:00 AM daily)

Runs once per day. Iterates all active teams independently. One team failing never blocks others.

### Step 0 — Identify Active Teams
```sql
SELECT DISTINCT team_id FROM subscribers WHERE is_active = true
```

### Step 1 — Fetch (Full Source Scan)
For each active team:
- Query all approved general sources (team_id = NULL)
- Query all approved team-specific sources for this team
- Fetch ALL sources completely before any filtering
- For each source: parse RSS feed via `rss-parser` → extract article list (title, link, pubDate, description)
- Apply 3-article-per-source cap AFTER full fetch — keep 3 most recent per source
- For each article URL: fetch full article body via HTTP scrape — RSS excerpt is never sufficient
- Pre-screening only (not content filtering):
  - word_count >= 200 (discard paywall/boilerplate)
  - URL is reachable and returns valid HTML content

### Step 2 — Filter
- Confirm each article mentions the team
- General source articles: filter at article level
- Team-specific source articles: lighter filter — source is pre-validated
- Do NOT deduplicate here — each source scores independently

### Step 3 — Score (All Articles)

**Phases 1-7 (category-derived scoring):**
Composite score is derived from article category using fixed weights:
- transaction → 85, injury → 80, game_analysis → 70, rumor → 60, general → 50
- Store composite_score and category in article_scores_log
- 4 dimension scores (relevance, significance, credibility, uniqueness) are null until Phase 8

**Phase 8+ (true per-article Claude scoring — replaces above):**
Per article Claude call:
```
Evaluate this NFL article for a daily newsletter for [TEAM NAME] fans.
Score each 0-100:
- relevance: does the full body substantively cover this team?
- significance: how important is this story for a fan today?
- credibility: how factual and reliable does this content appear?
- uniqueness: does this cover a distinct story vs others?

Provide selection_reasoning in 1-2 sentences.
Reply JSON only: { relevance: int, significance: int, credibility: int,
uniqueness: int, composite_score: int, selection_reasoning: string }
```
Formula: `composite_score = (relevance × 0.40) + (significance × 0.30) + (credibility × 0.20) + (uniqueness × 0.10)`

Threshold: >= 65 standard, >= 55 low-volume conditions

**Source diversity enforcement (both phases):**
- If top 5 articles all from same source: apply diversity penalty, force article from different source

**Beat reporter signal (Phase 8+):**
- Sources marked `beat_reporter = true`: +10 credibility bonus
- Wire services (AP, Reuters): +5 credibility bonus
- User-submitted with < 10 approved articles: -5 credibility

### Step 4 — Deduplicate (After Scoring)
Layer 1 — Syntactic: token overlap > 70% between headlines = same story candidate
Layer 2 — Semantic: Claude confirms same story for Layer 1 flagged pairs only
Resolution: keep highest composite_score per story, mark others rejection_reason = duplicate

### Step 5 — Select
- 1 lead story (highest composite_score)
- 4 quick hits (next ranked)
- All injury-category articles
- Stat of the Day (from fetched articles only — never fabricated)

**Stat of the Day priority:**
1. Team-specific stat from today's articles
2. NFL-wide stat contextualizing the team's position
3. Omit entirely if nothing verifiable exists

### Step 6 — Summarize Selected Articles
- Claude API per selected article: factual 2-3 sentence summary
- Strictly from fetched content — no fabrication or inference
- Web search permitted only to verify a specific named statistic
- Max 3 sentences enforced programmatically
- Generic language check — regenerate if detected
- Contradiction check against headline — regenerate if detected

### Step 7 — Log
All articles logged to article_scores_log in single bulk insert at end.
Pipeline run closed with final counts and status (completed | failed).

---

## Newsletter Format

Delivered daily at 6:00 AM to all active subscribers per team.
Sent from: `newsletter@mail.footballwire.uk`

**Five sections:**
1. **Top Story** — lead article, full 3-sentence AI summary, source + timestamp, read more link
2. **Quick Hits** — 4 articles, headline + 2-sentence summary, source attribution
3. **Injury Report** — injury-category articles only. Omit section entirely if none exist.
4. **Stat of the Day** — team-specific or NFL-wide contextual stat. Omit if none verifiable.
5. **Footer** — 👍/👎 feedback, unsubscribe link, submit-a-source link

Empty sections are never rendered. A newsletter with only Top Story + Quick Hits is valid.

**Fallback behavior:**
- 0 articles pass threshold → do not send, notify admin
- 1-2 articles pass → send reduced newsletter with "Light news day" header notice

---

## Email Tracking

### Send-time Subscriber Snapshot
At send time, record every subscriber receiving the newsletter in `newsletter_sends`. This is the denominator for all rate calculations — never current active subscriber count.

### Open Tracking
- 1px pixel per subscriber per newsletter
- Endpoint: `/track/open?nid={newsletter_id}&sid={subscriber_id}`
- First open only — deduped
- Writes `opened_at` to newsletter_metrics

### Feedback Tracking
- `/track/feedback?nid={newsletter_id}&sid={subscriber_id}&v={thumbs_up|thumbs_down}`
- Last value wins — one feedback per subscriber per newsletter
- Redirect to confirmation page

### Unsubscribe
- `/unsubscribe?sid={subscriber_id}&token={secure_token}`
- One-click, instant, no confirmation email
- Sets `subscriber.is_active = false`

### Delivery Status
- Every send attempt recorded in newsletter_sends with status
- Admin notified when delivery failure rate > 10% for any issue

---

## Engagement Metrics

**Day 1 Open Rate**
Numerator: distinct subscribers who opened within 24h of send
Denominator: total rows in newsletter_sends for that issue
Target: > 50%

**5-of-7 Weekly Engagement Rate**
Definition: subscriber opened at least 5 of the last 7 sent issues
Rolling window — not calendar week
Target: > 40%

**👍 Satisfaction Rate**
Numerator: issues where feedback = thumbs_up
Denominator: issues where any feedback recorded
Target: > 70%

**Churn**
Unsubscribed OR no open in 14 consecutive days
Computed weekly, stored in churn_events

Metrics pre-computed weekly into engagement_snapshots — never computed on-the-fly in admin UI.

---

## Design System

One unified system across subscriber app and admin dashboard.

**Colors**
- Background: `#ffffff`
- Card / off-white surface: `#f2f2f0`
- Active tab: `#e8e8e8` grey fill
- Input field: `#fbfbfb` bg, `#e8e8e8` border
- Primary text: `#111111`
- Secondary text: `#444444`
- Muted text: `#888888`
- Faint / labels: `#bbbbbb`
- Border default: `#e8e8e8`
- Border mid: `#d4d4d4`

**Semantic card colors (meaning only — never decoration):**
- Amber `#d97706` / bg `#fffbeb` / border `#fde68a` — pending, needs attention
- Red `#dc2626` / bg `#fff5f5` / border `#fecaca` — flagged, urgent, errors
- Green `#16a34a` / bg `#f0fdf4` / border `#bbf7d0` — confirmed, positive
- Blue `#2563eb` / bg `#eff6ff` / border `#bfdbfe` — informational

**Typography**
- Font: DM Sans
- Logo: 13px, weight 700, letter-spacing 2px, uppercase
- Eyebrow labels: 9px, weight 600, letter-spacing 2.5px, uppercase, `#bbbbbb`
- Panel titles: 14-15px, weight 600
- Row titles: 12px, weight 500
- Meta: 10-11px, `#888888`
- Stat values: 30px, weight 700

**Components**
- Topbar: white bg, 1px `#e8e8e8` bottom border
- Tabs: white bg, 1px `#d4d4d4` border, 8px radius. Active = `#e8e8e8` fill
- Cards neutral: `#f2f2f0` bg, 1px `#e8e8e8` border, 10px radius
- Row accent: 3px × 34px vertical bar, colored by status
- Team pills: team primary_color bg, light text
- Badges: colored bg + matching border per semantic color
- Input: `#fbfbfb` bg, `#e8e8e8` border

**Newsletter email** retains separate editorial design — unaffected by this system.

---

## Development Phases

### Phase 1 — Foundation ✅ MVP
- React + Vite + Tailwind scaffold
- Supabase schema with all indexes
- Seed all 32 NFL teams with correct colors
- Seed 4-5 general sources (pre-approved, no validation)
- Environment variable setup
- Vercel deployment + BACKLOG.md initialized

**Definition of Done:**
- [ ] App runs locally on npm run dev
- [ ] All 32 teams in Supabase with correct colors
- [ ] All general sources seeded and approved
- [ ] All DB indexes created
- [ ] Vercel deploys on push to main
- [ ] BACKLOG.md in repo with Phase 2 tasks listed

---

### Phase 2 — Source Validation Engine ✅ MVP
- Vercel API route: `/api/validate-source` (NOT a Supabase Edge Function)
- Check 1: reachability (RSS feed parseable via rss-parser)
- Check 2: Claude API team relevance
- Paywall rate tracking
- Admin notification on flagged sources
- Source type differentiation (general | team_specific | user_submitted)

**Definition of Done:**
- [ ] Valid team-specific URL → approved in DB
- [ ] Unreachable URL → rejected with reason
- [ ] Non-team URL confidence < 60 → flagged, admin notified
- [ ] General sources never go through validation
- [ ] source.type correctly set on all records

---

### Phase 3 — Content Pipeline ✅ MVP
- Vercel Cron Function: runs daily at 6:00 AM (in `/api/cron/run-pipeline.ts`)
- Active team detection from subscriber count
- Full source scan (general + team-specific)
- Full article body scraping
- Quality gate: word count >= 200, reachability
- All articles scored via Claude API (4 dimensions)
- Syntactic + semantic deduplication after scoring
- Source diversity enforcement
- Beat reporter credibility signal
- Select: 1 lead + 4 quick hits + injuries + stat
- Stat of the Day: team-specific first, NFL-wide fallback, omit if none
- Summarize selected articles
- Generic language check + contradiction check per summary
- All articles logged to article_scores_log in single bulk write
- Pipeline run opened and closed with counts + status

**Definition of Done:**
- [ ] Pipeline runs at 6 AM and completes without errors
- [ ] Articles sourced from multiple sources — not single source dominant
- [ ] Per-source cap of 3 applied after full fetch
- [ ] All 4 dimension scores populated per article
- [ ] Deduplication happens after scoring
- [ ] Source diversity enforced in top 5
- [ ] Every fetched article has article_scores_log row
- [ ] pipeline_runs row closed with completed or failed
- [ ] One team failure does not block others
- [ ] New team activates automatically on first subscriber

---

### Phase 4 — Newsletter Assembly & Delivery ✅ MVP

**Prerequisites:**
1. Add `footballwire.uk` to Resend
2. Configure sending subdomain `mail.footballwire.uk`
3. Add SPF, DKIM, DMARC records to Cloudflare DNS
4. Verify all three records green in Resend
5. Set sender: `newsletter@mail.footballwire.uk`

**4.1 — Assembly**
- Assemble pipeline output into HTML email
- Five sections: Top Story, Quick Hits, Injury Report, Stat of the Day, Footer
- Empty sections omitted gracefully
- Reduced newsletter + notice when < 3 articles
- No send + admin notification when 0 articles

**4.2 — Subscriber Snapshot**
- Record newsletter_sends row per subscriber at send time
- Status: sent | failed | bounced + error_reason
- This is the denominator for all engagement calculations

**4.3 — Open Tracking**
- 1px pixel per subscriber, first open only, deduped

**4.4 — Feedback Tracking**
- 👍/👎 redirect endpoints, last value wins

**4.5 — Unsubscribe**
- One-click, instant, secure token

**4.6 — Delivery Failure Alerting**
- Admin notified when failure rate > 10% per issue

**Definition of Done:**
- [ ] `footballwire.uk` verified in Resend, all DNS records green
- [ ] Test email sends from `newsletter@mail.footballwire.uk`
- [ ] Email renders in iOS Mail, Gmail, Outlook
- [ ] newsletter_sends row per subscriber with status
- [ ] Open pixel fires on first open only
- [ ] 👍/👎 writes to newsletter_metrics
- [ ] Unsubscribe sets is_active = false instantly
- [ ] Admin notified when failure rate > 10%

---

### Phase 5 — Admin Dashboard ✅ MVP

3 tabs. Authentication via Supabase magic link. Admin role guard on all routes.

**5.1 — Source Queue Tab**
- All pending + flagged sources
- Source type badge: general | team-specific | user-submitted
- Validation detail inline (expandable) — no separate Validation Logs tab in MVP
- Actions: Approve / Reject / Override
- Filters: status, team, type

**5.2 — Content Preview Tab**
- Today's assembled newsletter before send
- Per-article: composite_score, selection_reasoning visible
- Actions: remove article, reorder, regenerate summary, Send Now, Schedule

**5.3 — Subscribers Tab**
- Active subscribers per team
- Day 1 open rate per issue (computed from newsletter_sends — raw data until Phase 7)
- 5-of-7 weekly engagement rate (computed from newsletter_metrics — raw data until Phase 7)
- 👍/👎 satisfaction rate
- Churned this week
- By-team breakdown with team color accents
- Delivery failure alert when > 10% failure rate on any issue
Note: Phase 7 upgrades this tab to read from pre-computed engagement_snapshots with trend arrows

**Performance requirements:**
- All admin queries use indexed columns — no unbounded table scans
- All list views paginated — max 50 rows per page
- No N+1 query patterns — use joins not sequential queries
- Admin API response time < 500ms p95

**Definition of Done:**
- [ ] Magic link login works end to end
- [ ] Unauthenticated requests redirected to /admin/login
- [ ] Source Queue shows all pending + flagged with inline validation detail
- [ ] Content Preview shows today's newsletter with scores
- [ ] Subscribers tab shows metrics computed from raw newsletter_sends and newsletter_metrics tables (engagement_snapshots not yet available — built in Phase 7)
- [ ] All queries use indexed columns
- [ ] No list view loads more than 50 rows unbounded
- [ ] Admin page load < 2s on standard connection

---

### Phase 6 — Observability & Diagnostics 🎯 TARGET

**6.1 — Article Logs Tab (new admin tab)**
- Pipeline Run Summary card: fetched / quality gate / scored / selected
- Article list: headline, source, type, score breakdown, status, rejection reason, reasoning
- Filters: team, date, source, score range, status, rejection reason

**6.2 — Mailing List Tab (new admin tab)**
- Full subscriber list: email, team, subscribed date, status, last opened
- Per-issue delivery status view
- Filter by team, status, date range
- Manual re-send for failed deliveries

**6.3 — Pipeline Error Visibility**
- Failed pipeline runs surfaced in admin
- Admin email on pipeline failure
- Per-team status for partial runs

**Definition of Done:**
- [ ] Article Logs tab shows all scored articles with full breakdown
- [ ] All 5 filters functional
- [ ] Mailing List tab shows all subscribers with delivery status
- [ ] Pipeline failures visible in admin with error message

---

### Phase 7 — User Engagement Tracking 🎯 TARGET

**7.1 — Metric Computation**
- Day 1 open rate computed per issue after 24h window closes
- 5-of-7 computed weekly per team, stored in engagement_snapshots
- Satisfaction rate per issue and rolling 30-day
- Churn events logged weekly

**7.2 — Admin Enhancement**
- Subscribers tab reads from engagement_snapshots
- Trend arrows: week-over-week direction per metric
- Alert when metric drops below target

**7.3 — Feedback Loop**
- 👎 received: log article selection data for that issue
- Auto-flag team when satisfaction < 60% for 3 consecutive issues

**Definition of Done:**
- [ ] engagement_snapshots populated weekly
- [ ] All metrics use send-time snapshot as denominator
- [ ] Trend arrows correct
- [ ] Auto-flag fires at correct threshold

---

### Phase 8 — Article Scoring Intelligence 🎯 TARGET

Replaces category-based static scoring with true per-article AI evaluation.

**8.1 — True Per-Article Scoring**
Full 4-dimension Claude API call per article as specified in pipeline section.

**8.2 — Syntactic Proximity (Layer 1)**
Token overlap > 70% between headlines = same story candidate. Runs before scoring.

**8.3 — Semantic Deduplication (Layer 2)**
Claude confirms same story for Layer 1 flagged pairs only — not all-vs-all.

**8.4 — Cross-Source Best Selection**
Score all articles in same-story group, keep highest composite_score only.
Multi-source coverage of same story = significance bonus for that story group.

**8.5 — Source Diversity**
If top 5 articles all from same source: force article from different source.

**8.6 — Beat Reporter Signal**
beat_reporter sources: +10 credibility. Wire services: +5. Unproven user-submitted: -5.

**Definition of Done:**
- [ ] Every article receives Claude scoring call — no static category scores
- [ ] All 4 dimension scores in article_scores_log (not null)
- [ ] Layer 1 token dedup runs before scoring
- [ ] Layer 2 semantic check runs for flagged pairs only
- [ ] Source diversity enforced
- [ ] Beat reporter bonus applied correctly

---

### Phase 9 — Content Pipeline Optimization (Post-target)
- Duplicate suppression across previous issues
- Mid-game article detection and hold
- Seasonal mode detection (offseason / draft / playoffs)
- Volume throttling (cutoff raises to 75 when > 10 pass, lowers to 55 when < 3)

### Phase 10 — Summarization Quality (Post-target)
- Generic summary detection and regeneration
- Headline contradiction check and regeneration
- summary_version tracking

### Phase 11 — Seasonal & Volume Adaptation (Post-target)
- NFL calendar phase detection
- Per-phase scoring weight adjustment
- Paywall source flagging at source level

---

## Backlog Management

**No external task management tool.** Cursor reads and updates `BACKLOG.md` at the project root.

Format:
```markdown
# Football Wire — Backlog

## Active
- [ ] Task description — Phase X

## Completed
- [x] Task description — Phase X
```

Cursor runs all Active tasks for the current phase autonomously — no per-task approval needed. Each completed task is marked [x] and moved to Completed immediately. Cursor stops only when the phase is fully complete, an external dependency is required, or an unresolvable error occurs. Phase transitions require user confirmation — Cursor reports DoD verification and waits before adding next phase tasks.

---

## Constraints & Non-Negotiables

**Architecture**
- All 32 teams seeded from day one — no hardcoded team logic
- Team active state always derived from subscriber count — never stored
- One team pipeline failure must never block other teams
- All admin queries must use indexed columns — no table scans
- No N+1 query patterns in admin dashboard
- No Supabase Edge Functions for scheduled pipeline work — Vercel Cron only

**Content Quality**
- Full article body fetched — RSS headline alone is never sufficient
- Newsletter content strictly from fetched data — no AI fabrication
- Web search only to verify a specific named fact — never generate content
- Every article must have selection_reasoning before inclusion or exclusion
- composite_score = (relevance × 0.40) + (significance × 0.30) + (credibility × 0.20) + (uniqueness × 0.10)
- Minimum composite_score 65 (55 low-volume)
- Previously published article URLs never reappear in newsletter
- Summary contradicting headline never publishes
- Empty sections never render — omit gracefully
- Stat of the Day traceable to specific fetched article — never freely generated

**Email**
- Newsletter must render correctly in iOS Mail, Gmail, and Outlook
- Sending domain must have SPF, DKIM, DMARC configured before first send
- Open tracking deduped — one open event per subscriber per newsletter
- Unsubscribe must be one-click and instant

**MVP Scope**
- Phases 1-5 constitute the MVP
- Target completion includes Phases 6-8
- Phases 9-11 are documented but explicitly deferred post-target
