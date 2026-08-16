-- 021: the farmer role — hired hands who work production sites.
alter table job_listings drop constraint if exists job_listings_role_check;
alter table job_listings add constraint job_listings_role_check
  check (role in ('cashier','stocker','crafter','extractor','farmer'));
