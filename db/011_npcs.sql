-- 011: Phase 3 — NPC agents. Each NPC is an entity with a clean account;
-- this table holds the simulation state. Homes are real lots whose owners
-- receive real rent. Vice demand is scaffolded here, inactive until Phase 5.
create table if not exists npcs (
  entity_id bigint primary key references entities(id),
  world_id integer not null,
  home_lot integer,
  x real not null default 0,
  y real not null default 0,
  food numeric(5,2) not null default 1 check (food >= 0),
  goods numeric(5,2) not null default 1 check (goods >= 0),
  vice numeric(4,2) not null default 0,
  wealth_tier text not null default 'worker' check (wealth_tier in ('worker','saver','entrepreneur')),
  employer_lot integer,
  job_role text,
  wage numeric(12,2),
  appearance integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists npcs_home on npcs (world_id, home_lot);
create index if not exists npcs_employer on npcs (world_id, employer_lot);
