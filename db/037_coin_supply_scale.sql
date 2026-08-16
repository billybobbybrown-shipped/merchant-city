-- Real coins run to millions of units, not thousands. Each coin's total supply
-- is raised and everything about it is scaled by the same factor, so this is a
-- redenomination and not a windfall: a holder ends up with proportionally more
-- coins, each worth proportionally less, and the same value as before.
--   Ducat     500,000 -> 20,000,000   (x40)
--   Obol      120,000 -> 50,000,000   (x416.667)
--   Tiderium  2,000,000 -> 100,000,000 (x50)
do $$
declare
  c record;
  f numeric;
begin
  for c in select * from coins loop
    f := case c.code when 'duc' then 20000000.0 / 500000
                     when 'obl' then 50000000.0 / 120000
                     when 'tid' then 100000000.0 / 2000000
                     else 1 end;
    if f = 1 then continue; end if;

    -- open sell orders hold escrowed coin: hand it back before rescaling, and
    -- clear the books so quotes re-form at the new scale (buys escrow nothing)
    update accounts a set balance = a.balance + o.qty
      from orders o
     where o.asset_type = 'coin' and o.item = c.code and o.side = 'sell'
       and a.entity_id = o.owner_entity and a.currency = c.code;
    delete from orders where asset_type = 'coin' and item = c.code;

    -- holders keep their share
    update accounts set balance = round(balance * f) where currency = c.code;

    -- the tape is split-adjusted so the chart stays continuous
    update trades set price = round(price / f, 4) where asset_type = 'coin' and item = c.code;

    update coins
       set max_supply  = case c.code when 'duc' then 20000000 when 'obl' then 50000000 else 100000000 end,
           genesis     = round(c.genesis * f),
           base_reward = round(c.base_reward * f),
           mined       = coalesce((select sum(balance) from accounts where currency = c.code), 0)
     where code = c.code;
  end loop;
end $$;
