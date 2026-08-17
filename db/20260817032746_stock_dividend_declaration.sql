-- Dividends become a declared policy instead of a daily lottery: each listed
-- company carries its declared per-share rate, when it last paid, and how many
-- game days of the pay period have elapsed.
alter table stocks add column if not exists dps numeric(12,4) not null default 0;
alter table stocks add column if not exists last_pay timestamptz;
alter table stocks add column if not exists pay_day_counter integer not null default 0;
