-- Companies can put up buildings too (Crown Petroleum builds its own gas
-- station). Ownership is tracked on the lot; the player link is optional.
alter table buildings alter column owner_id drop not null;
