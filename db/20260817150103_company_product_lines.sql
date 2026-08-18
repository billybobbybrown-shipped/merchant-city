-- NPC companies can CHOOSE to run extra product lines (whiskey beside beer,
-- cigars beside cigarettes, memory beside phones). The choices a company has
-- made live here — an array of product ids from its seed's expansion catalog.
alter table companies add column if not exists extra_lines text[] not null default '{}';
