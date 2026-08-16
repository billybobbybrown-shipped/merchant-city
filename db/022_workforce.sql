-- 022: workforce rework. Hiring is generic: you post a hire offer, a citizen
-- takes it, and the worker can then be assigned to any (lot, role) you
-- operate — and reassigned freely. Employment lives on the worker.

create table if not exists hire_offers (
  id bigserial primary key,
  world_id integer not null,
  employer_entity bigint not null references entities(id),
  wage numeric(12,2) not null,
  slots integer not null check (slots > 0),
  assign_lot integer,
  assign_role text check (assign_role in ('cashier','stocker','crafter','extractor','farmer')),
  created_at timestamptz not null default now()
);

alter table npcs add column if not exists employer_entity bigint references entities(id);

-- filled jobs become direct employment
update npcs n set employer_entity = jl.employer_entity
  from job_listings jl where n.listing_id = jl.id and n.employer_entity is null;

-- unfilled listing capacity becomes offers preset to that lot/role
insert into hire_offers (world_id, employer_entity, wage, slots, assign_lot, assign_role)
select jl.world_id, jl.employer_entity, jl.wage, jl.slots - coalesce(f.n, 0), jl.lot_id, jl.role
  from job_listings jl
  left join lateral (select count(*) as n from npcs where listing_id = jl.id) f on true
 where jl.slots - coalesce(f.n, 0) > 0;

alter table npcs drop column if exists listing_id;
drop table if exists job_listings;
