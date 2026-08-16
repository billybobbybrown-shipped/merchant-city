-- More than one coin. A coin's code is its currency code and its market key,
-- so a balance, an order and a trade all name the same thing. Ducat keeps its
-- balances and its history — only its code changes from the generic 'coin'.
create table if not exists coins (
  code        text primary key,
  name        text not null,
  symbol      text not null,
  max_supply  numeric(16,4) not null,
  genesis     numeric(16,4) not null,
  base_reward numeric(16,4) not null,
  mined       numeric(16,4) not null default 0,
  born        timestamptz not null default now()
);

insert into coins (code, name, symbol, max_supply, genesis, base_reward, mined)
values
  ('duc', 'Ducat',  '◈', 500000, 50000, 40, coalesce((select mined from coin_network where world_id = 1), 0)),
  ('obl', 'Obol',   '◎', 120000, 12000, 12, 0),
  ('tid', 'Tiderium','⬡', 2000000, 250000, 220, 0)
on conflict (code) do nothing;

-- balances, orders and history move from the generic code to Ducat's
-- move the balances first: the old constraint still allows 'coin', the new one
-- will not
alter table accounts drop constraint if exists accounts_currency_check;
update accounts set currency = 'duc' where currency = 'coin';
-- a CHECK cannot query the coins table, so the codes are listed; adding a coin
-- means extending this list alongside the insert above
alter table accounts add constraint accounts_currency_check
  check (currency in ('clean', 'dirty', 'duc', 'obl', 'tid'));
update ledger set currency = 'duc' where currency = 'coin';
update orders set item = 'duc' where asset_type = 'coin' and item = 'coin';
update trades set item = 'duc' where asset_type = 'coin' and item = 'coin';

-- a mining rack works one coin
alter table furniture add column if not exists coin text not null default 'duc';

drop table if exists coin_network;
