-- 013: Phase 3C — job listings + employment. One job per NPC (listing_id on
-- the npc row); slots per listing; wages paid daily employer → NPC.
create table if not exists job_listings (
  id bigserial primary key,
  world_id integer not null,
  lot_id integer not null,
  employer_entity bigint not null references entities(id),
  role text not null check (role in ('cashier','stocker','crafter','extractor','manager')),
  wage numeric(12,2) not null check (wage > 0),
  slots integer not null default 1 check (slots between 1 and 20),
  created_at timestamptz not null default now()
);
create index if not exists job_listings_lot on job_listings (world_id, lot_id);

alter table npcs add column if not exists listing_id bigint references job_listings(id) on delete set null;
