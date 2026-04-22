# Football Wire — Product Requirements Document
## Version 3.0
**Previous version:** prd_v2.md
**Date:** April 2026

### Changelog from v2
- Step 2 (Filter) rewritten: added Claude API team relevance check spec, confidence thresholds, non-NFL pre-filter, same-day URL deduplication, explicit discard-before-scoring rule
- selection_reasoning now specifies deterministic string formats for Phase 3 (no Claude call required)
- Phase 3 DoD expanded with relevance gate checkboxes and SQL validation requirements
- Phase 8 upgraded with article memory (fetch-on-demand, headlines + dates only, 7-day window)
- Phase 12 added: Podcast & Radio Discovery (post-target)
- Email Design Specification added (new section — was entirely absent from v2)
- Constraints updated: selection_reasoning clarified for Phase 3, post-target scope updated to Phases 9-12

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
| **General** | NULL | ESPN, Pro Football Talk, The Athletic NFL | Pre-approved — no validation needed | Filter at article level by team relevance |
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

### Step 2 — Filter (Team Relevance Gate)

This is a hard gate — articles that fail are discarded and never reach Step 3.

**Pre-filter: Non-NFL content**
Before any relevance check, discard articles that are clearly non-NFL.
Apply keyword filter on title — discard if title contains: ufl, mls, mlb,
nba, nhl, golf, soccer, tennis, cricket, college football, ncaa.
This prevents non-NFL RSS content from consuming Claude API calls.

**Team relevance check — Claude API call per article:**
```
Is the [CITY] [TEAM NAME] a PRIMARY subject of this article?
PRIMARY means: the article is substantially about this team, their players,
coaches, or front office decisions. A passing mention does not count.

Article title: [title]
Article body excerpt: [first 1000 chars of raw_content]

Reply JSON only: { "relevant": boolean, "confidence": 0-100, "reasoning": "one sentence" }
```

Rules:
- General source articles: must pass with relevant=true AND confidence >= 70
- Team-specific source articles: must pass with relevant=true AND confidence >= 50
- If Claude API call fails or JSON parse fails: default to relevant=false — never allow parse error to pass articles through
- Articles that fail: log with rejection_reason = not_relevant, reasoning stored in selection_reasoning
- Articles that fail: do NOT proceed to Step 3 — discarded immediately

**Same-day deduplication:**
Before relevance check, query articles table for URLs already processed
today for this team. Skip any URL already in the table — prevents
re-processing same articles across multiple same-day pipeline runs.

Do NOT deduplicate across different stories — each source scores independently.

### Step 3 — Score (All Articles)

**Phases 1-7 (category-derived scoring):**
Composite score is derived from article category using fixed weights:
- transaction → 85, injury → 80, game_analysis → 70, rumor → 60, general → 50
- Store composite_score and category in article_scores_log
- 4 dimension scores (relevance, significance, credibility, uniqueness) are null until Phase 8
- selection_reasoning must always be populated — use deterministic strings:
  - Selected: "Selected: [category] article (score: [score])"
  - Rejected below threshold: "Rejected: below_threshold (score: [score], threshold: [threshold])"
  - Rejected not relevant: "Rejected: not_relevant — [reasoning from relevance check]"
  - Rejected duplicate: "Rejected: duplicate of article_id [id]"
  - Rejected quality gate: "Rejected: quality_gate ([reason: word_count/unreachable])" 

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

## Email Design Specification

Email HTML has different constraints from web UI — no CSS classes, inline
styles only, table-based layout for Outlook compatibility, limited font
support. The design system defined for the web app does NOT apply here.
Email has its own visual spec defined below.

**Overall style:** Editorial and clean. Team-branded. Optimised for mobile
reading. Feels like a premium morning briefing, not a generic bulk email.
Reference point: Morning Brew meets a team-specific beat newsletter.

---

### Layout

- Max-width: 600px, centered
- Background: `#f4f4f4` — light grey page background
- Email body card: `#ffffff` white, centered within page background
- All content in a single-column layout — no multi-column in email
- Padding inside email body: 32px horizontal on desktop, 16px on mobile
- All styles inline — no `<style>` blocks (Outlook strips them)
- Table-based layout for all structural elements

---

### Header

```
┌─────────────────────────────────────────┐
│  FOOTBALLWIRE          [team color bar] │
│  Seattle Seahawks Daily Briefing        │
│  Wednesday, April 22 · 5-min read       │
└─────────────────────────────────────────┘
```

