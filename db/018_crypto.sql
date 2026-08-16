-- 018: Phase 4D — coin mining. Components live in typed rack slots; wear is
-- per-component. Coin balances already exist (accounts.currency = 'coin').

create table if not exists rack_components (
  id bigserial primary key,
  furniture_id bigint not null references furniture(id) on delete cascade,
  slot integer not null,
  item text not null,
  wear numeric(4,3) not null default 0 check (wear >= 0),
  unique (furniture_id, slot)
);
create index if not exists rack_components_furniture on rack_components (furniture_id);
