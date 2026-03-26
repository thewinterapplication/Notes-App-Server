import { Elysia, t } from "elysia";
import { RazorpayWebhookEventModel } from "../models/RazorpayWebhookEvent";
import { IUser, normalizeUserSubscription, UserModel } from "../models/User";
import {
    buildPublicSubscriptionConfig,
    buildUserSubscriptionState,
    cancelRazorpaySubscription,
    createEmptySubscriptionState,
    createRazorpaySubscription,
    fetchRazorpaySubscription,
    getAppSubscriptionPlanByCode,
    getAppSubscriptionPlans,
    getRazorpayServiceErrorMessage,
    getSubscriptionLastTransactionAt,
    verifyRazorpaySubscriptionSignature,
    verifyRazorpayWebhookSignature
} from "../services/razorpay_service";

const LIVE_SUBSCRIPTION_STATUSES = new Set([
    "created",
    "authenticated",
    "active",
    "pending",
    "halted",
    "paused"
]);

const serializeUser = (user: IUser) => ({
    id: user._id,
    name: user.name,
    phone: user.phone,
    favourites: user.favourites,
    lastTransaction: user.lastTransaction,
    createdAt: user.createdAt,
    subscription: normalizeUserSubscription(user.subscription)
});

const buildCheckoutPayload = (args: {
    user: IUser;
    subscriptionId: string;
    shortUrl?: string | null;
    planCode: string;
    planName: string;
    planDescription: string;
}) => ({
    ...buildPublicSubscriptionConfig(),
    subscriptionId: args.subscriptionId,
    shortUrl: args.shortUrl,
    planCode: args.planCode,
    planName: args.planName,
    description: args.planDescription,
    customerName: args.user.name,
    contact: args.user.phone.startsWith("+") ? args.user.phone : `+91${args.user.phone}`,
    notes: {
        app_plan_code: args.planCode,
        user_phone: args.user.phone
    }
});

