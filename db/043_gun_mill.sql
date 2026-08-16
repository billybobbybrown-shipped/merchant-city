-- The gunsmith bench is a machine now: the Gun Mill. Same 2x1 footprint, so
-- placed benches convert in place and keep their spot.
begin;
update furniture set item = 'gun_mill' where item = 'gunsmith_bench';
update crafts set recipe = 'gun_mill' where recipe = 'gunsmith_bench';
update orders set item = 'gun_mill' where item = 'gunsmith_bench';
update shelf_listings set item = 'gun_mill' where item = 'gunsmith_bench';

update inventories set item = 'gun_mill' where item = 'gunsmith_bench'
  and not exists (
    select 1 from inventories b
     where b.world_id = inventories.world_id and b.holder_type = inventories.holder_type
       and b.holder_id = inventories.holder_id and b.item = 'gun_mill');
update inventories i set qty = i.qty + o.qty from inventories o
 where o.world_id = i.world_id and o.holder_type = i.holder_type
   and o.holder_id = i.holder_id and o.item = 'gunsmith_bench' and i.item = 'gun_mill';
delete from inventories where item = 'gunsmith_bench';
commit;
