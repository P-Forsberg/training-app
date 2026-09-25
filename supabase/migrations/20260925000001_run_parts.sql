-- Structured runs: warm-up, main set and cool-down are stored separately so
-- statistics can tell quality kilometres from easy ones.
alter table public.logged_runs
  add column warmup_km numeric check (warmup_km >= 0),
  add column main_km numeric check (main_km >= 0),
  add column cooldown_km numeric check (cooldown_km >= 0),
  -- Interval numbers (1..N) the user has ticked off.
  add column intervals_done int[] not null default '{}',
  -- True once the user typed the total by hand; the total then stops following the parts.
  add column distance_manual boolean not null default false;
