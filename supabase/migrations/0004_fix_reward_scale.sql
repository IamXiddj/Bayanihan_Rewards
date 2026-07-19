-- Bayanihan Rewards — correct the reward-amount decimal scale
--
-- Every Stellar asset (BAYANI included, since it's a classic asset wrapped
-- in a Stellar Asset Contract) uses 7 decimal places at the protocol level.
-- The original seed's reward_amount of 50 was meant as "50 BAYANI" but was
-- never scaled, so on-chain it was actually 50 raw units = 0.000005 BAYANI.
-- That campaign (on_chain_id 0) can't be corrected in place — create_campaign
-- has no update path for reward_amount — so it's marked cancelled here and
-- a fresh, correctly-scaled campaign takes its place as the seeded active
-- one. See lib/soroban.ts for the shared BAYANI_DECIMALS conversion helpers
-- now used everywhere this matters.

update public.campaigns
set status = 'cancelled'
where on_chain_id = 0;

insert into public.campaigns (
  id, organization_id, title, description,
  reward_amount, reward_asset, max_participants, status, on_chain_id
)
values (
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000002',
  'Barangay Clean-Up Drive',
  'Join the community clean-up and earn BAYANI.',
  50,
  'BAYANI',
  0,
  'active',
  1
)
on conflict (id) do nothing;
