#[test_only]
module suipass::card_tests {
    use sui::clock::{Self, Clock};
    use sui::tx_context::{Self, TxContext};

    use suipass::card::{Self, Card, CardCap};

    const TEST_ADMIN: address = @0x0;
    const TEST_MERCHANT: address = @0x2;

    fun setup(ctx: &mut TxContext): (Card, CardCap, Clock) {
        let clock = clock::create_for_testing(ctx);
        let (card, cap) = card::issue_root_card(
            b"Test Card",
            100_000_000,
            604_800,
            1_000_000_000,
            10_000_000,
            10,
            1_999_999_999,
            vector[TEST_MERCHANT],
            &clock,
            ctx,
        );
        (card, cap, clock)
    }

    fun destroy_card(card: Card, cap: CardCap, clock: Clock, ctx: &mut TxContext) {
        card::test_only_destroy_card(card, ctx);
        card::test_only_destroy_cap(cap);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_issue_root_card() {
        let mut ctx = tx_context::dummy();
        let (card, cap, clock) = setup(&mut ctx);
        destroy_card(card, cap, clock, &mut ctx);
    }

    #[test]
    fun test_spend_within_budget() {
        let mut ctx = tx_context::dummy();
        let (mut card_obj, cap, clock) = setup(&mut ctx);
        card::test_only_spend(
            &mut card_obj, &cap, 5_000_000, TEST_ADMIN,
            TEST_MERCHANT, b"test spend", &clock, &mut ctx,
        );
        destroy_card(card_obj, cap, clock, &mut ctx);
    }

    #[test]
    fun test_subcard_issuance() {
        let mut ctx = tx_context::dummy();
        let (mut parent, parent_cap, clock) = setup(&mut ctx);

        let mut ctx2 = tx_context::dummy();
        let clock2 = clock::create_for_testing(&mut ctx2);
        let (sub, sub_cap) = card::issue_root_card(
            b"Sub Card",
            50_000_000,
            604_800,
            500_000_000,
            5_000_000,
            5,
            1_999_999_999,
            vector[TEST_MERCHANT],
            &clock2,
            &mut ctx2,
        );

        card::test_only_spend(
            &mut parent, &parent_cap, 5_000_000, TEST_ADMIN,
            TEST_MERCHANT, b"parent spend after subcard", &clock, &mut ctx,
        );

        destroy_card(parent, parent_cap, clock, &mut ctx);
        card::test_only_destroy_card(sub, &mut ctx2);
        card::test_only_destroy_cap(sub_cap);
        clock::destroy_for_testing(clock2);
    }
}
