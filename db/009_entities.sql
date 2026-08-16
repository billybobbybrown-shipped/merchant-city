-- 009: Phase R — generic entities + multi-currency accounts.
-- Everything that owns or pays becomes an entity; every balance lives in an
-- account row (clean | dirty | coin). Players map 1:1 to entities; the city
-- treasury is entity 1. Entities can own entities (shells arrive in Phase 5,
-- the substrate lands now).

create table if not exists entities (
  id bigserial primary key,
  kind text not null check (kind in ('player','npc','company','family','city')),
  name text not null,
  parent_entity_id bigint references entities(id),
  created_at timestamptz not null default now()
);

insert into entities (id, kind, name)
  values (1, 'city', 'City Treasury')
  on conflict (id) do nothing;
select setval('entities_id_seq', greatest((select max(id) from entities), 1));

-- share-style ownership splits (unused until companies/shells)
create table if not exists entity_ownership (
  owner_entity_id bigint not null references entities(id),
  owned_entity_id bigint not null references entities(id),
  share numeric(7,4) not null default 1 check (share > 0 and share <= 1),
  primary key (owner_entity_id, owned_entity_id)
);

alter table players add column if not exists entity_id bigint references entities(id);

do $$
declare p record;
begin
  for p in select id, display_name from players where entity_id is null loop
    insert into entities (kind, name) values ('player', p.display_name);
    update players set entity_id = currval('entities_id_seq') where id = p.id;
  end loop;
end $$;

create table if not exists accounts (
  id bigserial primary key,
  entity_id bigint not null references entities(id),
  currency text not null check (currency in ('clean','dirty','coin')),
  balance numeric(16,2) not null default 0 check (balance >= 0),
  unique (entity_id, currency)
);

insert into accounts (entity_id, currency, balance)
  select entity_id, 'clean', cash from players where entity_id is not null
  on conflict (entity_id, currency) do nothing;
insert into accounts (entity_id, currency, balance)
  values (1, 'clean', 0)
  on conflict (entity_id, currency) do nothing;

-- ledger: machine-readable category + account references for new rows
-- (legacy rows keep from_id/to_id uuids and null category)
alter table ledger add column if not exists category text;
alter table ledger add column if not exists currency text not null default 'clean';
alter table ledger add column if not exists from_account bigint references accounts(id);
alter table ledger add column if not exists to_account bigint references accounts(id);
create index if not exists ledger_category_ts on ledger (category, ts);

-- lots owned/rented by entities
alter table lots add column if not exists owner_entity_id bigint references entities(id);
update lots set owner_entity_id = 1 where owner_entity_id is null and owner_type = 'city';
update lots l set owner_entity_id = p.entity_id
  from players p
  where l.owner_entity_id is null and l.owner_type = 'player' and l.owner_id = p.id;
alter table lots add column if not exists tenant_entity_id bigint references entities(id);
update lots l set tenant_entity_id = p.entity_id
  from players p
  where l.tenant_entity_id is null and l.tenant_id = p.id;

-- inventories: player holders become entity holders (migrate rows first,
-- then tighten the check)
alter table inventories drop constraint if exists inventories_holder_type_check;
update inventories i set holder_type = 'entity', holder_id = p.entity_id::text
  from players p
  where i.holder_type = 'player' and i.holder_id = p.id::text;
alter table inventories add constraint inventories_holder_type_check
  check (holder_type in ('entity','lot'));

-- open orders + trade history move to entity ids
alter table orders add column if not exists owner_entity bigint references entities(id);
update orders o set owner_entity = p.entity_id
  from players p where o.owner_entity is null and o.owner_id = p.id;
alter table orders alter column owner_id drop not null;

alter table trades add column if not exists buyer_entity bigint;
alter table trades add column if not exists seller_entity bigint;
update trades t set buyer_entity = p.entity_id from players p
  where t.buyer_entity is null and t.buyer_id = p.id;
update trades t set seller_entity = p.entity_id from players p
  where t.seller_entity is null and t.seller_id = p.id;

alter table trades alter column buyer_id drop not null;
alter table trades alter column seller_id drop not null;
alter table crafts alter column owner_id drop not null;