- Background: `#111111` dark ink
- Wordmark: "FOOTBALLWIRE" — 11px, weight 700, letter-spacing 3px, uppercase, `#ffffff`
- Team color accent bar: 3px horizontal line in team `primary_color` below wordmark
- Team name + edition: 22px, weight 700, `#ffffff`, e.g. "Seattle Seahawks Daily Briefing"
- Date + read time: 12px, `#999999`, e.g. "Wednesday, April 22 · 5-min read"
- Padding: 28px 32px

---

### Section Labels

Each section opens with a label bar:
```
TOP STORY ──────────────────────────────────
```

- Background: team `primary_color`
- Text: "TOP STORY" / "QUICK HITS" / "INJURY REPORT" / "STAT OF THE DAY"
- Font: 10px, weight 700, letter-spacing 2.5px, uppercase, `#ffffff`
- Padding: 8px 32px
- Full width — spans entire email body

---

### Top Story Block

```
┌─────────────────────────────────────────┐
│  Will Anderson signs $150M extension    │  ← headline: 20px bold #111111
│                                         │
│  Paragraph summary text here, up to     │  ← summary: 15px #444444 line-height 1.6
│  three sentences maximum per PRD spec.  │
│                                         │
│  ESPN NFL · Wed Apr 22, 3:58 AM UTC     │  ← meta: 11px #888888
│  Read more →                            │  ← link: 11px team primary_color
└─────────────────────────────────────────┘
```

- Background: `#ffffff`
- Border: none — section label provides the color anchor
- Padding: 24px 32px
- Headline: 20px, weight 700, `#111111`, line-height 1.2
- Summary: 15px, weight 400, `#444444`, line-height 1.6
- Meta (source · timestamp): 11px, `#888888`
- "Read more →" link: 11px, team `primary_color`, no underline

---

### Quick Hit Block (repeats 4x)

```
┌─────────────────────────────────────────┐
│ ▌ Cowboys make Aubrey highest-paid kicker│  ← headline with left accent bar
│                                          │
│   Two sentence summary. Second sentence. │  ← 14px #444444
│                                          │
│   Pro Football Talk · Tue Apr 21         │
│   Read more →                            │
└──────────────────────────────────────────┘
```

- Left accent bar: 3px solid team `primary_color`, height full block
- Background: `#f9f9f9` — slightly off-white to differentiate from top story
- Border-bottom: 1px solid `#eeeeee` between each quick hit
- Padding: 16px 32px 16px 20px (extra left for accent bar)
- Headline: 16px, weight 600, `#111111`
- Summary: 14px, weight 400, `#444444`, line-height 1.55
- Meta + link: same as Top Story but 11px

---

### Injury Report Block

```
TOP INJURY REPORT ───────────────────────
┌─────────────────────────────────────────┐
│  🔴 JSN — Hamstring — Questionable       │  ← 14px #111111
│     Cleared after foot scan. Monitor     │  ← 13px #666666
│     during camp.                         │
└─────────────────────────────────────────┘
```

- Section label background: `#dc2626` red — signals urgency, not team color
- Background: `#fff5f5` — very light red tint
- Status dot colors: `#dc2626` red (out/IR), `#d97706` amber (questionable), `#16a34a` green (cleared)
- Player name + status: 14px, weight 600, `#111111`
- Detail text: 13px, `#666666`
- Padding: 16px 32px
- Section omitted entirely when no injury articles exist

---

### Stat of the Day Block

```
STAT OF THE DAY ─────────────────────────
┌─────────────────────────────────────────┐
│              28 points                   │  ← stat: 40px bold team primary_color
│                                          │
│   Seahawks scored 28 points last week,  │  ← context: 14px #444444
│   ranking 8th in the NFC this season.   │
│                                          │
│   Source: ESPN NFL                       │  ← 11px #888888
└─────────────────────────────────────────┘
```

- Section label background: team `primary_color`
- Background: `#ffffff`
- Stat number: 40px, weight 700, team `primary_color`, centered
- Context sentence: 14px, `#444444`, centered, max 2 sentences
- Source attribution: 11px, `#888888`, centered
- Padding: 28px 32px
- Section omitted entirely when no verifiable stat exists

---

### Footer

```
─────────────────────────────────────────
Was this useful?
[👍 Yes]  [👎 No]

Unsubscribe · Submit a source
FOOTBALLWIRE · Daily team briefings
─────────────────────────────────────────
```

- Background: `#f4f4f4` — matches page background
- Top border: 1px solid `#e0e0e0`
- "Was this useful?" text: 13px, `#888888`, centered
- Feedback buttons: inline-block, border 1px `#dddddd`, background `#ffffff`,
  padding 8px 20px, border-radius 4px, 13px `#444444`
