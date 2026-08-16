-- 007: resource production sites on lots
alter table lots add column if not exists source_type text;
alter table lots add column if not exists source_done_at timestamptz;
