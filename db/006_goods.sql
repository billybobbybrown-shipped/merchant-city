-- 006: goods economy — inventories, crafting, exchange scaffolding
create table if not exists inventories (
  world_id integer not null,
  holder_type text not null check (holder_type in ('player','lot')),
  holder_id text not null,
  item text not null,
  qty integer not null default 0 check (qty >= 0),
  primary key (world_id, holder_type, holder_id, item)
);

create table if not exists crafts (
  id bigserial primary key,
  world_id integer not null,
  lot_id integer not null,
  owner_id uuid not null references players(id),
  recipe text not null,
  count integer not null check (count > 0),
  done_at timestamptz not null
);
create index if not exists crafts_lot on crafts (world_id, lot_id);

-- exchange tables (used by the next increment's order book)
create table if not exists orders (
  id bigserial primary key,
  world_id integer not null,
  owner_id uuid not null references players(id),
  side text not null check (side in ('buy','sell')),
  item text not null,
  qty integer not null check (qty > 0),
  price numeric(12,2) not null check (price > 0),
  created_at timestamptz not null default now()
);
create table if not exists trades (
  id bigserial primary key,
  world_id integer not null,
  item text not null,
  qty integer not null,
  price numeric(12,2) not null,
  buyer_id uuid,
  seller_id uuid,
  ts timestamptz not null default now()
);
create index if not exists trades_item_ts on trades (item, ts);
