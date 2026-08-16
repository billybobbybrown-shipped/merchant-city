-- 005: player-designed building outlines
alter table buildings add column if not exists shape jsonb;
