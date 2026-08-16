-- 014: Phase 3D — managers removed (stock upkeep gets a different mechanic
-- later); entrepreneur NPC business state.
delete from job_listings where role = 'manager';
alter table job_listings drop constraint if exists job_listings_role_check;
alter table job_listings add constraint job_listings_role_check
  check (role in ('cashier','stocker','crafter','extractor'));

alter table npcs add column if not exists biz_lot integer;
alter table npcs add column if not exists biz_stage text;
