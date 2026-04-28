-- Add youtube_url column to articles for blog-source video items.
-- Update category CHECK to allow video_link as a valid category value.

alter table public.articles
  add column if not exists youtube_url text;

-- Drop and recreate the category CHECK to include video_link.
alter table public.articles
  drop constraint if exists articles_category_check;

alter table public.articles
  add constraint articles_category_check
  check (category in ('transaction', 'injury', 'game_analysis', 'rumor', 'general', 'video_link'));
