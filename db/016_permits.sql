-- 016: Phase 4B — production+retail permits (liquor / tobacco / firearms).
-- One permit per entity per category; renewal updates expires_at.

create table if not exists permits (
  id bigserial primary key,
  entity_id bigint not null references entities(id),
  category text not null check (category in ('liquor','tobacco','firearms')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  fee_paid numeric(16,2) not null,
  unique (entity_id, category)
);
