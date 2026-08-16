-- 019: Phase 4E — precomputed economic statistics. One row set per game day
-- (bucket = floor(epoch / DAY_LENGTH_SEC)); dashboards read these instead of
-- heavy live aggregation. Everything derives from trades/ledger/inventories.

create table if not exists stat_macro (
  world_id integer not null,
  bucket bigint not null,
  gdp numeric(16,2) not null default 0,
  gdp_sectors jsonb not null default '{}',
  cpi numeric(8,1) not null default 100,
  employed integer not null default 0,
  labor_force integer not null default 0,
  avg_wage numeric(10,2),
  open_jobs integer not null default 0,
  population integer not null default 0,
  housing_occupancy numeric(5,3),
  avg_rent numeric(10,2),
  coin_supply numeric(16,4) not null default 0,
  coin_emission numeric(12,4) not null default 0,
  world_hash numeric(14,2) not null default 0,
  primary key (world_id, bucket)
);

create table if not exists stat_asset (
  world_id integer not null,
  bucket bigint not null,
  asset_type text not null,
  asset text not null,
  last numeric(16,2),
  vwap numeric(16,2),
  vol numeric(16,2) not null default 0,
  high numeric(16,2),
  low numeric(16,2),
  best_bid numeric(16,2),
  best_ask numeric(16,2),
  bid_depth numeric(16,2) not null default 0,
  ask_depth numeric(16,2) not null default 0,
  market_cap numeric(18,2),
  primary key (world_id, bucket, asset_type, asset)
);

create table if not exists stat_commodity (
  world_id integer not null,
  bucket bigint not null,
  item text not null,
  produced numeric(14,2) not null default 0,
  consumed numeric(14,2) not null default 0,
  primary key (world_id, bucket, item)
);

create table if not exists stat_index (
  world_id integer not null,
  bucket bigint not null,
  name text not null,
  value numeric(14,2),
  primary key (world_id, bucket, name)
);

-- index divisors and other stat constants, set once at inception
create table if not exists stat_meta (
  world_id integer not null,
  key text not null,
  value numeric,
  primary key (world_id, key)
);
