import { beforeEach, describe, expect, test } from "bun:test";
import {
    IUserSubscription,
    UserSubscriptionStatus,
    normalizeUserSubscription
} from "../src/models/User";
import {
    RazorpaySubscriptionEntity,
    buildUserSubscriptionState,
    hasUsedSubscriptionOffer,
    resolveMonthlyIntroTrialConfig
} from "../src/services/razorpay_service";

const nowSeconds = () => Math.floor(Date.now() / 1000);
const MONTH_SECONDS = 30 * 24 * 60 * 60;

const subscription = (overrides: Partial<IUserSubscription> = {}) =>
    normalizeUserSubscription(overrides);

const introNotes = (startedAt: number, endsAt: number) => ({
    app_name: "College Notes",
    app_plan_code: "monthly",
    user_phone: "9999999999",
    app_intro_trial: "true",
    app_intro_trial_amount_in_paise: "100",
    app_intro_trial_started_at: String(startedAt),
    app_intro_trial_ends_at: String(endsAt),
    app_recurring_amount_in_paise: "3900"
});

const entity = (
    overrides: Partial<RazorpaySubscriptionEntity> = {}
): RazorpaySubscriptionEntity => ({
    id: "sub_test123",
    plan_id: "plan_test123",
    status: "created",
    ...overrides
});

describe("hasUsedSubscriptionOffer", () => {
    test("a brand-new subscription is still eligible for the intro offer", () => {
        expect(hasUsedSubscriptionOffer(subscription())).toBe(false);
    });

    test("a pending 'created' checkout session is still eligible", () => {
        expect(
            hasUsedSubscriptionOffer(
                subscription({ subscriptionId: "sub_abc", status: "created" })
            )
        ).toBe(false);
    });

    test("once the intro trial is consumed the offer is no longer available", () => {
        expect(
            hasUsedSubscriptionOffer(subscription({ introTrialUsed: true }))
        ).toBe(true);
    });

    test("any completed payment cycle disqualifies the offer", () => {
        expect(hasUsedSubscriptionOffer(subscription({ paidCount: 1 }))).toBe(true);
    });

    test("a recorded payment id disqualifies the offer", () => {
        expect(
            hasUsedSubscriptionOffer(subscription({ lastPaymentId: "pay_123" }))
        ).toBe(true);
    });

    test("an authenticated live subscription disqualifies the offer", () => {
        expect(
            hasUsedSubscriptionOffer(
                subscription({ subscriptionId: "sub_abc", status: "authenticated" })
            )
        ).toBe(true);
    });
});

describe("buildUserSubscriptionState intro-trial fields", () => {
    test("a freshly created subscription does not consume the trial yet", () => {
        const startedAt = nowSeconds();
        const endsAt = startedAt + MONTH_SECONDS;

        const state = buildUserSubscriptionState({
            existing: null,
            subscription: entity({
                status: "created",
                notes: introNotes(startedAt, endsAt)
            }),
            planCode: "monthly"
        });

        expect(state.introTrialUsed).toBe(false);
        expect(state.introTrialActive).toBe(false);
        // Amounts are captured from notes even before the trial is consumed.
        expect(state.introTrialAmountInPaise).toBe(100);
        expect(state.recurringAmountInPaise).toBe(3900);
    });

    test("an authenticated subscription consumes the trial and marks it active", () => {
        const startedAt = nowSeconds();
        const endsAt = startedAt + MONTH_SECONDS;

        const state = buildUserSubscriptionState({
            existing: null,
            subscription: entity({
                status: "authenticated",
                notes: introNotes(startedAt, endsAt)
            }),
            planCode: "monthly"
        });

        expect(state.introTrialUsed).toBe(true);
        expect(state.introTrialActive).toBe(true);
        expect(state.introTrialEndsAt).toBeInstanceOf(Date);
    });

    test("the trial is no longer active once the end date has passed", () => {
        const endsAt = nowSeconds() - MONTH_SECONDS;
        const startedAt = endsAt - MONTH_SECONDS;

        const state = buildUserSubscriptionState({
            existing: null,
            subscription: entity({
                status: "active",
                notes: introNotes(startedAt, endsAt)
            }),
            planCode: "monthly"
        });

        expect(state.introTrialUsed).toBe(true);
        expect(state.introTrialActive).toBe(false);
    });

    test("introTrialUsed stays true even when a later webhook carries no intro notes", () => {
        const state = buildUserSubscriptionState({
            existing: subscription({ introTrialUsed: true }),
            subscription: entity({
                status: "active",
                notes: { app_plan_code: "monthly", user_phone: "9999999999" }
            })
        });

        expect(state.introTrialUsed).toBe(true);
    });
});

describe("normalizeUserSubscription introTrialActive", () => {
    const futureEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const pastEndsAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    test("is active for an entitled status with a future end date", () => {
        const state = subscription({
            introTrialUsed: true,
            introTrialEndsAt: futureEndsAt,
            status: "active"
        });

        expect(state.introTrialActive).toBe(true);
    });

    test("is inactive for a non-entitled status even with a future end date", () => {
        const statuses: UserSubscriptionStatus[] = ["cancelled", "expired", "created"];

        for (const status of statuses) {
            const state = subscription({
                introTrialUsed: true,
                introTrialEndsAt: futureEndsAt,
                status
            });

            expect(state.introTrialActive).toBe(false);
        }
    });

    test("is inactive once the end date is in the past", () => {
        const state = subscription({
            introTrialUsed: true,
            introTrialEndsAt: pastEndsAt,
            status: "active"
        });

        expect(state.introTrialActive).toBe(false);
    });
});

describe("resolveMonthlyIntroTrialConfig", () => {
    // .env may preset these (bun auto-loads it), so start each test from a
    // clean slate and let the test set exactly what it needs.
    beforeEach(() => {
        delete process.env.RAZORPAY_MONTHLY_TRIAL_AMOUNT;
        delete process.env.RAZORPAY_MONTHLY_TRIAL_DAYS;
    });

    test("reads the configured amount (rupees) and length (days) from env", () => {
        process.env.RAZORPAY_MONTHLY_TRIAL_AMOUNT = "3";
        process.env.RAZORPAY_MONTHLY_TRIAL_DAYS = "7";

        expect(resolveMonthlyIntroTrialConfig()).toEqual({
            amountInPaise: 300,
            periodDays: 7
        });
    });

    test("supports fractional rupee amounts", () => {
        process.env.RAZORPAY_MONTHLY_TRIAL_AMOUNT = "2.50";
        process.env.RAZORPAY_MONTHLY_TRIAL_DAYS = "1";

        expect(resolveMonthlyIntroTrialConfig()).toEqual({
            amountInPaise: 250,
            periodDays: 1
        });
    });

    test("falls back to ₹1 / 30 days when the env vars are blank", () => {
        expect(resolveMonthlyIntroTrialConfig()).toEqual({
            amountInPaise: 100,
            periodDays: 30
        });
    });

    test("falls back to defaults for zero or non-numeric values", () => {
        process.env.RAZORPAY_MONTHLY_TRIAL_AMOUNT = "0";
        process.env.RAZORPAY_MONTHLY_TRIAL_DAYS = "abc";

        expect(resolveMonthlyIntroTrialConfig()).toEqual({
            amountInPaise: 100,
            periodDays: 30
        });
    });
});
