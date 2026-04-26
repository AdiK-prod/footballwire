-- Allow one email to subscribe to multiple teams.
-- Drops the old single-email unique constraint and replaces it with a
-- composite unique on (email, team_id).

alter table public.subscribers
  drop constraint if exists subscribers_email_key;

alter table public.subscribers
  add constraint subscribers_email_team_id_key unique (email, team_id);
