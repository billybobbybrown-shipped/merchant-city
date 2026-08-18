-- The city starts FUNDED: a genesis endowment so the unemployment floor is
-- real recirculated money from day one instead of minted inflation, and the
-- dealer desk has working capital from the first tick.
insert into accounts (entity_id, currency, balance)
  values (1, 'clean', 0) on conflict (entity_id, currency) do nothing;
do $$
begin
  if not exists (select 1 from ledger where reason = 'city endowment') then
    update accounts set balance = balance + 5000000 where entity_id = 1 and currency = 'clean';
    insert into ledger (amount, reason, category, currency, from_account, to_account)
    values (5000000, 'city endowment', 'transfer', 'clean', null,
            (select id from accounts where entity_id = 1 and currency = 'clean'));
  end if;
end $$;
