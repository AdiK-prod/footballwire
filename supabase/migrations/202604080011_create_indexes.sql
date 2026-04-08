create index if not exists idx_subscribers_team
  on public.subscribers(team_id)
  where is_active = true;

create index if not exists idx_articles_team_date
  on public.articles(team_id, published_at desc);

create index if not exists idx_sources_team_type
  on public.sources(team_id, type, status);

create index if not exists idx_sources_team_id
  on public.sources(team_id);

create index if not exists idx_article_scores_team_date
  on public.article_scores_log(team_id, fetch_date);

create index if not exists idx_article_scores_source_id
  on public.article_scores_log(source_id);

create index if not exists idx_article_scores_threshold
  on public.article_scores_log(passed_threshold);

create index if not exists idx_newsletter_sends_status
  on public.newsletter_sends(newsletter_id, status);

create index if not exists idx_newsletter_metrics_newsletter_id
  on public.newsletter_metrics(newsletter_id);

create index if not exists idx_pipeline_runs_team
  on public.pipeline_runs(team_id, run_at desc);
