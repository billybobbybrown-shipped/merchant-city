-- An owner can name their property. Null means unnamed, in which case it is
-- referred to by its lot number.
alter table lots add column if not exists name text;
