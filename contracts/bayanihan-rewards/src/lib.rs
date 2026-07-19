#![no_std]

//! Bayanihan Rewards — Soroban smart contract
//!
//! Tracks community reward campaigns for Philippine LGUs, schools, and NGOs:
//! a citizen joins a campaign, an organizer verifies their participation,
//! and the contract issues and pays out a BAYANI token reward.
//!
//! Storage layout:
//! - Instance storage: Admin, TokenId (the BAYANI Stellar Asset Contract
//!   address), CampaignCount.
//! - Persistent storage: one Campaign entry per campaign id, one Participants
//!   list per campaign, one Participation entry per (campaign, participant),
//!   one Reward entry per (campaign, participant).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, String, Vec,
};

// ---------------------------------------------------------------------
// Ledger/TTL constants
// 5s per ledger -> ~17280 ledgers/day (same convention used across the
// official Soroban example contracts).
// ---------------------------------------------------------------------

const DAY_IN_LEDGERS: u32 = 17280;
const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;
const PERSISTENT_BUMP_AMOUNT: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = PERSISTENT_BUMP_AMOUNT - DAY_IN_LEDGERS;

// ---------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------

/// Composite key for a single participant's record within a campaign.
#[derive(Clone)]
#[contracttype]
pub struct ParticipationKey {
    pub campaign_id: u64,
    pub participant: Address,
}

/// Composite key for a single participant's reward within a campaign.
#[derive(Clone)]
#[contracttype]
pub struct RewardKey {
    pub campaign_id: u64,
    pub participant: Address,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    TokenId,
    CampaignCount,
    Campaign(u64),
    Participants(u64),
    Participation(ParticipationKey),
    Reward(RewardKey),
}

// ---------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------

#[derive(Clone)]
#[contracttype]
pub struct Campaign {
    pub id: u64,
    pub organizer: Address,
    pub title: String,
    pub reward_amount: i128,
    /// 0 means unlimited.
    pub max_participants: u32,
    pub participant_count: u32,
    pub active: bool,
}

#[derive(Clone)]
#[contracttype]
pub struct Participation {
    pub joined_at: u64,
    pub verified: bool,
    pub rewarded: bool,
}

#[derive(Clone)]
#[contracttype]
pub struct Reward {
    pub amount: i128,
    pub claimed: bool,
}

/// Flattened view of a reward returned by `get_rewards`, since Soroban
/// contract return types can't be arbitrary maps keyed by Address.
#[derive(Clone)]
#[contracttype]
pub struct RewardInfo {
    pub participant: Address,
    pub amount: i128,
    pub claimed: bool,
}

// ---------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAuthorized = 3,
    CampaignNotFound = 4,
    CampaignInactive = 5,
    CampaignFull = 6,
    AlreadyJoined = 7,
    NotJoined = 8,
    AlreadyVerified = 9,
    NotVerified = 10,
    AlreadyRewarded = 11,
    RewardNotFound = 12,
    AlreadyClaimed = 13,
}

#[contract]
pub struct BayanihanRewards;

