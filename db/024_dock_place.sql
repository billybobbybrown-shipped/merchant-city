-- 024: a delivery space occupies a real 2x2 pad on the plot
alter table docks add column if not exists cell_x integer not null default 0;
alter table docks add column if not exists cell_y integer not null default 0;
