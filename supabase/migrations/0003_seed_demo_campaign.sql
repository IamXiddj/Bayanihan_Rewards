-- Bayanihan Rewards — seed the campaign that's already live on Testnet
--
-- This mirrors what already exists on-chain (contract
-- CBI7APGLFKB4YVZAKBGXEM2JENDWAALCYNME4J2RLQBHODWC2NHUG5WK, campaign id 0,
-- created during the deployment smoke test) so the Campaign List page has
-- something real to display before the Create Campaign UI is built.
-- Safe to re-run — every insert is idempotent.
--
-- Note: campaign 0's reward_amount here was later found to be
-- under-scaled by a factor of 10^7 (see 0004_fix_reward_scale.sql, which
-- supersedes it with a corrected campaign 1 rather than editing this
-- already-created migration in place).

insert into public.users (id, wallet_address, full_name, role)
values (
  '00000000-0000-0000-0000-000000000001',
  'GBMNBT3KCFWCGTYQ6MALODMVNZH5FRUM5JMX7IOMBZJY2TI7RVQNZNXH',
  'Platform Administrator',
  'admin'
)
on conflict (wallet_address) do nothing;

insert into public.organizations (id, owner_id, name, type, wallet_address)
values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Barangay 143',
  'lgu',
  'GBMNBT3KCFWCGTYQ6MALODMVNZH5FRUM5JMX7IOMBZJY2TI7RVQNZNXH'
)
on conflict (wallet_address) do nothing;

insert into public.campaigns (
  id, organization_id, title, description,
  reward_amount, reward_asset, max_participants, status, on_chain_id
)
values (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'Barangay Clean-Up Drive',
  'Join the community clean-up and earn BAYANI.',
  50,
  'BAYANI',
  0,
  'active',
  0
)
on conflict (id) do nothing;
