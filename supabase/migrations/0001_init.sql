-- Bayanihan Rewards — initial schema
-- Run via the Supabase CLI: supabase db push
-- or paste directly into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  full_name text,
  role text not null default 'citizen'
    check (role in ('citizen', 'organizer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Every wallet that has connected to the platform. id matches auth.uid() once a wallet has completed the Freighter sign-in flow.';

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.users(id) on delete set null,
  name text not null,
  type text not null
    check (type in ('lgu', 'school', 'ngo', 'private')),
  wallet_address text not null unique,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  banner_url text,
  reward_amount integer not null check (reward_amount > 0),
  reward_asset text not null default 'BAYANI',
  max_participants integer check (max_participants is null or max_participants >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'closed', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.participations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  proof_url text,
  verified boolean not null default false,
  verified_by uuid references public.users(id),
  verified_at timestamptz,
  rewarded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  asset_code text not null default 'BAYANI',
  claimed boolean not null default false,
  claimed_at timestamptz,
  stellar_tx_hash text,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  stellar_tx_hash text not null unique,
  transaction_type text not null
    check (transaction_type in ('issue_reward', 'claim_reward', 'trustline', 'other')),
  amount integer,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------

create index idx_organizations_owner on public.organizations(owner_id);
create index idx_campaigns_organization on public.campaigns(organization_id);
create index idx_campaigns_status on public.campaigns(status);
create index idx_participations_campaign on public.participations(campaign_id);
create index idx_participations_user on public.participations(user_id);
create index idx_participations_unverified
  on public.participations(campaign_id) where verified = false;
create index idx_rewards_campaign on public.rewards(campaign_id);
create index idx_rewards_user on public.rewards(user_id);
create index idx_rewards_unclaimed
  on public.rewards(user_id) where claimed = false;
create index idx_transactions_wallet on public.transactions(wallet_address);

-- ---------------------------------------------------------------------
-- Triggers: keep updated_at current
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger trg_campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Trigger: defense-in-depth guard mirroring the contract's own rule that
-- a participation can't be rewarded before it's verified. The contract is
-- the source of truth on-chain; this just stops bad off-chain writes from
-- ever getting out of sync with it.
-- ---------------------------------------------------------------------

create or replace function public.enforce_verified_before_reward()
returns trigger
language plpgsql
as $$
begin
  if new.rewarded = true and new.verified = false then
    raise exception 'Cannot mark a participation as rewarded before it is verified';
  end if;
  return new;
end;
$$;

create trigger trg_participations_guard
  before insert or update on public.participations
  for each row execute function public.enforce_verified_before_reward();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.campaigns enable row level security;
alter table public.participations enable row level security;
alter table public.rewards enable row level security;
alter table public.transactions enable row level security;

-- USERS: a citizen can see and update only their own profile. All other
-- reads/writes (e.g. an organizer looking up who joined their campaign)
-- go through the server-side admin client, which uses the service role
-- key and bypasses RLS entirely.
create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id);

-- ORGANIZATIONS: public read (campaign browsing needs the org name/logo
-- before a citizen has even connected a wallet); only the owner can write.
create policy "organizations_select_public"
  on public.organizations for select
  using (true);

create policy "organizations_update_owner"
  on public.organizations for update
  using (auth.uid() = owner_id);

-- CAMPAIGNS: public read; only the owning organization's owner can create
-- or update its own campaigns.
create policy "campaigns_select_public"
  on public.campaigns for select
  using (true);

create policy "campaigns_insert_owner"
  on public.campaigns for insert
  with check (
    exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.owner_id = auth.uid()
    )
  );

create policy "campaigns_update_owner"
  on public.campaigns for update
  using (
    exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.owner_id = auth.uid()
    )
  );

-- PARTICIPATIONS: a citizen can see and create their own participation
-- record; the organizing organization's owner can see and verify
-- participations that belong to their own campaigns.
create policy "participations_select_own"
  on public.participations for select
  using (auth.uid() = user_id);

create policy "participations_select_organizer"
  on public.participations for select
  using (
    exists (
      select 1 from public.campaigns c
      join public.organizations o on o.id = c.organization_id
      where c.id = campaign_id and o.owner_id = auth.uid()
    )
  );

create policy "participations_insert_self"
  on public.participations for insert
  with check (auth.uid() = user_id);

create policy "participations_update_organizer"
  on public.participations for update
  using (
    exists (
      select 1 from public.campaigns c
      join public.organizations o on o.id = c.organization_id
      where c.id = campaign_id and o.owner_id = auth.uid()
    )
  );

-- REWARDS: a citizen can see their own rewards; the organizing
-- organization's owner can see rewards for their own campaigns. Rewards
-- are only ever written by the server (service role, after confirming the
-- on-chain transaction), so there are no insert/update policies here.
create policy "rewards_select_own"
  on public.rewards for select
  using (auth.uid() = user_id);

create policy "rewards_select_organizer"
  on public.rewards for select
  using (
    exists (
      select 1 from public.campaigns c
      join public.organizations o on o.id = c.organization_id
      where c.id = campaign_id and o.owner_id = auth.uid()
    )
  );

-- TRANSACTIONS: a citizen can see transactions for their own linked wallet.
create policy "transactions_select_own"
  on public.transactions for select
  using (
    exists (
      select 1 from public.users u
      where u.wallet_address = transactions.wallet_address
        and u.id = auth.uid()
    )
  );
