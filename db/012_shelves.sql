-- 012: Phase 3B — retail shelves. Shelf stock is its own inventory holder
-- (stocked from building storage); prices are set per lot per item by the
-- owner. NPCs buy off shelves at these prices.
alter table inventories drop constraint if exists inventories_holder_type_check;
alter table inventories add constraint inventories_holder_type_check
  check (holder_type in ('entity','lot','shelf'));

create table if not exists shelf_prices (
  world_id integer not null,
  lot_id integer not null,
  item text not null,
  price numeric(12,2) not null check (price > 0),
  primary key (world_id, lot_id, item)
);
