-- "Extractor" was never a word anyone uses for the job. They are miners.
alter table npcs drop constraint if exists npcs_job_role_check;
update npcs set job_role = 'miner' where job_role = 'extractor';
update hire_offers set assign_role = 'miner' where assign_role = 'extractor';

-- A quarry or a mine works a deposit that runs out. Track what has been taken
-- out of the ground; the reserve itself is derived from the site's size.
alter table lots add column if not exists source_extracted numeric not null default 0;
