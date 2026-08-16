-- Furniture belongs to a storey. Everything placed so far is on the ground.
alter table furniture add column if not exists floor integer not null default 0;
