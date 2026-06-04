/**
 * STEP 1 of the "give everyone the intro trial again" flow.
 *
 * Cancels every user's LIVE Razorpay subscription *immediately*
 * (cancel_at_cycle_end = 0), which revokes the autopay mandate on Razorpay so
 * users can later set up a fresh ₹1-trial mandate without being double-billed.
 *
 * This script ONLY talks to Razorpay. It does not edit Mongo — the
 * `subscription.cancelled` webhook will sync each local doc to "cancelled".
 * After the webhooks settle, run `reset-trial-eligibility.ts` (STEP 2).
 *
 * ⚠️  Live keys: with RAZORPAY_TEST_MODE=false this cancels REAL mandates and
 *     cuts paid users off mid-cycle. Dry-run by default; only `--apply` cancels.
 *
 * Usage:
 *   bun run scripts/cancel-live-subscriptions.ts            # dry-run: list what would be cancelled
 *   bun run scripts/cancel-live-subscriptions.ts --apply    # actually cancel on Razorpay
 */
import mongoose from "mongoose";
import { connectDB } from "../src/db";
import { UserModel, normalizeUserSubscription } from "../src/models/User";
import {
    cancelRazorpaySubscription,
    getRazorpayServiceErrorMessage
} from "../src/services/razorpay_service";

const LIVE_SUBSCRIPTION_STATUSES = new Set([
    "created",
    "authenticated",
    "active",
    "pending",
    "halted",
    "paused"
]);

const apply = process.argv.includes("--apply");

const main = async () => {
    await connectDB();

    const counters = {
        scanned: 0,
        live: 0,
        skippedNoId: 0,
        cancelled: 0,
        failed: 0
    };
    const sample: string[] = [];
    const failures: string[] = [];

    for await (const user of UserModel.find().cursor()) {
        counters.scanned++;

        const sub = normalizeUserSubscription(user.subscription);
        if (!LIVE_SUBSCRIPTION_STATUSES.has(sub.status)) continue;
        counters.live++;

        if (!sub.subscriptionId) {
            counters.skippedNoId++;
            continue;
        }

        if (!apply) {
            if (sample.length < 25) {
                sample.push(`${user.phone}  ${sub.subscriptionId}  status=${sub.status}`);
            }
            continue;
        }

        try {
            // false = cancel immediately (revoke the mandate now).
            await cancelRazorpaySubscription(sub.subscriptionId, false);
            counters.cancelled++;
            console.log(`cancelled ${sub.subscriptionId}  (${user.phone})`);
        } catch (error) {
            counters.failed++;
            const message = getRazorpayServiceErrorMessage(error);
            failures.push(`${user.phone}  ${sub.subscriptionId}  -> ${message}`);
            console.warn(`FAILED   ${sub.subscriptionId}  (${user.phone}): ${message}`);
        }
    }

    console.log("\n──────── cancel-live-subscriptions ────────");
    console.log(`mode             : ${apply ? "APPLY (cancelling on Razorpay)" : "DRY-RUN (no API calls)"}`);
    console.log(`users scanned    : ${counters.scanned}`);
    console.log(`live subscriptions: ${counters.live}`);
    console.log(`skipped (no id)  : ${counters.skippedNoId}`);
    if (apply) {
        console.log(`cancelled        : ${counters.cancelled}`);
        console.log(`failed           : ${counters.failed}`);
        if (failures.length) {
            console.log("\nfailures:");
            for (const line of failures) console.log(`  ${line}`);
        }
        console.log(
            "\nNext: wait for the subscription.cancelled webhooks to settle, then run\n" +
                "  bun run scripts/reset-trial-eligibility.ts --include-live --i-understand-live-risk --apply"
        );
    } else {
        if (sample.length) {
            console.log("\nsample of subscriptions that would be cancelled:");
            for (const line of sample) console.log(`  ${line}`);
        }
        if (counters.live > 0) {
            console.log("\nDry-run only. Re-run with --apply to cancel these on Razorpay.");
        }
    }
    console.log("───────────────────────────────────────────\n");

    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error("cancel-live-subscriptions failed:", error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
