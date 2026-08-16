-- 008: production sites get drawn layouts
alter table lots add column if not exists source_area integer;
alter table lots add column if not exists source_shape jsonb;
