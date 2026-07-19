#![cfg(test)]
extern crate std;

use crate::{token, BayanihanRewards, BayanihanRewardsClient, Error};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

/// Deploys the contract plus a fresh BAYANI-style Stellar Asset Contract for
/// testing, initializes the contract with an admin, and mints a working
/// balance into the contract's own address so `claim_reward` has something
/// to pay out.
fn setup<'a>(env: &Env) -> (BayanihanRewardsClient<'a>, Address, Address) {
    let admin = Address::generate(env);

    let contract_id = env.register(BayanihanRewards, ());
    let client = BayanihanRewardsClient::new(env, &contract_id);

    let token_admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_id = sac.address();

    client.initialize(&admin, &token_id);

    let token_admin_client = token::StellarAssetClient::new(env, &token_id);
    token_admin_client.mint(&client.address, &1_000_000);

    (client, admin, token_id)
}

/// Test 1 — happy path: join, verify, issue, claim, and confirm the BAYANI
/// balance actually lands in the participant's wallet.
#[test]
fn test_happy_path_reward_issuance() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, token_id) = setup(&env);
    let organizer = admin;
    let participant = Address::generate(&env);

    let campaign_id = client.create_campaign(
        &organizer,
        &String::from_str(&env, "Barangay Clean-Up Drive"),
        &50,
        &0,
    );

    client.join_campaign(&participant, &campaign_id);
    client.verify_participant(&organizer, &campaign_id, &participant);
    let issued = client.issue_reward(&organizer, &campaign_id, &participant);
    assert_eq!(issued, 50);

    client.claim_reward(&participant, &campaign_id);

    let token_client = token::Client::new(&env, &token_id);
    assert_eq!(token_client.balance(&participant), 50);
}

/// Test 2 — an address that is not the campaign's organizer must not be able
/// to verify a participant.
#[test]
fn test_unauthorized_verification() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _token_id) = setup(&env);
    let organizer = admin;
    let impostor = Address::generate(&env);
    let participant = Address::generate(&env);

    let campaign_id = client.create_campaign(
        &organizer,
        &String::from_str(&env, "Blood Donation Drive"),
        &30,
        &0,
    );
    client.join_campaign(&participant, &campaign_id);

    let result = client.try_verify_participant(&impostor, &campaign_id, &participant);
    assert_eq!(result, Err(Ok(Error::NotAuthorized)));
}

/// Test 3 — joining the same campaign twice must fail on the second attempt.
#[test]
fn test_duplicate_participation() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _token_id) = setup(&env);
    let participant = Address::generate(&env);

    let campaign_id = client.create_campaign(
        &admin,
        &String::from_str(&env, "TESDA Training Attendance"),
        &100,
        &0,
    );
    client.join_campaign(&participant, &campaign_id);

    let result = client.try_join_campaign(&participant, &campaign_id);
    assert_eq!(result, Err(Ok(Error::AlreadyJoined)));
}

/// Test 4 — campaign state (reward amount, cap, participant count, active
/// flag) reflects reality after participants join.
#[test]
fn test_campaign_state_verification() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _token_id) = setup(&env);
    let participant_a = Address::generate(&env);
    let participant_b = Address::generate(&env);

    let campaign_id = client.create_campaign(
        &admin,
        &String::from_str(&env, "Disaster Preparedness Workshop"),
        &75,
        &5,
    );

    client.join_campaign(&participant_a, &campaign_id);
    client.join_campaign(&participant_b, &campaign_id);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.reward_amount, 75);
    assert_eq!(campaign.max_participants, 5);
    assert_eq!(campaign.participant_count, 2);
    assert!(campaign.active);

    let participants = client.get_participants(&campaign_id);
    assert_eq!(participants.len(), 2);
}

/// Test 5 — reward bookkeeping and token balance stay correct through the
/// full issue -> claim cycle, and a second claim is rejected.
#[test]
fn test_reward_balance_verification() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, token_id) = setup(&env);
    let participant = Address::generate(&env);

    let campaign_id = client.create_campaign(
        &admin,
        &String::from_str(&env, "School Seminar Attendance"),
        &40,
        &0,
    );
    client.join_campaign(&participant, &campaign_id);
    client.verify_participant(&admin, &campaign_id, &participant);
    client.issue_reward(&admin, &campaign_id, &participant);

    let rewards = client.get_rewards(&campaign_id);
    assert_eq!(rewards.len(), 1);
    let info = rewards.get(0).unwrap();
    assert_eq!(info.amount, 40);
    assert_eq!(info.claimed, false);

    let token_client = token::Client::new(&env, &token_id);
    assert_eq!(token_client.balance(&participant), 0);

    client.claim_reward(&participant, &campaign_id);
    assert_eq!(token_client.balance(&participant), 40);

    let result = client.try_claim_reward(&participant, &campaign_id);
    assert_eq!(result, Err(Ok(Error::AlreadyClaimed)));
}
