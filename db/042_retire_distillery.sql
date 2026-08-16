-- The distillery is gone; the brewery does both jobs now. Placed distilleries
-- become breweries in place (same 2x2 footprint), and any stock, orders or
-- queued builds of the retired machine convert or clear.
begin;

update furniture set item = 'brewery' where item = 'distillery';
delete from crafts where recipe = 'distillery';
delete from orders where item = 'distillery';
delete from shelf_listings where item = 'distillery';

update inventories set item = 'brewery' where item = 'distillery'
  and not exists (
    select 1 from inventories b
     where b.world_id = inventories.world_id and b.holder_type = inventories.holder_type
       and b.holder_id = inventories.holder_id and b.item = 'brewery');
update inventories i set qty = i.qty + o.qty from inventories o
 where o.world_id = i.world_id and o.holder_type = i.holder_type
   and o.holder_id = i.holder_id and o.item = 'distillery' and i.item = 'brewery';
delete from inventories where item = 'distillery';

commit;
