module suipass::card {
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::{Self, Clock};
    use std::string::{Self, String, utf8};
    use std::vector;

    const ENotOwner: u64 = 0;
    const ECardExpired: u64 = 1;
    const EOverPeriodBudget: u64 = 2;
    const EOverLifetimeBudget: u64 = 3;
    const EPerTxExceeded: u64 = 4;
    const EUsesExhausted: u64 = 5;
    const ECardRevoked: u64 = 6;
    const ECapNotAuthorized: u64 = 7;
    const ESubcardsDisabled: u64 = 8;
    const EExceedsParentTerms: u64 = 9;
    const EMerchantNotAllowed: u64 = 10;

    public struct Card has key, store {
        id: UID,
        owner: address,
        name: String,
        budget_period_amount: u64,
        budget_period_seconds: u64,
        period_start: u64,
        budget_lifetime_amount: u64,
        per_tx_max: u64,
        max_uses: u64,
        usage_count: u64,
        expiry: u64,
        is_revoked: bool,
        subcards_enabled: bool,
        merchant_allowlist: vector<address>,
        spent_this_period: u64,
        spent_lifetime: u64,
        parent_id: ID,
        root_id: ID,
    }

    public struct CardCap has key, store {
        id: UID,
        card_id: ID,
    }

    public struct ChargeLog has key, store {
        id: UID,
        card_id: ID,
        amount: u64,
        fee: u64,
        recipient: address,
        memo: String,
        timestamp: u64,
        tx_digest: String,
    }

    public struct FreezeMarker has key, store {
        id: UID,
        card_id: ID,
    }

    public struct SpendEvent has copy, drop {
        card_id: ID,
        amount: u64,
        fee: u64,
        recipient: address,
        usage_count: u64,
        remaining_budget: u64,
        timestamp: u64,
    }

    public struct CardIssuedEvent has copy, drop {
        card_id: ID,
        owner: address,
        name: String,
        budget_period_amount: u64,
        budget_period_seconds: u64,
        budget_lifetime_amount: u64,
        timestamp: u64,
    }

    public struct CardRevokedEvent has copy, drop {
        card_id: ID,
        timestamp: u64,
    }

    public fun issue_root_card(
        name: vector<u8>,
        budget_period_amount: u64,
        budget_period_seconds: u64,
        budget_lifetime_amount: u64,
        per_tx_max: u64,
        max_uses: u64,
        expiry: u64,
        merchant_allowlist: vector<address>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Card, CardCap) {
        let now = clock::timestamp_ms(clock) / 1000;
        let sender = tx_context::sender(ctx);
        let id = object::new(ctx);
        let self_id = *object::uid_as_inner(&id);

        let card = Card {
            id,
            owner: sender,
            name: utf8(name),
            budget_period_amount,
            budget_period_seconds,
            period_start: now,
            budget_lifetime_amount,
            per_tx_max,
            max_uses,
            usage_count: 0,
            expiry,
            is_revoked: false,
            subcards_enabled: true,
            merchant_allowlist,
            spent_this_period: 0,
            spent_lifetime: 0,
            parent_id: self_id,
            root_id: self_id,
        };

        let cap = CardCap {
            id: object::new(ctx),
            card_id: object::id(&card),
        };

        event::emit(CardIssuedEvent {
            card_id: object::id(&card),
            owner: sender,
            name: card.name,
            budget_period_amount,
            budget_period_seconds,
            budget_lifetime_amount,
            timestamp: now,
        });

        (card, cap)
    }

