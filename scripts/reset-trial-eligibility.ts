/**
 * Reset users' subscription state so they become eligible for the intro trial
 * again (i.e. `hasUsedSubscriptionOffer` becomes false). For each in-scope user
 * the subscription block is reset to a fresh default via
 * `createDefaultUserSubscription()`.
 *
 * SAFETY:
 *   - Dry-run by default. It only WRITES when you pass `--apply`.
 *   - Users with a LIVE subscription are SKIPPED unless you pass
 *     `--include-live`. Resetting live subscribers can double-bill them (their
 *     Razorpay mandate keeps charging while the app lets them subscribe again),
 *     so `--include-live` also requires `--i-understand-live-risk`.
 *
 * Usage:
 *   bun run scripts/reset-trial-eligibility.ts                 # dry-run, non-live only
 *   bun run scripts/reset-trial-eligibility.ts --apply         # write, non-live only
 *   bun run scripts/reset-trial-eligibility.ts --include-live --i-understand-live-risk           # dry-run, everyone
 *   bun run scripts/reset-trial-eligibility.ts --include-live --i-understand-live-risk --apply   # write, everyone (risky)
 */
import mongoose from "mongoose";
import { connectDB } from "../src/db";
import {
    UserModel,
    createDefaultUserSubscription,
    normalizeUserSubscription
} from "../src/models/User";
import { hasUsedSubscriptionOffer } from "../src/services/razorpay_service";

const LIVE_SUBSCRIPTION_STATUSES = new Set([
    "created",
    "authenticated",
    "active",
    "pending",
    "halted",
    "paused"
]);

const apply = process.argv.includes("--apply");
const includeLive = process.argv.includes("--include-live");
const acknowledgedLiveRisk = process.argv.includes("--i-understand-live-risk");

const main = async () => {
    if (includeLive && !acknowledgedLiveRisk) {
        console.error(
            "Refusing to include live subscribers without --i-understand-live-risk.\n" +
                "Including them can double-bill real customers. Re-run with the ack flag if you are sure."
        );
        process.exit(1);
    }

    await connectDB();

    const counters = {
        total: 0,
        alreadyEligible: 0,
        skippedLive: 0,
        liveReset: 0,
        reset: 0
    };
    const sample: string[] = [];

    for await (const user of UserModel.find().cursor()) {
        counters.total++;

        const sub = normalizeUserSubscription(user.subscription);
        const isLive = LIVE_SUBSCRIPTION_STATUSES.has(sub.status);

        // Live subscriber and we are not told to include them -> leave untouched.
        if (isLive && !includeLive) {
            counters.skippedLive++;
            continue;
        }

        // Already able to start a trial -> nothing to do (avoids needless writes).
        if (!hasUsedSubscriptionOffer(sub)) {
            counters.alreadyEligible++;
            continue;
        }

        counters.reset++;
        if (isLive) counters.liveReset++;
        if (sample.length < 15) {
            sample.push(
                `${user.phone}  status=${sub.status}  paidCount=${sub.paidCount}${isLive ? "  [LIVE]" : ""}`
            );
        }

        if (apply) {
            user.subscription = createDefaultUserSubscription();
            await user.save();
        }
    }

    console.log("\n──────── reset-trial-eligibility ────────");
    console.log(`mode            : ${apply ? "APPLY (writing)" : "DRY-RUN (no writes)"}`);
    console.log(`include live    : ${includeLive ? "YES" : "no (live subs skipped)"}`);
    console.log(`users scanned   : ${counters.total}`);
    console.log(`already eligible: ${counters.alreadyEligible}`);
    console.log(`skipped (live)  : ${counters.skippedLive}`);
    console.log(`to reset        : ${counters.reset}  (of which live: ${counters.liveReset})`);
    if (sample.length) {
        console.log(`\nsample of users ${apply ? "reset" : "that would be reset"}:`);
        for (const line of sample) console.log(`  ${line}`);
    }
    if (!apply && counters.reset > 0) {
        console.log("\nDry-run only. Re-run with --apply to write these changes.");
    }
    console.log("─────────────────────────────────────────\n");

    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error("reset-trial-eligibility failed:", error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
