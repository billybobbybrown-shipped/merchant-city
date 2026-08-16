-- Every container holds its own goods. What used to be one shared pool per
-- property is distributed across that property's racks, in placement order,
-- filling each to its capacity. A property with no racks keeps its pile where
-- it is: its delivery space is its storage.
alter table inventories drop constraint if exists inventories_holder_type_check;
alter table inventories add constraint inventories_holder_type_check
  check (holder_type in ('entity', 'lot', 'shelf', 'dock', 'furn'));

do $$
declare
  l record;
  f record;
  it record;
  room int;
  take int;
begin
  for l in select distinct holder_id from inventories where holder_type = 'lot' loop
    for it in select item, qty from inventories
              where holder_type = 'lot' and holder_id = l.holder_id and qty > 0 loop
      for f in select fu.id,
                      case fu.item when 'rack_s' then 100 when 'rack_m' then 400
                                   when 'rack_l' then 1200 when 'shelf' then 40 else 0 end as cap
               from furniture fu
               where fu.lot_id = l.holder_id::int
                 and fu.item in ('rack_s','rack_m','rack_l')
               order by fu.id loop
        exit when it.qty <= 0;
        select f.cap - coalesce(sum(qty), 0) into room from inventories
          where holder_type = 'furn' and holder_id = f.id::text;
        take := least(it.qty, greatest(room, 0));
        continue when take <= 0;
        insert into inventories (world_id, holder_type, holder_id, item, qty)
        values (1, 'furn', f.id::text, it.item, take)
        on conflict (world_id, holder_type, holder_id, item)
        do update set qty = inventories.qty + take;
        update inventories set qty = qty - take
          where holder_type = 'lot' and holder_id = l.holder_id and item = it.item;
        it.qty := it.qty - take;
      end loop;
    end loop;
  end loop;
  delete from inventories where holder_type = 'lot' and qty <= 0;
end $$;