    public fun issue_subcard(
        parent: &Card,
        parent_cap: &CardCap,
        name: vector<u8>,
        budget_period_amount: u64,
        budget_period_seconds: u64,
        budget_lifetime_amount: u64,
        per_tx_max: u64,
        max_uses: u64,
        expiry: u64,
        merchant_allowlist: vector<address>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Card, CardCap) {
        assert!(object::id(parent) == parent_cap.card_id, ECapNotAuthorized);
        assert!(!parent.is_revoked, ECardRevoked);
        assert!(parent.subcards_enabled, ESubcardsDisabled);

        let now = clock::timestamp_ms(clock) / 1000;

        if (budget_period_amount > 0) {
            if (parent.budget_period_amount > 0) {
                assert!(budget_period_amount <= parent.budget_period_amount, EExceedsParentTerms);
            };
        };
        if (budget_lifetime_amount > 0) {
            if (parent.budget_lifetime_amount > 0) {
                assert!(budget_lifetime_amount <= parent.budget_lifetime_amount, EExceedsParentTerms);
            };
        };
        if (per_tx_max > 0) {
            if (parent.per_tx_max > 0) {
                assert!(per_tx_max <= parent.per_tx_max, EExceedsParentTerms);
            };
        };
        if (max_uses > 0) {
            if (parent.max_uses > 0) {
                assert!(max_uses <= parent.max_uses, EExceedsParentTerms);
            };
        };
        if (expiry > 0) {
            if (parent.expiry > 0) {
                assert!(expiry <= parent.expiry, EExceedsParentTerms);
            };
        };

        let id = object::new(ctx);
        let card = Card {
            id,
            owner: parent.owner,
            name: utf8(name),
            budget_period_amount,
            budget_period_seconds,
            period_start: now,
            budget_lifetime_amount,
            per_tx_max,
            max_uses,
            usage_count: 0,
            expiry,
            is_revoked: false,
            subcards_enabled: true,
            merchant_allowlist,
            spent_this_period: 0,
            spent_lifetime: 0,
            parent_id: object::id(parent),
            root_id: parent.root_id,
        };

        let cap = CardCap {
            id: object::new(ctx),
            card_id: object::id(&card),
        };

        (card, cap)
    }

    public fun spend<T>(
        card: &mut Card,
        cap: &CardCap,
        amount: u64,
        recipient: address,
        merchant: address,
        _memo: vector<u8>,
        coin: &mut Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(object::id(card) == cap.card_id, ECapNotAuthorized);

        let now = clock::timestamp_ms(clock) / 1000;

        assert!(!card.is_revoked, ECardRevoked);

        if (card.expiry > 0) {
            assert!(now < card.expiry, ECardExpired);
        };

        if (card.max_uses > 0) {
            assert!(card.usage_count < card.max_uses, EUsesExhausted);
        };

        if (card.per_tx_max > 0) {
            assert!(amount <= card.per_tx_max, EPerTxExceeded);
        };

        let len = vector::length(&card.merchant_allowlist);
        if (len > 0) {
            let mut allowed = false;
            let mut i = 0;
            while (i < len) {
                if (*vector::borrow(&card.merchant_allowlist, i) == merchant) {
                    allowed = true;
                    break
                };
                i = i + 1;
            };
            assert!(allowed, EMerchantNotAllowed);
        };

        if (card.budget_period_seconds > 0 && card.budget_period_amount > 0) {
            let elapsed = now - card.period_start;
            if (elapsed >= card.budget_period_seconds) {
                let windows_passed = elapsed / card.budget_period_seconds;
                card.period_start = card.period_start + windows_passed * card.budget_period_seconds;
                card.spent_this_period = 0;
            };
            assert!(card.spent_this_period + amount <= card.budget_period_amount, EOverPeriodBudget);
        };

        if (card.budget_lifetime_amount > 0) {
            assert!(card.spent_lifetime + amount <= card.budget_lifetime_amount, EOverLifetimeBudget);
        };

        card.spent_this_period = card.spent_this_period + amount;
        card.spent_lifetime = card.spent_lifetime + amount;
        card.usage_count = card.usage_count + 1;

        let pay_coin = coin::split(coin, amount, ctx);
        transfer::public_transfer(pay_coin, recipient);

        let remaining = if (card.budget_period_amount > 0) {
            card.budget_period_amount - card.spent_this_period
        } else {
            0
        };

        event::emit(SpendEvent {
            card_id: object::id(card),
            amount,
            fee: 0,
            recipient,
            usage_count: card.usage_count,
            remaining_budget: remaining,
            timestamp: now,
        });
    }

    public fun log_charge(
        card: &Card,
        cap: &CardCap,
        amount: u64,
        fee: u64,
        recipient: address,
        memo: vector<u8>,
        tx_digest: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(object::id(card) == cap.card_id, ECapNotAuthorized);
        let log = ChargeLog {
            id: object::new(ctx),
            card_id: object::id(card),
            amount,
            fee,
            recipient,
            memo: utf8(memo),
            timestamp: clock::timestamp_ms(clock) / 1000,
            tx_digest: utf8(tx_digest),
        };
        transfer::public_transfer(log, card.owner);
    }

    public fun freeze_card(card: &Card, ctx: &mut TxContext) {
        assert!(tx_context::sender(ctx) == card.owner, ENotOwner);
        let marker = FreezeMarker {
            id: object::new(ctx),
            card_id: object::id(card),
        };
        transfer::public_transfer(marker, card.owner);
    }

    public fun unfreeze_card(freeze_marker: FreezeMarker, _ctx: &TxContext) {
        let FreezeMarker { id, card_id: _ } = freeze_marker;
        object::delete(id);
    }

