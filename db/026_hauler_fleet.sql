-- Haulers drive between properties, so they are no longer posted to one
-- address: their carrying capacity is pooled across every bay their employer
-- runs. Release any hauler currently pinned to a lot.
update npcs set employer_lot = null where job_role = 'hauler' and employer_lot is not null;
