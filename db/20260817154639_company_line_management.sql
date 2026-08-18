-- Per-line management state for NPC companies: is the line running, how many
-- review periods it has lost money, when it was last reviewed. Shelf price
-- itself lives in shelf_listings — the manager adjusts it there.
create table if not exists company_lines (
  world_id integer not null,
  company_entity bigint not null,
  product text not null,
  status text not null default 'active',
  loss_reviews integer not null default 0,
  last_review timestamptz not null default now(),
  primary key (world_id, company_entity, product)
);
