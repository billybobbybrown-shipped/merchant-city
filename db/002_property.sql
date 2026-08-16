-- 002: player-built buildings + money ledger
create table if not exists buildings (
  world_id integer not null references worlds(id) on delete cascade,
  lot_id integer not null,
  owner_id uuid not null references players(id),
  template text not null,
  kind text not null,
  floors integer not null,
  seed integer not null,
  name text not null,
  built_at timestamptz not null default now(),
  done_at timestamptz not null,
  condition real not null default 100,
  primary key (world_id, lot_id),
  foreign key (world_id, lot_id) references lots(world_id, id) on delete cascade
);

-- every money movement in the game economy; from/to null = the City (sink/faucet)
create table if not exists ledger (
  id bigserial primary key,
  ts timestamptz not null default now(),
  from_id uuid,
  to_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null
);
