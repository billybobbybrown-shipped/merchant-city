-- Haulage runs on the minute, not once a game day. A day is ten minutes of
-- real time, so a rate that used to be "per day" becomes a tenth of that per
-- minute, keeping every existing route moving the same goods over the same
-- stretch of time.
alter table dock_lines rename column per_day to per_min;
update dock_lines set per_min = greatest(1, round(per_min / 10.0));
