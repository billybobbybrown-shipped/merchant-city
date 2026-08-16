-- A building's sign is optional. Existing buildings keep theirs.
alter table lots add column if not exists sign boolean not null default true;
