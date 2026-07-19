-- Bayanihan Rewards — leaderboard + platform analytics views
--
-- Aggregation lives here rather than in application code so it's one
-- verified source of truth, and so the frontend can just select from a
-- view instead of depending on PostgREST's aggregate-function query syntax
-- (which varies enough across versions that it's not worth guessing at
-- given everything else this session already got wrong on a first guess).
-- Both views expose only already-public data — wallet addresses and
-- amounts are visible the same way they'd be on any block explorer.

create or replace view public.leaderboard as
select
  u.id as user_id,
  u.wallet_address,
  u.full_name,
  count(r.id) as rewards_claimed,
  coalesce(sum(r.amount), 0) as total_bayani
from public.users u
join public.rewards r on r.user_id = u.id and r.claimed = true
group by u.id, u.wallet_address, u.full_name
order by total_bayani desc;

create or replace view public.platform_stats as
select
  (select count(*) from public.campaigns) as total_campaigns,
  (select count(*) from public.campaigns where status = 'active') as active_campaigns,
  (select count(distinct user_id) from public.participations) as total_participants,
  (select count(*) from public.rewards) as rewards_issued,
  (select coalesce(sum(amount), 0) from public.rewards) as bayani_issued,
  (select count(*) from public.rewards where claimed = true) as rewards_claimed,
  (select coalesce(sum(amount), 0) from public.rewards where claimed = true) as bayani_claimed,
  (select count(*) from public.organizations) as total_organizations;

-- New relations don't automatically inherit the anon/authenticated grants
-- that Supabase's project bootstrap sets up for tables created through its
-- own tooling — grant explicitly rather than assume.
grant select on public.leaderboard to anon, authenticated;
grant select on public.platform_stats to anon, authenticated;
