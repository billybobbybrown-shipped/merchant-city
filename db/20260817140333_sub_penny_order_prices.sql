-- Coins trade well under $1, where a whole-cent tick is a 2-5% jump — the
-- numeric(12,2) price columns were snapping every quote to the same two grid
-- lines and pinning candle wicks there. Four decimals matches price_marks.
alter table orders alter column price type numeric(14,4);
alter table trades alter column price type numeric(14,4);
