-- Bayanihan Rewards — link campaigns to their on-chain id
--
-- campaigns.id is this row's own UUID primary key; the Soroban contract's
-- create_campaign returns a separate u64, incrementing from 0, which is
-- what every other contract call (join_campaign, verify_participant, etc.)
-- actually needs. Nothing in 0001_init.sql captured that value.

alter table public.campaigns
  add column on_chain_id bigint unique;

comment on column public.campaigns.on_chain_id is
  'The u64 campaign id returned by the Soroban contract''s create_campaign — distinct from the UUID primary key above.';

create index idx_campaigns_on_chain_id on public.campaigns(on_chain_id);
