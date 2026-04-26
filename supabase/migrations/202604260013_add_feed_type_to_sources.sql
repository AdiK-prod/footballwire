-- Differentiates traditional news feeds (scrape full article page) from
-- blog/community feeds (use content:encoded from RSS directly).
alter table public.sources
  add column if not exists feed_type text not null default 'news'
  check (feed_type in ('news', 'blog'));

comment on column public.sources.feed_type is
  'news = traditional outlet, scrape article page for body text; '
  'blog = independent/community feed, use content:encoded from RSS directly';
