-- 001: accounts, players, world, lots
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  pass_hash text,               -- null when the account is Supabase-managed
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key references users(id) on delete cascade,
  display_name text not null,
  cash numeric(14,2) not null default 10000 check (cash >= 0),
  x real not null default 0,
  y real not null default 0,
  appearance_seed integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists players_display_name_ci
  on players (lower(display_name));

create table if not exists worlds (
  id integer primary key,
  seed bigint not null,
  width integer not null,
  height integer not null,
  tiles_b64 text not null,
  created_at timestamptz not null default now()
);

create table if not exists lots (
  world_id integer not null references worlds(id) on delete cascade,
  id integer not null,
  x integer not null,
  y integer not null,
  w integer not null,
  h integer not null,
  zone text not null check (zone in ('residential','commercial','industrial','mixed','park')),
  owner_type text not null default 'city' check (owner_type in ('city','player','npc')),
  owner_id uuid,
  value numeric(14,2) not null check (value >= 0),
  for_sale boolean not null default false,
  price numeric(14,2) check (price is null or price >= 0),
  primary key (world_id, id)
);
