-- 010: Phase R — districts as first-class rows with stat scaffolding.
-- Names/blocks come from the deterministic generator; the stat columns are
-- populated by later phases (3: traffic/wealth, 5: heat/crime, 6: control).
create table if not exists districts (
  world_id integer not null references worlds(id) on delete cascade,
  id integer not null,
  name text not null,
  block_ids integer[] not null,
  foot_traffic numeric(14,2) not null default 0,
  wealth numeric(14,2) not null default 0,
  heat numeric(14,2) not null default 0,
  controlling_family_id bigint references entities(id),
  ambient_crime_level numeric(6,2) not null default 0,
  primary key (world_id, id)
);
