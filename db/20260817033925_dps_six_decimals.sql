-- Sub-penny per-share rates (wide floats, low-yield names) lose up to 5% of
-- their value to 4-decimal quantization — Nordvik's 1% target displayed as
-- 0.94%. Six decimals keeps every declared yield on target; holder payments
-- still round to cents.
alter table stocks alter column dps type numeric(14,6);
