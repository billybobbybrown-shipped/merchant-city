-- 004: tenancy, demolition, daily economy
alter table lots add column if not exists for_rent boolean not null default false;
alter table lots add column if not exists rent numeric(14,2) check (rent is null or rent >= 0);
alter table lots add column if not exists tenant_id uuid references players(id);
alter table lots add column if not exists missed_payments integer not null default 0;
-- cleared = a pre-existing city building was demolished; the lot is buildable
alter table lots add column if not exists cleared boolean not null default false;
