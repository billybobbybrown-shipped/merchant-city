-- Character creation: a player's chosen look, stored as the compact code from
-- shared/appearance.ts. Null means they haven't been through creation yet, so
-- the client opens it for them; the old numeric seed stays as the fallback
-- look for anyone (and every NPC) without a saved choice.
alter table players add column if not exists appearance text;