    public fun revoke_card(card: &mut Card, clock: &Clock, ctx: &TxContext) {
        assert!(tx_context::sender(ctx) == card.owner, ENotOwner);
        card.is_revoked = true;
        event::emit(CardRevokedEvent {
            card_id: object::id(card),
            timestamp: clock::timestamp_ms(clock) / 1000,
        });
    }

    public fun remaining_period_budget(card: &Card, clock: &Clock): u64 {
        if (card.budget_period_amount == 0) return 0;
        let now = clock::timestamp_ms(clock) / 1000;
        let mut effective_spent = card.spent_this_period;
        if (card.budget_period_seconds > 0) {
            let elapsed = now - card.period_start;
            if (elapsed >= card.budget_period_seconds) {
                effective_spent = 0;
            };
        };
        if (effective_spent >= card.budget_period_amount) return 0;
        card.budget_period_amount - effective_spent
    }

    public fun issue_root_card_entry(
        name: vector<u8>,
        budget_period_amount: u64,
        budget_period_seconds: u64,
        budget_lifetime_amount: u64,
        per_tx_max: u64,
        max_uses: u64,
        expiry: u64,
        merchant_allowlist: vector<address>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let (card, cap) = issue_root_card(
            name, budget_period_amount, budget_period_seconds,
            budget_lifetime_amount, per_tx_max, max_uses, expiry,
            merchant_allowlist, clock, ctx,
        );
        transfer::public_transfer(card, tx_context::sender(ctx));
        transfer::public_transfer(cap, tx_context::sender(ctx));
    }

    #[test_only]
    public fun test_only_issue_root(
        name: vector<u8>,
        budget_period_amount: u64,
        budget_period_seconds: u64,
        budget_lifetime_amount: u64,
        per_tx_max: u64,
        max_uses: u64,
        expiry: u64,
        merchant_allowlist: vector<address>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Card, CardCap) {
        issue_root_card(name, budget_period_amount, budget_period_seconds,
            budget_lifetime_amount, per_tx_max, max_uses, expiry,
            merchant_allowlist, clock, ctx)
    }

    #[test_only]
    public struct DummyCoin has key, store {
        id: UID,
        value: u64,
    }

    #[test_only]
    public fun test_only_spend(
        card: &mut Card,
        cap: &CardCap,
        amount: u64,
        _recipient: address,
        _merchant: address,
        _memo: vector<u8>,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(object::id(card) == cap.card_id, ECapNotAuthorized);
        let now = clock::timestamp_ms(clock) / 1000;
        assert!(!card.is_revoked, ECardRevoked);
        if (card.expiry > 0) assert!(now < card.expiry, ECardExpired);
        if (card.max_uses > 0) assert!(card.usage_count < card.max_uses, EUsesExhausted);
        if (card.per_tx_max > 0) assert!(amount <= card.per_tx_max, EPerTxExceeded);

        if (card.budget_period_seconds > 0 && card.budget_period_amount > 0) {
            let elapsed = now - card.period_start;
            if (elapsed >= card.budget_period_seconds) {
                let windows_passed = elapsed / card.budget_period_seconds;
                card.period_start = card.period_start + windows_passed * card.budget_period_seconds;
                card.spent_this_period = 0;
            };
            assert!(card.spent_this_period + amount <= card.budget_period_amount, EOverPeriodBudget);
        };
        if (card.budget_lifetime_amount > 0) {
            assert!(card.spent_lifetime + amount <= card.budget_lifetime_amount, EOverLifetimeBudget);
        };

        card.spent_this_period = card.spent_this_period + amount;
        card.spent_lifetime = card.spent_lifetime + amount;
        card.usage_count = card.usage_count + 1;
    }

    #[test_only]
    public fun test_only_revoke(card: &mut Card) {
        card.is_revoked = true;
    }

    #[test_only]
    public fun test_only_destroy_card(card: Card, ctx: &mut TxContext) {
        let Card {
            id,
            owner: _,
            name: _,
            budget_period_amount: _,
            budget_period_seconds: _,
            period_start: _,
            budget_lifetime_amount: _,
            per_tx_max: _,
            max_uses: _,
            usage_count: _,
            expiry: _,
            is_revoked: _,
            subcards_enabled: _,
            merchant_allowlist: _,
            spent_this_period: _,
            spent_lifetime: _,
            parent_id: _,
            root_id: _,
        } = card;
        object::delete(id);
    }

    #[test_only]
    public fun test_only_destroy_cap(cap: CardCap) {
        let CardCap { id, card_id: _ } = cap;
        object::delete(id);
    }
}
