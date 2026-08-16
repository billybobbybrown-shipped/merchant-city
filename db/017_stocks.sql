-- 017: Phase 4C — one order book for every asset class + the stock market.
-- orders/trades gain an asset_type; the asset key reuses the item column
-- (items: item id, stocks: 's:<company entity id>', coin: 'coin').

alter table orders add column if not exists asset_type text not null default 'item'
  check (asset_type in ('item','stock','coin'));
alter table trades add column if not exists asset_type text not null default 'item'
  check (asset_type in ('item','stock','coin'));
create index if not exists orders_asset on orders (world_id, asset_type, item);
create index if not exists trades_asset_ts on trades (world_id, asset_type, item, ts);

-- listed companies
create table if not exists stocks (
  company_entity bigint primary key references entities(id),
  shares_outstanding bigint not null check (shares_outstanding > 0),
  float_shares bigint not null check (float_shares > 0),
  ipo_price numeric(16,2) not null,
  listed_at timestamptz not null default now(),
  dividend_ratio numeric(4,3) not null default 0 check (dividend_ratio >= 0 and dividend_ratio <= 1),
  halted_until timestamptz,
  prev_close numeric(16,2)
);

-- the share registry (shares are not inventory items)
create table if not exists share_holdings (
  holder_entity bigint not null references entities(id),
  company_entity bigint not null references stocks(company_entity),
  shares bigint not null check (shares >= 0),
  primary key (holder_entity, company_entity)
);
create index if not exists share_holdings_company on share_holdings (company_entity);

-- NPC-operated public companies (seeded market depth)
alter table companies add column if not exists npc_operated boolean not null default false;
