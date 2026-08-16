-- Gun Parts split into three: barrel, firing action, stock. Any old stock
-- becomes barrels (the closest equivalent), and open orders for the retired
-- item are cancelled so nothing sits unfillable on the book.
begin;

update inventories set item = 'gun_barrel' where item = 'gun_parts'
  and not exists (
    select 1 from inventories b
     where b.world_id = inventories.world_id and b.holder_type = inventories.holder_type
       and b.holder_id = inventories.holder_id and b.item = 'gun_barrel');

update inventories i set qty = i.qty + o.qty from inventories o
 where o.world_id = i.world_id and o.holder_type = i.holder_type
   and o.holder_id = i.holder_id and o.item = 'gun_parts' and i.item = 'gun_barrel';
delete from inventories where item = 'gun_parts';

delete from orders where item = 'gun_parts';
delete from crafts where recipe = 'gun_parts';
delete from shelf_listings where item = 'gun_parts';

commit;
