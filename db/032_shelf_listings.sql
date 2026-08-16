-- A shop shelf is its own unit: it lists one item at one price and holds its
-- own stock. What used to be a per-building price list becomes a listing bound
-- to a specific shelf fixture, and the shop's pooled shelf stock is split onto
-- the shelves that now list each item.
create table if not exists shelf_listings (
  world_id integer not null references worlds(id) on delete cascade,
  furn_id  bigint  not null,
  lot_id   integer not null,
  item     text    not null,
  price    numeric(12,2) not null check (price > 0),
  primary key (world_id, furn_id)
);

do $$
declare
  p record;
  target bigint;
begin
  for p in select sp.*, row_number() over (partition by sp.lot_id order by sp.item) as rn
             from shelf_prices sp loop
    -- the nth priced item goes on the nth shelf in that shop
    select id into target from furniture
      where lot_id = p.lot_id and item = 'shelf'
      order by id offset (p.rn - 1) limit 1;
    continue when target is null;

    insert into shelf_listings (world_id, furn_id, lot_id, item, price)
    values (p.world_id, target, p.lot_id, p.item, p.price)
    on conflict do nothing;

    -- move that item's pooled stock onto the shelf that now lists it
    insert into inventories (world_id, holder_type, holder_id, item, qty)
    select i.world_id, 'shelf', target::text, i.item, i.qty
      from inventories i
     where i.world_id = p.world_id and i.holder_type = 'shelf'
       and i.holder_id = p.lot_id::text and i.item = p.item and i.qty > 0
    on conflict (world_id, holder_type, holder_id, item)
    do update set qty = inventories.qty + excluded.qty;

    delete from inventories
     where world_id = p.world_id and holder_type = 'shelf'
       and holder_id = p.lot_id::text and item = p.item;
  end loop;
end $$;

drop table if exists shelf_prices;
