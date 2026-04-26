-- Mark existing community/blog RSS feeds so the pipeline uses content:encoded
-- instead of scraping individual article pages.
update public.sources
set feed_type = 'blog'
where url in (
  'https://seahawksdraftblog.com/feed',
  'https://www.fieldgulls.com/rss/current.xml'
);
