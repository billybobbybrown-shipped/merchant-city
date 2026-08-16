-- 023: logistics — a delivery space (loading bay) on a plot you own.
-- Goods enter and leave the world through it: haulers carry between the
-- delivery spaces of different properties, managers move goods between a
-- delivery space and the building's storage racks beside it.

-- two new jobs: the hauler drives between properties, the manager works the
-- floor between the bay and the racks
alter table hire_offers drop constraint if exists hire_offers_assign_role_check;
alter table hire_offers add constraint hire_offers_assign_role_check
  check (assign_role in ('cashier','stocker','crafter','extractor','farmer','hauler','manager'));

-- the bay itself holds goods, so it gets its own inventory holder
alter table inventories drop constraint if exists inventories_holder_type_check;
alter table inventories add constraint inventories_holder_type_check
  check (holder_type in ('entity','lot','shelf','dock'));

-- one delivery space per plot
create table if not exists docks (
  lot_id integer primary key,
  world_id integer not null,
  built_at timestamptz not null default now()
);

-- what ships in and out of a bay, and how much per game day
create table if not exists dock_lines (
  id bigserial primary key,
  world_id integer not null,
  lot_id integer not null references docks(lot_id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  item text not null,
  per_day integer not null check (per_day > 0),
  partner_lot integer not null,
  created_at timestamptz not null default now()
);
create index if not exists dock_lines_lot on dock_lines (world_id, lot_id);