- Feedback links: tracked redirect URLs (per email tracking spec)
- Unsubscribe + Submit a source: 11px, `#888888`, centered, separated by ·
- Wordmark: 10px, letter-spacing 2px, uppercase, `#bbbbbb`
- Padding: 24px 32px

---

### "Light News Day" Notice

When pipeline has 1-2 articles only:
```
┌─────────────────────────────────────────┐
│  ⚠ Light news day for Seattle Seahawks  │
│  Limited verified coverage today.        │
└─────────────────────────────────────────┘
```
- Background: `#fffbeb` amber tint
- Border: 1px solid `#fde68a`
- Text: 13px, `#92400e`
- Appears directly below header, above first section

---

### Email Rendering Rules

- All colors via inline `style=""` — never CSS classes
- All layout via `<table>` and `<td>` — never `<div>` for structure
- Images: none required for MVP — text-only email avoids image blocking
- Open pixel: single `<img>` tag, 1×1px, transparent, hosted on our domain
- Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif`
  (DM Sans not reliably available in email clients — use system font stack)
- Line-height set on every text element — never inherited
- All links: `color` set inline, `text-decoration: none`
- Team colors applied via inline `style` from DB — never hardcoded

---

### Email DoD (Added to Phase 4 DoD)

- [ ] Header renders with dark background, team color accent bar, white text
- [ ] Section labels use team primary_color (except Injury Report = red)
- [ ] Top Story visually distinct from Quick Hits in size and weight
- [ ] Quick Hit blocks have team color left accent bar
- [ ] Injury status dots use correct semantic colors (red/amber/green)
- [ ] Stat of the Day number is large and team-colored
- [ ] Feedback buttons render as buttons — not plain links
- [ ] Light news day notice renders above content when applicable
- [ ] All colors applied via inline styles — no CSS class dependencies
- [ ] Layout is table-based — no div-based structure
- [ ] Renders correctly at 600px max-width in Gmail, iOS Mail, Outlook

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

**Design Compliance — Non-Negotiable**
Design is not optional and not a stretch goal. Every UI phase has design
compliance checkboxes in its DoD. A phase is not complete until all design
checkboxes pass. Cursor must verify design compliance before reporting a
phase as done.

Rules that apply to every UI component built:
- Team names always displayed as `city + " " + name` — never city or name alone
- Active tabs always `#e8e8e8` grey fill — never black, never dark
- Card backgrounds always `#f2f2f0` off-white — never pure white for card surfaces
- Page/panel backgrounds always `#ffffff` pure white
- All team colors sourced from DB — never hardcoded in code
- All hover, selected, active, focus states must be implemented — not just default state
- DM Sans font applied globally — no fallback to system sans-serif

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
- [x] App runs locally on npm run dev
- [x] All 32 teams in Supabase with correct colors — including city, name, abbreviation, primary_color
- [x] All general sources seeded and approved
- [x] All DB indexes created
- [x] Vercel deploys on push to main
- [x] BACKLOG.md in repo with Phase 2 tasks listed
- [x] DM Sans font loaded and applied as default across all pages
- [x] Tailwind design tokens configured: fw-white, fw-card, fw-tab-active, fw-input-bg, fw-ink, fw-ink-mid, fw-ink-muted, fw-ink-faint, fw-border, fw-border-mid
- [x] Subscriber landing page background is pure white `#ffffff`
- [x] Team cards display full name as `city + " " + name` (e.g. "Buffalo Bills") everywhere
- [x] Team cards background is `#f2f2f0` off-white, not white
- [x] Conference filter tabs: active state is `#e8e8e8` grey fill — NOT black or dark
- [x] All interactive states implemented: card hover (lift + border), selected (white bg + team color border + checkmark badge)
- [x] No "Selected" text label on cards — checkmark badge only
- [x] Signup box hidden before team selection, animates in after
- [x] Signup box has 4px team primary_color left border

---

### Phase 2 — Source Validation Engine ✅ MVP
- Vercel API route: `/api/validate-source` (NOT a Supabase Edge Function)
- Check 1: reachability (RSS feed parseable via rss-parser)
- Check 2: Claude API team relevance
- Paywall rate tracking
- Admin notification on flagged sources
- Source type differentiation (general | team_specific | user_submitted)

**Definition of Done:**
- [x] Valid team-specific URL → approved in DB
- [x] Unreachable URL → rejected with reason
- [x] Non-team URL confidence < 60 → flagged, admin notified
- [x] General sources never go through validation
- [x] source.type correctly set on all records
- [x] Any UI built in this phase matches design system tokens exactly
- [x] Team names displayed as city + name wherever shown

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

