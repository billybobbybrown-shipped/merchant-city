-- Goods left over from the shared pool on properties with no racks: their
-- delivery space is their storage, so that is where the pile belongs. Anything
-- on a property with neither racks nor a bay has nowhere to live and is left
-- in place for its owner to deal with.
insert into inventories (world_id, holder_type, holder_id, item, qty)
select i.world_id, 'dock', i.holder_id, i.item, i.qty
  from inventories i
 where i.holder_type = 'lot'
   and i.qty > 0
   and exists (select 1 from docks d where d.lot_id = i.holder_id::int)
on conflict (world_id, holder_type, holder_id, item)
do update set qty = inventories.qty + excluded.qty;

delete from inventories i
 where i.holder_type = 'lot'
   and exists (select 1 from docks d where d.lot_id = i.holder_id::int);