export const subscriptionController = new Elysia({ prefix: "/api/subscriptions" })
    .get("/plans", async ({ set }) => {
        try {
            const plans = await getAppSubscriptionPlans();

            if (!plans.length) {
                set.status = 503;
                return {
                    success: false,
                    message: "No Razorpay plans are configured on the backend."
                };
            }

            return {
                success: true,
                data: {
                    plans,
                    config: buildPublicSubscriptionConfig()
                }
            };
        } catch (error) {
            set.status = 500;
            return {
                success: false,
                message: getRazorpayServiceErrorMessage(error)
            };
        }
    })
    .post("/create", async ({ body, set }) => {
        try {
            const user = await UserModel.findOne({ phone: body.phone });

            if (!user) {
                set.status = 404;
                return {
                    success: false,
                    message: "User not found. Please log in again."
                };
            }

            const plan = await getAppSubscriptionPlanByCode(body.planCode);

            if (!plan) {
                set.status = 400;
                return {
                    success: false,
                    message: "Selected subscription plan is not available."
                };
            }

            let currentSubscription = normalizeUserSubscription(user.subscription);

            if (
                currentSubscription.subscriptionId &&
                LIVE_SUBSCRIPTION_STATUSES.has(currentSubscription.status)
            ) {
                if (
                    currentSubscription.status === "created" &&
                    currentSubscription.planCode === body.planCode
                ) {
                    // Verify the subscription is still valid on Razorpay before reusing
                    try {
                        const rzpSub = await fetchRazorpaySubscription(currentSubscription.subscriptionId);
                        console.log(`[subscriptions] Existing "created" subscription ${rzpSub.id} has Razorpay status: ${rzpSub.status}`);

                        if (rzpSub.status === "created") {
                            console.log(`[subscriptions] Reusing existing subscription ${rzpSub.id}`);
                            return {
                                success: true,
                                message: "Using your pending subscription checkout session.",
                                data: {
                                    checkout: buildCheckoutPayload({
                                        user,
                                        subscriptionId: currentSubscription.subscriptionId,
                                        shortUrl: currentSubscription.shortUrl ?? rzpSub.short_url,
                                        planCode: plan.code,
                                        planName: plan.title,
                                        planDescription: plan.description
                                    }),
                                    user: serializeUser(user)
                                }
                            };
                        }

                        // Subscription expired or changed on Razorpay - update local state and fall through to create new
                        console.log(`[subscriptions] Subscription ${rzpSub.id} is no longer "created" (status: ${rzpSub.status}), creating fresh one`);
                        user.subscription = buildUserSubscriptionState({
                            existing: user.subscription,
                            subscription: rzpSub
                        });
                        await user.save();
                        currentSubscription = normalizeUserSubscription(user.subscription);
                    } catch (error) {
                        console.log(`[subscriptions] Failed to verify existing subscription ${currentSubscription.subscriptionId}, creating fresh one:`, error);
                        user.subscription = createEmptySubscriptionState();
                        await user.save();
                        currentSubscription = normalizeUserSubscription(user.subscription);
                    }
                }

                // Re-check after potential refresh - still live and not "created"? Block it.
                if (
                    currentSubscription.subscriptionId &&
                    LIVE_SUBSCRIPTION_STATUSES.has(currentSubscription.status) &&
                    currentSubscription.status !== "created"
                ) {
                    set.status = 409;
                    console.log(`[subscriptions] User ${body.phone} blocked: live subscription ${currentSubscription.subscriptionId} (${currentSubscription.status})`);
                    return {
                        success: false,
                        message:
                            "You already have a live subscription. Manage or cancel it before starting another one.",
                        data: {
                            user: serializeUser(user)
                        }
                    };
                }
            }

            console.log(`[subscriptions] Creating new subscription for user ${body.phone}, plan ${body.planCode}`);
            const subscription = await createRazorpaySubscription({
                plan,
                userName: user.name,
                userPhone: user.phone
            });

            user.subscription = buildUserSubscriptionState({
                existing: user.subscription,
                subscription,
                planCode: plan.code
            });

            await user.save();

            return {
                success: true,
                message: "Subscription checkout session created.",
                data: {
                    checkout: buildCheckoutPayload({
                        user,
                        subscriptionId: subscription.id,
                        shortUrl: subscription.short_url,
                        planCode: plan.code,
                        planName: plan.title,
                        planDescription: plan.description
                    }),
                    user: serializeUser(user)
                }
            };
        } catch (error) {
            set.status = 500;
            return {
                success: false,
                message: getRazorpayServiceErrorMessage(error)
            };
        }
    }, {
        body: t.Object({
            phone: t.String({ minLength: 10 }),
            planCode: t.String({ minLength: 1 })
        })
    })
    .post("/verify", async ({ body, set }) => {
        try {
            const user = await UserModel.findOne({ phone: body.phone });

            if (!user) {
                set.status = 404;
                return {
                    success: false,
                    message: "User not found. Please log in again."
                };
            }

            const isSignatureValid = verifyRazorpaySubscriptionSignature({
                paymentId: body.paymentId,
                subscriptionId: body.subscriptionId,
                signature: body.signature
            });

            if (!isSignatureValid) {
                set.status = 400;
                return {
                    success: false,
                    message: "Razorpay payment signature verification failed."
                };
            }

            const latestSubscription = await fetchRazorpaySubscription(body.subscriptionId);

            user.subscription = buildUserSubscriptionState({
                existing: user.subscription,
                subscription: latestSubscription,
                payment: {
                    id: body.paymentId
                },
                lastSignatureVerifiedAt: new Date()
            });
            user.lastTransaction = new Date();

            await user.save();

            return {
                success: true,
                message: "Subscription payment verified.",
                data: {
                    user: serializeUser(user)
                }
            };
        } catch (error) {
            set.status = 500;
            return {
                success: false,
                message: getRazorpayServiceErrorMessage(error)
            };
        }
    }, {
        body: t.Object({
            phone: t.String({ minLength: 10 }),
            subscriptionId: t.String({ minLength: 1 }),
            paymentId: t.String({ minLength: 1 }),
            signature: t.String({ minLength: 1 })
        })
    })
    .post("/refresh", async ({ body, set }) => {
        try {
            const user = await UserModel.findOne({ phone: body.phone });

            if (!user) {
                set.status = 404;
                return {
                    success: false,
                    message: "User not found."
                };
            }

            const subscriptionState = normalizeUserSubscription(user.subscription);

            if (!subscriptionState.subscriptionId) {
                user.subscription = createEmptySubscriptionState();
                await user.save();

                return {
                    success: true,
                    data: {
                        user: serializeUser(user)
                    }
                };
            }

            const latestSubscription = await fetchRazorpaySubscription(subscriptionState.subscriptionId);
            user.subscription = buildUserSubscriptionState({
                existing: user.subscription,
                subscription: latestSubscription
            });

            await user.save();

            return {
                success: true,
                data: {
                    user: serializeUser(user)
                }
            };
        } catch (error) {
            set.status = 500;
            return {
                success: false,
                message: getRazorpayServiceErrorMessage(error)
            };
        }
    }, {
        body: t.Object({
            phone: t.String({ minLength: 10 })
        })
    })
    .post("/cancel", async ({ body, set }) => {
        try {
            const user = await UserModel.findOne({ phone: body.phone });
            const cancelAtCycleEnd = body.cancelAtCycleEnd ?? true;

            if (!user) {
                set.status = 404;
                return {
                    success: false,
                    message: "User not found."
                };
            }

            const subscriptionState = normalizeUserSubscription(user.subscription);

            if (
                !subscriptionState.subscriptionId ||
                !LIVE_SUBSCRIPTION_STATUSES.has(subscriptionState.status)
            ) {
                set.status = 400;
                return {
                    success: false,
                    message: "There is no live subscription to cancel.",
                    data: {
                        user: serializeUser(user)
                    }
                };
            }

            const latestSubscription = await cancelRazorpaySubscription(
                subscriptionState.subscriptionId,
                cancelAtCycleEnd
            );

            user.subscription = buildUserSubscriptionState({
                existing: user.subscription,
                subscription: latestSubscription,
                cancelAtCycleEnd
            });

            await user.save();

            return {
                success: true,
                message: cancelAtCycleEnd
                    ? "Subscription will stop at the end of the current billing cycle."
                    : "Subscription cancelled immediately.",
                data: {
                    user: serializeUser(user)
                }
            };
        } catch (error) {
            set.status = 500;
            return {
                success: false,
                message: getRazorpayServiceErrorMessage(error)
            };
        }
    }, {
        body: t.Object({
            phone: t.String({ minLength: 10 }),
            cancelAtCycleEnd: t.Optional(t.Boolean())
        })
    })
    .post("/webhook", async ({ request, headers, set }) => {
        const signature = headers["x-razorpay-signature"];
        const eventId = headers["x-razorpay-event-id"];
        const rawBody = await request.text();

        try {
            if (!signature) {
                set.status = 400;
                return {
                    success: false,
                    message: "Missing Razorpay webhook signature."
                };
            }

            const isWebhookValid = verifyRazorpayWebhookSignature(rawBody, signature);

            if (!isWebhookValid) {
                set.status = 401;
                return {
                    success: false,
                    message: "Invalid Razorpay webhook signature."
                };
            }

            const webhookPayload = JSON.parse(rawBody) as {
                event?: string;
                payload?: {
                    subscription?: { entity?: any };
                    payment?: { entity?: any };
                };
            };

            const subscription = webhookPayload.payload?.subscription?.entity;
            const payment = webhookPayload.payload?.payment?.entity;
            const webhookEvent = webhookPayload.event || "unknown";

            if (!subscription?.id) {
                return {
                    success: true,
                    message: "Webhook ignored because subscription payload is missing."
                };
            }

            if (eventId) {
                const existingEvent = await RazorpayWebhookEventModel.findOne({ eventId });
                if (existingEvent) {
                    return {
                        success: true,
                        duplicate: true
                    };
                }
            }

            const notePhone =
                typeof subscription.notes === "object" &&
                subscription.notes !== null &&
                !Array.isArray(subscription.notes)
                    ? String((subscription.notes as Record<string, unknown>).user_phone || "")
                    : "";

            const user =
                (await UserModel.findOne({
                    "subscription.subscriptionId": subscription.id
                })) ||
                (notePhone ? await UserModel.findOne({ phone: notePhone }) : null);

            if (!user) {
                return {
                    success: true,
                    message: "Webhook received but no matching user was found."
                };
            }

            user.subscription = buildUserSubscriptionState({
                existing: user.subscription,
                subscription,
                payment,
                lastWebhookEvent: webhookEvent,
                lastWebhookEventId: eventId || null,
                lastWebhookReceivedAt: new Date()
            });

            if (payment?.id) {
                user.lastTransaction = getSubscriptionLastTransactionAt(payment);
            }

            await user.save();

            if (eventId) {
                try {
                    await RazorpayWebhookEventModel.create({
                        eventId,
                        event: webhookEvent,
                        subscriptionId: subscription.id
                    });
                } catch (_) {
                    // Ignore duplicate key races after successful processing.
                }
            }

            return {
                success: true
            };
        } catch (error) {
            set.status = 500;
            return {
                success: false,
                message: getRazorpayServiceErrorMessage(error)
            };
        }
    });