Cron & Infrastructure:
- [ ] Vercel Cron triggers at 6:00 AM UTC daily without errors
- [ ] Cron route returns 401 without CRON_SECRET
- [ ] Handler is idempotent — safe to manually invoke
- [ ] Zero active teams exits cleanly — no error

pipeline_runs:
- [ ] Row created per team at start with status: partial
- [ ] Row closed with status: completed + correct counts on success
- [ ] Row always closed with status: failed + error on failure
- [ ] No row ever stuck as partial after handler exits

Fetch:
- [ ] RSS feeds parsed via rss-parser — no homepage scraping
- [ ] All sources fetched completely before any filtering
- [ ] 3-article-per-source cap applied after full fetch — not during
- [ ] Full article body fetched via HTTP scrape for every article
- [ ] Articles with word_count < 200 discarded at quality gate

Filter & Score:
- [ ] Non-NFL content (UFL, MLS, golf etc.) discarded by keyword pre-filter before relevance check
- [ ] Same-day URL deduplication runs — articles already processed today are skipped
- [ ] checkTeamRelevance Claude API call runs for every general source article
- [ ] General source articles require confidence >= 70 to pass relevance check
- [ ] Team-specific source articles require confidence >= 50 to pass relevance check
- [ ] Claude API parse failure defaults to not_relevant — never passes articles through
- [ ] Articles failing relevance logged with rejection_reason = not_relevant
- [ ] Category assigned per article via Claude API
- [ ] composite_score derived from category weights exactly as specified
- [ ] selection_reasoning populated on every article — selected and rejected
- [ ] 4 dimension scores are NULL — not populated in Phase 3
- [ ] Beat reporter / wire bonuses not implemented — Phase 8 only
- [ ] Source diversity enforced — top 5 never all from same source

Deduplication:
- [ ] Layer 1 token overlap runs after scoring — not before
- [ ] Layer 2 Claude check runs for Layer 1 flagged pairs only
- [ ] Duplicate articles marked rejection_reason = duplicate

Selection & Summarisation:
- [ ] 1 lead + 4 quick hits + all injury articles selected
- [ ] Stat of the Day references real article_id — never fabricated
- [ ] AI summary max 3 sentences enforced programmatically
- [ ] Generic language check runs — regenerates on detection
- [ ] Contradiction check runs — regenerates on detection
- [ ] summary_version increments on each regeneration

Logging:
- [ ] All article_scores_log rows written in single bulk insert at end
- [ ] No per-article DB writes mid-pipeline
- [ ] article_id nullable for quality gate failures
- [ ] Every fetched article has exactly one article_scores_log row

Resilience:
- [ ] One team failure never blocks other teams
- [ ] New team with first subscriber included in next 6 AM run

Production validation (SQL counts required — not just npm test):
- [ ] `SELECT COUNT(*) FROM pipeline_runs` shows completed row after manual invoke
- [ ] `SELECT COUNT(*) FROM article_scores_log` shows correct article count
- [ ] `SELECT COUNT(*) FROM articles WHERE ai_summary IS NOT NULL` shows summaries written
- [ ] No UI built in this phase — pipeline only

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
- [ ] Email template uses team primary_color dynamically — never hardcoded
- [ ] All five sections render correctly with real content
- [ ] Empty sections omitted — no blank blocks in email

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
- [ ] Admin background is pure white `#ffffff`
- [ ] Stat cards use correct semantic colors: amber=pending, red=flagged, green=subscribers, blue=sent
- [ ] Active tab is `#e8e8e8` grey fill — NOT black
- [ ] Panel headers use `#f2f2f0` off-white background
- [ ] Row accents are 3px vertical bars colored by status (green/red/amber)
- [ ] Team pills use team primary_color background with light text
- [ ] All team names shown as city + name (e.g. "Buffalo Bills")
- [ ] All interactive states implemented: hover, active, selected
- [ ] Design system tokens applied consistently across all 3 tabs

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
Also introduces article memory and upgraded summarisation with context.

**8.1 — Article Memory: Fetch-on-Demand**
To give Claude context about recent coverage without bloating the context window:
- At pipeline start, query last 7 days of published article headlines per team
- Fetch headlines + dates only — never full article bodies of past articles
- Pass this lightweight list into scoring and summarisation prompts
- Enables uniqueness scoring: "this story was already covered Monday"
- Enables contextual summaries: "following this week's trade news..."
- Token cost is controlled and predictable — headlines only, not full bodies

