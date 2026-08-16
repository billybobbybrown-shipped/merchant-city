-- 025: a delivery space can also be a fitting inside a building, not just a
-- pad out on the plot. Either way a plot has exactly one.
alter table docks add column if not exists indoor boolean not null default false;
