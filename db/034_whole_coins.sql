-- Nobody holds a fraction of a coin. Round every balance down to whole coins
-- and take the dust off the mined total, so circulating supply still equals
-- what the wallets actually hold.
do $$
declare dust numeric;
begin
  select coalesce(sum(balance - floor(balance)), 0) into dust
    from accounts where currency = 'coin';
  update accounts set balance = floor(balance) where currency = 'coin';
  update coin_network set mined = greatest(0, mined - dust) where world_id = 1;
end $$;