```typescript
const recentCoverage = await getRecentHeadlines(team_id, days=7)
// Returns: [{ headline, published_at }] — small, bounded context
```

**8.2 — True Per-Article Scoring**
Full 4-dimension Claude API call with recent coverage context:
```
Evaluate this NFL article for [TEAM NAME] fans.
Recent coverage this week: [recentCoverage headlines]

Score each 0-100:
- relevance: does the full body substantively cover this team?
- significance: how important is this story for a fan today?
- credibility: how factual and reliable does this content appear?
- uniqueness: does this cover a distinct angle not in recent coverage?

Reply JSON only: { relevance, significance, credibility, uniqueness,
composite_score, selection_reasoning }
```
Formula: composite_score = (relevance×0.40) + (significance×0.30) + (credibility×0.20) + (uniqueness×0.10)

**8.3 — Upgraded Summarisation**
- Pass recentCoverage headlines into summarisation prompt
- Claude can reference broader context when genuinely relevant
- Still max 3 sentences, still strictly from fetched content only

**8.4 — Syntactic Proximity (Layer 1)**
Token overlap > 70% between headlines = same story candidate. Runs before scoring.

**8.5 — Semantic Deduplication (Layer 2)**
Claude confirms same story for Layer 1 flagged pairs only — not all-vs-all.

**8.6 — Cross-Source Best Selection**
Score all articles in same-story group, keep highest composite_score only.
Multi-source coverage of same story = significance bonus for that story group.

**8.7 — Source Diversity**
If top 5 articles all from same source: force article from different source.

**8.8 — Beat Reporter Signal**
beat_reporter sources: +10 credibility. Wire services: +5. Unproven user-submitted: -5.

**Definition of Done:**
- [ ] getRecentHeadlines() returns headlines + dates only — no full bodies
- [ ] Recent coverage passed into both scoring and summarisation prompts
- [ ] Every article receives Claude scoring call — no static category scores
- [ ] All 4 dimension scores populated in article_scores_log (not null)
- [ ] Summaries reference recent context where relevant
- [ ] Layer 1 token dedup runs before scoring
- [ ] Layer 2 Claude semantic check runs for flagged pairs only
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

### Phase 12 — Podcast & Radio Discovery (Post-target)

Adds an optional discovery section to the newsletter surfacing fan podcasts
and radio shows. This is a **discovery feature, not a news feature** — the
value is helping subscribers find content channels they didn't know existed.

**12.1 — Podcast Source Type**
- New value added to sources.type enum: `podcast`
- Podcast sources follow their own validation pipeline — separate from article sources
- Most podcasts publish RSS feeds — uses existing rss-parser infrastructure
- Admin can manually curate shows without RSS

**12.2 — Show-Level Validation**
Validate the show, not individual episodes. Applied once when source is added.
- Check 1: RSS feed reachable and returns valid episode list
- Check 2: Claude API — "Does this show substantively cover [TEAM NAME]?"
- Check 3: Publishing frequency — must publish at least monthly
- Admin can override and manually approve/reject any show

**12.3 — Episode Selection (Per Pipeline Run)**
- Fetch latest episode from approved podcast RSS feeds for this team
- Claude relevance check per episode: does this cover the team this week?
- If not relevant: check next most recent episode (max 3 lookback)
- One podcast block per newsletter maximum — most relevant episode wins
- Omit section entirely if no relevant episode found — graceful omit

**12.4 — Newsletter Section**
Optional Section 6 — rendered after Stat of the Day, before Footer:
```
── Listen ───────────────────────────────────
[Show Name] · [Episode Title]
One sentence: what this episode covers for this team.
→ Listen
─────────────────────────────────────────────
```
- Never replaces an article slot — purely additive
- Omitted entirely when no relevant episode exists

**12.5 — Admin & Subscriber Submission**
- Podcast sources appear in Source Queue with type badge: podcast
- Separate filter in Source Queue for podcast type
- Subscribers can submit podcast suggestions via newsletter footer link
- Submissions go through standard validation pipeline

**Definition of Done:**
- [ ] podcast added to sources.type enum with migration
- [ ] Show-level validation runs independently from article validation
- [ ] Episode selected based on team relevance — not just recency
- [ ] Newsletter renders podcast block when relevant episode exists
- [ ] Section omitted gracefully when no relevant episode found
- [ ] Admin Source Queue filters podcast sources correctly
- [ ] One podcast block per newsletter maximum enforced

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
- Every article must have selection_reasoning before inclusion or exclusion — in Phase 3 this is a deterministic string, not a Claude-generated response
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
- Phases 9-12 are documented but explicitly deferred post-target
