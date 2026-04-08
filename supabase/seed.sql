-- Canonical seed is kept in sync with scripts/seed-remote.mjs
-- Includes only currently validated general RSS sources.

insert into public.sources
  (team_id, url, name, type, status)
values
  (null, 'https://www.espn.com/espn/rss/nfl/news', 'ESPN NFL', 'general', 'approved'),
  (null, 'https://profootballtalk.nbcsports.com/feed/', 'Pro Football Talk', 'general', 'approved'),
  (null, 'https://theathletic.com/rss/nfl', 'The Athletic NFL', 'general', 'approved')
on conflict (url) do update set
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  team_id = excluded.team_id;

delete from public.sources
where url in ('https://www.nfl.com/rss/rsslanding', 'https://apnews.com/apf-sports');
