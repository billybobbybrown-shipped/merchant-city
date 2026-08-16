-- A second reset, now that a new coin opens at what it is worth rather than at
-- an arbitrary figure: cash every holder out at the last traded price, clear the
-- books and the tape, and let each coin open again at its own fair value.
-- again at the new supply. Holders are paid in clean cash for what they held,
-- the books and the tape are cleared, and each coin's circulation is set back
-- to zero so genesis is distributed fresh at the new scale on boot.
do $$
declare
  c record;
  px numeric;
  paid numeric;
begin
  for c in select * from coins loop
    select price into px from trades
      where asset_type = 'coin' and item = c.code order by ts desc limit 1;
    if px is null then px := 0; end if;

    -- pay out every holder, recorded in the ledger like any other money
    if px > 0 then
      -- ledger rows point at account ids, not entity ids
      insert into ledger (to_account, amount, reason, category, currency)
      select ca.id, round(a.balance * px, 2), 'coin buyout at ' || px, 'transfer', 'clean'
        from accounts a
        join accounts ca on ca.entity_id = a.entity_id and ca.currency = 'clean'
       where a.currency = c.code and a.balance > 0 and round(a.balance * px, 2) > 0;

      update accounts t set balance = t.balance + s.payout
        from (select entity_id, round(balance * px, 2) as payout
                from accounts where currency = c.code and balance > 0) s
       where t.entity_id = s.entity_id and t.currency = 'clean';

      select coalesce(sum(round(balance * px, 2)), 0) into paid
        from accounts where currency = c.code and balance > 0;
      raise notice 'bought out % holders of % for %',
        (select count(*) from accounts where currency = c.code and balance > 0), c.code, paid;
    end if;

    -- clear the coin itself: no balances, no book, no tape. The accounts stay
    -- (ledger history points at them) but are emptied.
    update accounts set balance = 0 where currency = c.code;
    delete from orders where asset_type = 'coin' and item = c.code;
    delete from trades where asset_type = 'coin' and item = c.code;
    update coins set mined = 0 where code = c.code;
  end loop;
end $$;
