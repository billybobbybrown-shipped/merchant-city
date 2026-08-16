-- 015: Phase 4A — registered companies. The entity/ownership/account
-- substrate landed in 009; this adds the public registry.

create table if not exists companies (
  entity_id bigint primary key references entities(id),
  founder_entity bigint not null references entities(id),
  registered_name text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists entity_ownership_owned on entity_ownership (owned_entity_id);
