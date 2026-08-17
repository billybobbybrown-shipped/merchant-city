-- market price marks
-- Applied automatically at server boot, in filename order, exactly once.
-- Must be safe to re-run: use "if not exists" / "on conflict do nothing".

-- The market's continuous price series: one mark per asset per maker tick,
-- whether or not anyone traded. Candles at every timeframe aggregate these,
-- so charts are alive even through quiet stretches. Pruned after 7 days.
create table if not exists price_marks (
  world_id   integer not null,
  asset_type text    not null,   -- 'stock' | 'coin'
  item       text    not null,   -- 's:<eid>' or coin code
  ts         timestamptz not null default now(),
  price      numeric(14,4) not null
);
create index if not exists price_marks_series on price_marks (world_id, asset_type, item, ts);