#[contractimpl]
impl BayanihanRewards {
    /// One-time setup. Sets the admin and the BAYANI token contract
    /// (a Stellar Asset Contract address) used for reward payouts.
    /// Must be called once, by the intended admin, before anything else.
    pub fn initialize(env: Env, admin: Address, token_id: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TokenId, &token_id);
        env.storage().instance().set(&DataKey::CampaignCount, &0u64);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        Ok(())
    }

    /// Organizer creates a campaign with a fixed per-participant reward.
    /// Returns the new campaign's id.
    pub fn create_campaign(
        env: Env,
        organizer: Address,
        title: String,
        reward_amount: i128,
        max_participants: u32,
    ) -> u64 {
        organizer.require_auth();

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);

        let campaign = Campaign {
            id,
            organizer,
            title,
            reward_amount,
            max_participants,
            participant_count: 0,
            active: true,
        };

        let key = DataKey::Campaign(id);
        env.storage().persistent().set(&key, &campaign);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME_THRESHOLD, PERSISTENT_BUMP_AMOUNT);

        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &(id + 1));

        id
    }

    /// Citizen joins an active campaign. Fails on a duplicate join, an
    /// inactive campaign, or a full campaign.
    pub fn join_campaign(env: Env, participant: Address, campaign_id: u64) -> Result<(), Error> {
        participant.require_auth();

        let mut campaign = Self::read_campaign(&env, campaign_id)?;
        if !campaign.active {
            return Err(Error::CampaignInactive);
        }
        if campaign.max_participants > 0
            && campaign.participant_count >= campaign.max_participants
        {
            return Err(Error::CampaignFull);
        }

        let part_key = DataKey::Participation(ParticipationKey {
            campaign_id,
            participant: participant.clone(),
        });
        if env.storage().persistent().has(&part_key) {
            return Err(Error::AlreadyJoined);
        }

        let participation = Participation {
            joined_at: env.ledger().timestamp(),
            verified: false,
            rewarded: false,
        };
        env.storage().persistent().set(&part_key, &participation);
        env.storage().persistent().extend_ttl(
            &part_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        let list_key = DataKey::Participants(campaign_id);
        let mut list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&list_key)
            .unwrap_or(Vec::new(&env));
        list.push_back(participant);
        env.storage().persistent().set(&list_key, &list);
        env.storage().persistent().extend_ttl(
            &list_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        campaign.participant_count += 1;
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);

        Ok(())
    }

    /// Organizer marks a participant's attendance/completion as verified.
    /// Only the campaign's own organizer may call this.
    pub fn verify_participant(
        env: Env,
        organizer: Address,
        campaign_id: u64,
        participant: Address,
    ) -> Result<(), Error> {
        organizer.require_auth();

        let campaign = Self::read_campaign(&env, campaign_id)?;
        if campaign.organizer != organizer {
            return Err(Error::NotAuthorized);
        }

        let key = DataKey::Participation(ParticipationKey {
            campaign_id,
            participant,
        });
        let mut participation: Participation = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotJoined)?;

        if participation.verified {
            return Err(Error::AlreadyVerified);
        }
        participation.verified = true;
        env.storage().persistent().set(&key, &participation);

        Ok(())
    }

    /// Organizer records that a verified participant is owed their reward.
    /// This does not move tokens yet — the participant claims separately,
    /// so the citizen (not the organizer) pays the claim transaction's fee.
    pub fn issue_reward(
        env: Env,
        organizer: Address,
        campaign_id: u64,
        participant: Address,
    ) -> Result<i128, Error> {
        organizer.require_auth();

        let campaign = Self::read_campaign(&env, campaign_id)?;
        if campaign.organizer != organizer {
            return Err(Error::NotAuthorized);
        }

        let part_key = DataKey::Participation(ParticipationKey {
            campaign_id,
            participant: participant.clone(),
        });
        let mut participation: Participation = env
            .storage()
            .persistent()
            .get(&part_key)
            .ok_or(Error::NotJoined)?;

        if !participation.verified {
            return Err(Error::NotVerified);
        }
        if participation.rewarded {
            return Err(Error::AlreadyRewarded);
        }

        participation.rewarded = true;
        env.storage().persistent().set(&part_key, &participation);

        let reward_key = DataKey::Reward(RewardKey {
            campaign_id,
            participant,
        });
        let reward = Reward {
            amount: campaign.reward_amount,
            claimed: false,
        };
        env.storage().persistent().set(&reward_key, &reward);
        env.storage().persistent().extend_ttl(
            &reward_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        Ok(reward.amount)
    }

    /// Participant claims an issued reward. Transfers BAYANI from this
    /// contract's own balance to the participant via the token contract.
    /// The contract's BAYANI balance must be pre-funded by the admin.
    pub fn claim_reward(env: Env, participant: Address, campaign_id: u64) -> Result<(), Error> {
        participant.require_auth();

        let reward_key = DataKey::Reward(RewardKey {
            campaign_id,
            participant: participant.clone(),
        });
        let mut reward: Reward = env
            .storage()
            .persistent()
            .get(&reward_key)
            .ok_or(Error::RewardNotFound)?;

        if reward.claimed {
            return Err(Error::AlreadyClaimed);
        }

        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenId)
            .ok_or(Error::NotInitialized)?;

        let token_client = token::Client::new(&env, &token_id);
        token_client.transfer(&env.current_contract_address(), &participant, &reward.amount);

        reward.claimed = true;
        env.storage().persistent().set(&reward_key, &reward);

        Ok(())
    }

    /// Read-only: fetch a campaign's current state.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Result<Campaign, Error> {
        Self::read_campaign(&env, campaign_id)
    }

    /// Read-only: list every address that has joined a campaign.
    pub fn get_participants(env: Env, campaign_id: u64) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Participants(campaign_id))
            .unwrap_or(Vec::new(&env))
    }

    /// Read-only: list every issued reward for a campaign, with amount and
    /// claimed status, for leaderboard/analytics views.
    pub fn get_rewards(env: Env, campaign_id: u64) -> Vec<RewardInfo> {
        let participants = Self::get_participants(env.clone(), campaign_id);
        let mut out = Vec::new(&env);
        for participant in participants.iter() {
            let key = DataKey::Reward(RewardKey {
                campaign_id,
                participant: participant.clone(),
            });
            let maybe_reward: Option<Reward> = env.storage().persistent().get(&key);
            if let Some(r) = maybe_reward {
                out.push_back(RewardInfo {
                    participant,
                    amount: r.amount,
                    claimed: r.claimed,
                });
            }
        }
        out
    }

    fn read_campaign(env: &Env, campaign_id: u64) -> Result<Campaign, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .ok_or(Error::CampaignNotFound)
    }
}

mod test;
