-- 020: coin supply ledger — total mined toward the hard cap. One row per
-- world; emission halvings key off this number, not the clock.
create table if not exists coin_network (
  world_id integer primary key,
  mined numeric(16,4) not null default 0
);
insert into coin_network (world_id, mined) values (1, 0) on conflict do nothing;
