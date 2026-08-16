-- 003: building interiors — placed furniture/equipment
create table if not exists furniture (
  id bigserial primary key,
  world_id integer not null,
  lot_id integer not null,
  item text not null,
  x integer not null,
  y integer not null,
  rot integer not null default 0 check (rot between 0 and 3),
  placed_at timestamptz not null default now(),
  foreign key (world_id, lot_id) references lots(world_id, id) on delete cascade
);
create index if not exists furniture_lot on furniture (world_id, lot_id);
