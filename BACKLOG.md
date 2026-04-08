# Football Wire — Backlog

## Active

### Phase 1 — Foundation

**Project Setup**
- [ ] Initialize git repository (`git init`)
- [ ] Create initial commit with project scaffold
- [ ] Create repository on GitHub (private)
- [ ] Connect local repo to GitHub remote (`git remote add origin`)
- [ ] Push initial commit to main branch
- [ ] Verify push succeeds and repo is visible on GitHub
- [ ] Create `develop` branch for active development
- [ ] Confirm branch protection on main — changes via PR only

**Supabase Schema**
- [ ] Verify all migrations run without errors on fresh Supabase project

**Seed Data**
- [ ] Verify each seeded RSS feed URL is reachable and returns valid RSS
- [ ] Confirm RSS parser can extract: title, link, pubDate, description from each feed

**Deployment**
- [ ] Connect GitHub repo to Vercel
- [ ] Configure environment variables in Vercel dashboard
- [ ] Verify deployment triggers automatically on push to main
- [ ] Verify app loads correctly at Vercel preview URL

**Backlog Hygiene**
- [ ] Add Phase 2 tasks to Active section upon Phase 1 completion

---

## Completed

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

