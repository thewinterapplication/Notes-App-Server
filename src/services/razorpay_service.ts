import { createHmac } from "node:crypto";
import { config } from "../config";
import {
    IUserSubscription,
    UserSubscriptionStatus,
    createDefaultUserSubscription,
    normalizeUserSubscription
} from "../models/User";

type RazorpayPlanPeriod = "daily" | "weekly" | "monthly" | "yearly";

interface RazorpayPlanEntity {
    id: string;
    period: RazorpayPlanPeriod;
    interval: number;
    item: {
        name: string;
        description?: string;
        amount: number;
        currency: string;
    };
    notes?: unknown;
}

interface RazorpayPlanListResponse {
    items: RazorpayPlanEntity[];
}

export interface RazorpaySubscriptionEntity {
    id: string;
    plan_id: string;
    customer_id?: string | null;
    status: UserSubscriptionStatus;
    short_url?: string | null;
    current_start?: number | null;
    current_end?: number | null;
    charge_at?: number | null;
    start_at?: number | null;
    end_at?: number | null;
    ended_at?: number | null;
    expire_by?: number | null;
    paid_count?: number | null;
    remaining_count?: number | null;
    total_count?: number | null;
    customer_notify?: boolean;
    notes?: unknown;
}

export interface AppSubscriptionPlan {
    code: string;
    planId: string;
    title: string;
    subtitle: string;
    description: string;
    badge: string;
    accentColor: string;
    surfaceColor: string;
    popular: boolean;
    amountInPaise: number;
    introductoryAmountInPaise?: number | null;
    introductoryPeriodDays?: number | null;
    recurringAmountInPaise?: number | null;
    currency: string;
    period: RazorpayPlanPeriod;
    interval: number;
    benefits: string[];
}

interface RazorpayPaymentEntity {
    id?: string;
    method?: string | null;
    created_at?: number | null;
}

interface AppSubscriptionPlanTemplate {
    code: string;
    envKey: keyof NodeJS.ProcessEnv;
    fallbackTitle: string;
    fallbackDescription: string;
    badge: string;
    accentColor: string;
    surfaceColor: string;
    popular: boolean;
    period: RazorpayPlanPeriod;
    interval: number;
    defaultAmountInPaise: number;
    benefits: string[];
}

interface ResolvedAppSubscriptionPlanTemplate extends AppSubscriptionPlanTemplate {
    source: "plan_id" | "amount";
    planId?: string;
    amountInPaise?: number;
}

const planTemplates: AppSubscriptionPlanTemplate[] = [
    {
        code: "monthly",
        envKey: "RAZORPAY_MONTHLY_PLAN_ID",
        fallbackTitle: "Monthly Pass",
        fallbackDescription: "First month access for Rs 1, then Rs 39/month.",
        badge: "Most Popular",
        accentColor: "#FF6A3D",
        surfaceColor: "#FFF1EA",
        popular: true,
        period: "monthly",
        interval: 1,
        defaultAmountInPaise: 3900,
        benefits: [
            "First month access for Rs 1",
            "Rs 39/month from the second month",
            "UPI apps, cards and other enabled methods on checkout",
            "Manage or cancel directly from the app"
        ]
    },
    {
        code: "yearly",
        envKey: "RAZORPAY_YEARLY_PLAN_ID",
        fallbackTitle: "Yearly Pass",
        fallbackDescription: "Lower-friction long-term access with one mandate.",
        badge: "Best Value",
        accentColor: "#0E5FFF",
        surfaceColor: "#EAF1FF",
        popular: false,
        period: "yearly",
        interval: 1,
        defaultAmountInPaise: 39900,
        benefits: [
            "Secure recurring billing via Razorpay",
            "Reduced repeat checkout friction",
            "Manage or cancel directly from the app"
        ]
    }
];

const DEFAULT_MONTHLY_PLAN_CODE = "monthly";
const DEFAULT_MONTHLY_PLAN_AMOUNT_IN_PAISE = 3900;
const DEFAULT_MONTHLY_PLAN_INTERVAL = 1;
const DEFAULT_MONTHLY_PLAN_NOTES = {
    app_plan_code: DEFAULT_MONTHLY_PLAN_CODE,
    generated_by: "college_notes_backend",
    generated_default_plan: "true",
    generated_price_in_paise: String(DEFAULT_MONTHLY_PLAN_AMOUNT_IN_PAISE)
};
const LOCAL_CONFIGURED_PLAN_PREFIX = "local-configured-plan";

let cachedPlans: { expiresAt: number; plans: AppSubscriptionPlan[] } | null = null;

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000;

class RazorpayConfigError extends Error {}
class RazorpayApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

const ensureRazorpayConfig = () => {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
        throw new RazorpayConfigError("Razorpay is not configured on the backend.");
    }

    if (
        config.razorpay.testMode &&
        config.razorpay.keyId.startsWith("rzp_live_")
    ) {
        throw new RazorpayConfigError(
            "Razorpay test mode is enabled but a live key is configured."
        );
    }

    if (
        !config.razorpay.testMode &&
        config.razorpay.keyId.startsWith("rzp_test_")
    ) {
        throw new RazorpayConfigError(
            "Razorpay live mode is enabled but a test key is configured."
        );
    }
};

const buildAuthHeader = () =>
    `Basic ${Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString("base64")}`;

const normalizeNotes = (value: unknown): Record<string, string> => {
    if (!value || Array.isArray(value) || typeof value !== "object") {
        return {};
    }

    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
        (accumulator, [key, entryValue]) => {
            if (entryValue === null || entryValue === undefined) {
                return accumulator;
            }

            accumulator[key] = String(entryValue);
            return accumulator;
        },
        {}
    );
};

const toDateOrNull = (unixTime?: number | null) =>
    unixTime ? new Date(unixTime * 1000) : null;

const toDateFromUnixTextOrNull = (value?: string | null) => {
    if (!value) {
        return null;
    }

    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? toDateOrNull(timestamp) : null;
};

const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const toUnixTime = (date: Date) => Math.floor(date.getTime() / 1000);

const parseConfiguredAmountInPaise = (rawValue: string) => {
    const trimmedValue = rawValue.trim();

    if (!trimmedValue) {
        return null;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(trimmedValue)) {
        return null;
    }

    return Math.round(Number(trimmedValue) * 100);
};

const parsePositiveInteger = (rawValue: string) => {
    const trimmedValue = rawValue.trim();

    if (!/^\d+$/.test(trimmedValue)) {
        return null;
    }

    const value = Number(trimmedValue);
    return Number.isFinite(value) && value > 0 ? value : null;
};

const DEFAULT_MONTHLY_TRIAL_AMOUNT_IN_PAISE = 100; // Rs 1
const DEFAULT_MONTHLY_TRIAL_DAYS = 30;

/**
 * Resolves the monthly intro-trial offer from the environment. Both the price
 * (RAZORPAY_MONTHLY_TRIAL_AMOUNT, in rupees) and the length
 * (RAZORPAY_MONTHLY_TRIAL_DAYS, in days) are configurable. Blank, zero or
 * invalid values fall back to the defaults above, so the monthly plan always
 * carries a trial.
 */
export const resolveMonthlyIntroTrialConfig = () => {
    const parsedAmountInPaise = parseConfiguredAmountInPaise(
        process.env.RAZORPAY_MONTHLY_TRIAL_AMOUNT || ""
    );
    const parsedDays = parsePositiveInteger(
        process.env.RAZORPAY_MONTHLY_TRIAL_DAYS || ""
    );

    return {
        amountInPaise:
            parsedAmountInPaise && parsedAmountInPaise > 0
                ? parsedAmountInPaise
                : DEFAULT_MONTHLY_TRIAL_AMOUNT_IN_PAISE,
        periodDays: parsedDays ?? DEFAULT_MONTHLY_TRIAL_DAYS
    };
};

const resolveConfiguredPlanTemplates = () =>
    planTemplates
        .map<ResolvedAppSubscriptionPlanTemplate | null>((template) => {
            const rawValue = (process.env[template.envKey] || "").trim();

            if (!rawValue) {
                return null;
            }

            const configuredAmountInPaise = parseConfiguredAmountInPaise(rawValue);

            if (configuredAmountInPaise !== null) {
                return {
                    ...template,
                    source: "amount",
                    amountInPaise: configuredAmountInPaise
                };
            }

            return {
                ...template,
                source: "plan_id",
                planId: rawValue
            };
        })
        .filter((template): template is ResolvedAppSubscriptionPlanTemplate => Boolean(template));

const MAX_SUBSCRIPTION_YEARS = 29; // UPI mandates cap at 30 years

const maxTotalCountFor = (period: RazorpayPlanPeriod, interval: number) => {
    const maxMonths = MAX_SUBSCRIPTION_YEARS * 12;

    let periodsPerMonth: number;
    switch (period) {
        case "daily":
            periodsPerMonth = 30;
            break;
        case "weekly":
            periodsPerMonth = 4;
            break;
        case "monthly":
            periodsPerMonth = 1;
            break;
        case "yearly":
            periodsPerMonth = 1 / 12;
            break;
        default:
            periodsPerMonth = 1;
            break;
    }

    const count = Math.max(1, Math.floor((maxMonths * periodsPerMonth) / interval));
    console.log(`[razorpay] maxTotalCountFor(${period}, ${interval}) = ${count}`);
    return count;
};

const buildLocalConfiguredPlanId = (code: string, amountInPaise: number) =>
    `${LOCAL_CONFIGURED_PLAN_PREFIX}:${code}:${amountInPaise}`;

const parseLocalConfiguredPlanId = (planId: string) => {
    const [prefix, code, amountText] = planId.split(":");

    if (prefix !== LOCAL_CONFIGURED_PLAN_PREFIX || !code || !amountText) {
        return null;
    }

    const amountInPaise = Number(amountText);

    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
        return null;
    }

    return {
        code,
        amountInPaise
    };
};

const resolvePlanCodeFromPlanId = (planId?: string | null) => {
    if (!planId) {
        return null;
    }

    const localConfiguredPlan = parseLocalConfiguredPlanId(planId);
    if (localConfiguredPlan) {
        return localConfiguredPlan.code;
    }

    return resolveConfiguredPlanTemplates().find(
        (template) => template.source === "plan_id" && template.planId === planId
    )?.code ?? null;
};

const razorpayRequest = async <T>(
    path: string,
    init?: RequestInit
): Promise<T> => {
    ensureRazorpayConfig();

    const response = await fetch(`${RAZORPAY_API_BASE_URL}${path}`, {
        ...init,
        headers: {
            Authorization: buildAuthHeader(),
            "Content-Type": "application/json",
            ...(init?.headers ?? {})
        }
    });

    const rawBody = await response.text();
    const parsedBody = rawBody ? JSON.parse(rawBody) : null;

    if (!response.ok) {
        const apiMessage =
            parsedBody?.error?.description ||
            parsedBody?.error?.reason ||
            parsedBody?.error?.code ||
            parsedBody?.message ||
            "Razorpay request failed.";

        throw new RazorpayApiError(apiMessage, response.status);
    }

    return parsedBody as T;
};

const fetchPlanEntity = async (planId: string) =>
    razorpayRequest<RazorpayPlanEntity>(`/plans/${planId}`, {
        method: "GET"
    });

const fetchAllPlanEntities = async () => {
    const query = new URLSearchParams({
        count: "100",
        skip: "0"
    });

    const response = await razorpayRequest<RazorpayPlanListResponse>(
        `/plans?${query.toString()}`,
        {
            method: "GET"
        }
    );

    return response.items ?? [];
};

const createRazorpayPlan = async (payload: {
    period: RazorpayPlanPeriod;
    interval: number;
    amountInPaise: number;
    name: string;
    description: string;
    currency?: string;
    notes?: Record<string, string>;
}) =>
    razorpayRequest<RazorpayPlanEntity>("/plans", {
        method: "POST",
        body: JSON.stringify({
            period: payload.period,
            interval: payload.interval,
            item: {
                name: payload.name,
                description: payload.description,
                amount: payload.amountInPaise,
                currency: payload.currency || "INR"
            },
            notes: payload.notes ?? {}
        })
    });

// Only the monthly plan carries an intro trial; other periods opt out.
const introTrialForTemplate = (template: AppSubscriptionPlanTemplate) =>
    template.period === "monthly"
        ? resolveMonthlyIntroTrialConfig()
        : { amountInPaise: null, periodDays: null };

const mapPlanEntityToAppPlan = (
    template: AppSubscriptionPlanTemplate,
    entity: RazorpayPlanEntity
): AppSubscriptionPlan => {
    const introTrial = introTrialForTemplate(template);

    return {
        code: template.code,
        planId: entity.id,
        title: entity.item.name || template.fallbackTitle,
        subtitle: entity.item.description || template.fallbackDescription,
        description: entity.item.description || template.fallbackDescription,
        badge: template.badge,
        accentColor: template.accentColor,
        surfaceColor: template.surfaceColor,
        popular: template.popular,
        amountInPaise: entity.item.amount,
        introductoryAmountInPaise: introTrial.amountInPaise,
        introductoryPeriodDays: introTrial.periodDays,
        recurringAmountInPaise: entity.item.amount,
        currency: entity.item.currency || "INR",
        period: entity.period,
        interval: entity.interval,
        benefits: template.benefits
    };
};

const mapConfiguredAmountToAppPlan = (
    template: AppSubscriptionPlanTemplate,
    amountInPaise: number
): AppSubscriptionPlan => {
    const introTrial = introTrialForTemplate(template);

    return {
        code: template.code,
        planId: buildLocalConfiguredPlanId(template.code, amountInPaise),
        title: template.fallbackTitle,
        subtitle: template.fallbackDescription,
        description: template.fallbackDescription,
        badge: template.badge,
        accentColor: template.accentColor,
        surfaceColor: template.surfaceColor,
        popular: template.popular,
        amountInPaise,
        introductoryAmountInPaise: introTrial.amountInPaise,
        introductoryPeriodDays: introTrial.periodDays,
        recurringAmountInPaise: amountInPaise,
        currency: "INR",
        period: template.period,
        interval: template.interval,
        benefits: template.benefits
    };
};

const ensureGeneratedPlanForTemplate = async (
    template: AppSubscriptionPlanTemplate,
    amountInPaise: number
) => {
    const existingPlans = await fetchAllPlanEntities();
    const matchingPlan = existingPlans.find((plan) => {
        const notes = normalizeNotes(plan.notes);

        return (
            notes.generated_by === "college_notes_backend" &&
            notes.generated_default_plan === "true" &&
            notes.app_plan_code === template.code &&
            plan.period === template.period &&
            plan.interval === template.interval &&
            plan.item.amount === amountInPaise
        );
    });

    if (matchingPlan) {
        return mapPlanEntityToAppPlan(template, matchingPlan);
    }

    const createdPlan = await createRazorpayPlan({
        period: template.period,
        interval: template.interval,
        amountInPaise,
        name: `${config.razorpay.brandName} ${template.code === "yearly" ? "Yearly" : "Monthly"}`,
        description: template.fallbackDescription,
        notes: {
            generated_by: "college_notes_backend",
            generated_default_plan: "true",
            app_plan_code: template.code,
            generated_price_in_paise: String(amountInPaise)
        }
    });

    return mapPlanEntityToAppPlan(template, createdPlan);
};

const ensureDefaultMonthlyPlan = async () => {
    const monthlyTemplate = planTemplates.find(
        (template) => template.code === DEFAULT_MONTHLY_PLAN_CODE
    );

    if (!monthlyTemplate) {
        throw new RazorpayConfigError("Monthly plan template is missing.");
    }

    const existingPlans = await fetchAllPlanEntities();
    const matchingPlan = existingPlans.find((plan) => {
        const notes = normalizeNotes(plan.notes);

        return (
            notes.generated_by === DEFAULT_MONTHLY_PLAN_NOTES.generated_by &&
            notes.generated_default_plan === DEFAULT_MONTHLY_PLAN_NOTES.generated_default_plan &&
            notes.app_plan_code === DEFAULT_MONTHLY_PLAN_NOTES.app_plan_code &&
            plan.period === "monthly" &&
            plan.interval === DEFAULT_MONTHLY_PLAN_INTERVAL &&
            plan.item.amount === DEFAULT_MONTHLY_PLAN_AMOUNT_IN_PAISE
        );
    });

    if (matchingPlan) {
        return mapPlanEntityToAppPlan(monthlyTemplate, matchingPlan);
    }

    const createdPlan = await createRazorpayPlan({
        period: "monthly",
        interval: DEFAULT_MONTHLY_PLAN_INTERVAL,
        amountInPaise: DEFAULT_MONTHLY_PLAN_AMOUNT_IN_PAISE,
        name: `${config.razorpay.brandName} Monthly`,
        description: "Starter monthly membership billed securely via Razorpay.",
        notes: DEFAULT_MONTHLY_PLAN_NOTES
    });

    return mapPlanEntityToAppPlan(monthlyTemplate, createdPlan);
};

export const getAppSubscriptionPlans = async (forceRefresh = false) => {
    if (!forceRefresh && cachedPlans && cachedPlans.expiresAt > Date.now()) {
        return cachedPlans.plans;
    }

    const configuredPlanTemplates = resolveConfiguredPlanTemplates();

    if (!configuredPlanTemplates.length) {
        const defaultPlan = await ensureDefaultMonthlyPlan();
        cachedPlans = {
            plans: [defaultPlan],
            expiresAt: Date.now() + PLAN_CACHE_TTL_MS
        };
        return cachedPlans.plans;
    }

    const planEntities = await Promise.all(
        configuredPlanTemplates.map(async (template) => {
            if (template.source === "amount") {
                return mapConfiguredAmountToAppPlan(
                    template,
                    template.amountInPaise ?? template.defaultAmountInPaise
                );
            }

            return mapPlanEntityToAppPlan(
                template,
                await fetchPlanEntity(template.planId || "")
            );
        })
    );

    const plans = planEntities;

    cachedPlans = {
        plans,
        expiresAt: Date.now() + PLAN_CACHE_TTL_MS
    };

    return plans;
};

export const getAppSubscriptionPlanByCode = async (planCode: string) => {
    const plans = await getAppSubscriptionPlans();
    return plans.find((plan) => plan.code === planCode) ?? null;
};

export const createRazorpaySubscription = async (args: {
    plan: AppSubscriptionPlan;
    userName: string;
    userPhone: string;
    introTrialEligible: boolean;
}) => {
    const localConfiguredPlan = parseLocalConfiguredPlanId(args.plan.planId);
    const resolvedPlanId = localConfiguredPlan
        ? (await ensureGeneratedPlanForTemplate(
            planTemplates.find((template) => template.code === localConfiguredPlan.code) ||
                planTemplates[0],
            localConfiguredPlan.amountInPaise
        )).planId
        : args.plan.planId;

    const totalCount = maxTotalCountFor(args.plan.period, args.plan.interval);
    const expireBy = Math.floor(Date.now() / 1000) + 20 * 60;
    const introTrialAmountInPaise =
        args.introTrialEligible && args.plan.period === "monthly"
            ? args.plan.introductoryAmountInPaise ?? null
            : null;
    const introTrialDays =
        introTrialAmountInPaise !== null
            ? args.plan.introductoryPeriodDays ?? DEFAULT_MONTHLY_TRIAL_DAYS
            : null;
    const introTrialStartedAt = new Date();
    const introTrialEndsAt = introTrialDays
        ? addDays(introTrialStartedAt, introTrialDays)
        : null;

    console.log(`[razorpay] Creating subscription: plan_id=${resolvedPlanId}, total_count=${totalCount}, expire_by=${expireBy}, period=${args.plan.period}, interval=${args.plan.interval}, intro_trial=${Boolean(introTrialEndsAt)}, user=${args.userPhone}`);

    const result = await razorpayRequest<RazorpaySubscriptionEntity>("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
            plan_id: resolvedPlanId,
            total_count: totalCount,
            quantity: 1,
            customer_notify: true,
            expire_by: expireBy,
            ...(introTrialEndsAt
                ? {
                    start_at: toUnixTime(introTrialEndsAt),
                    addons: [
                        {
                            item: {
                                name: "Introductory first month access",
                                amount: introTrialAmountInPaise,
                                currency: args.plan.currency || "INR"
                            }
                        }
                    ]
                }
                : {}),
            notes: {
                app_name: config.razorpay.brandName,
                app_plan_code: args.plan.code,
                user_name: args.userName,
                user_phone: args.userPhone,
                app_intro_trial: introTrialEndsAt ? "true" : "false",
                app_intro_trial_amount_in_paise: introTrialAmountInPaise
                    ? String(introTrialAmountInPaise)
                    : "",
                app_intro_trial_started_at: introTrialEndsAt
                    ? String(toUnixTime(introTrialStartedAt))
                    : "",
                app_intro_trial_ends_at: introTrialEndsAt
                    ? String(toUnixTime(introTrialEndsAt))
                    : "",
                app_recurring_amount_in_paise: String(args.plan.amountInPaise)
            }
        })
    });

    console.log(`[razorpay] Subscription created: id=${result.id}, status=${result.status}, short_url=${result.short_url}`);
    return result;
};

export const fetchRazorpaySubscription = async (subscriptionId: string) =>
    razorpayRequest<RazorpaySubscriptionEntity>(`/subscriptions/${subscriptionId}`, {
        method: "GET"
    });

export const cancelRazorpaySubscription = async (
    subscriptionId: string,
    cancelAtCycleEnd: boolean
) =>
    razorpayRequest<RazorpaySubscriptionEntity>(`/subscriptions/${subscriptionId}/cancel`, {
        method: "POST",
        body: JSON.stringify({
            cancel_at_cycle_end: cancelAtCycleEnd
        })
    });

export const verifyRazorpaySubscriptionSignature = (args: {
    paymentId: string;
    subscriptionId: string;
    signature: string;
}) => {
    ensureRazorpayConfig();

    const expectedSignature = createHmac("sha256", config.razorpay.keySecret)
        .update(`${args.paymentId}|${args.subscriptionId}`)
        .digest("hex");

    return expectedSignature === args.signature;
};

export const verifyRazorpayWebhookSignature = (rawBody: string, signature: string) => {
    if (!config.razorpay.webhookSecret) {
        throw new RazorpayConfigError("Razorpay webhook secret is not configured.");
    }

    const expectedSignature = createHmac("sha256", config.razorpay.webhookSecret)
        .update(rawBody)
        .digest("hex");

    return expectedSignature === signature;
};

export const hasUsedSubscriptionOffer = (subscription: IUserSubscription) =>
    subscription.introTrialUsed ||
    subscription.paidCount > 0 ||
    Boolean(subscription.lastPaymentId) ||
    Boolean(subscription.subscriptionId && subscription.status !== "created");

export const buildUserSubscriptionState = (args: {
    existing?: Partial<IUserSubscription> | null;
    subscription: RazorpaySubscriptionEntity;
    planCode?: string | null;
    payment?: RazorpayPaymentEntity | null;
    lastWebhookEvent?: string | null;
    lastWebhookEventId?: string | null;
    lastWebhookReceivedAt?: Date | null;
    lastSignatureVerifiedAt?: Date | null;
    cancelAtCycleEnd?: boolean;
}) => {
    const existingState = normalizeUserSubscription(args.existing);
    const notes = normalizeNotes(args.subscription.notes);
    const fallbackPlanCode = resolvePlanCodeFromPlanId(args.subscription.plan_id);
    const introTrialWasRequested = notes.app_intro_trial === "true";
    const introTrialIsConsumed =
        introTrialWasRequested &&
        args.subscription.status !== "none" &&
        args.subscription.status !== "created";
    const introTrialUsed = existingState.introTrialUsed || introTrialIsConsumed;
    const introTrialStartedAt =
        toDateFromUnixTextOrNull(notes.app_intro_trial_started_at) ??
        existingState.introTrialStartedAt;
    const introTrialEndsAt =
        toDateFromUnixTextOrNull(notes.app_intro_trial_ends_at) ??
        existingState.introTrialEndsAt;
    const introTrialAmountInPaise =
        Number(notes.app_intro_trial_amount_in_paise) ||
        existingState.introTrialAmountInPaise;
    const recurringAmountInPaise =
        Number(notes.app_recurring_amount_in_paise) ||
        existingState.recurringAmountInPaise;

    return normalizeUserSubscription({
        ...existingState,
        planCode:
            args.planCode ??
            notes.app_plan_code ??
            existingState.planCode ??
            fallbackPlanCode,
        planId: args.subscription.plan_id || existingState.planId,
        subscriptionId: args.subscription.id,
        status: args.subscription.status || existingState.status,
        shortUrl: args.subscription.short_url ?? existingState.shortUrl,
        customerId: args.subscription.customer_id ?? existingState.customerId,
        lastPaymentId: args.payment?.id ?? existingState.lastPaymentId,
        lastPaymentMethod: args.payment?.method ?? existingState.lastPaymentMethod,
        currentStart: toDateOrNull(args.subscription.current_start) ?? existingState.currentStart,
        currentEnd: toDateOrNull(args.subscription.current_end) ?? existingState.currentEnd,
        chargeAt: toDateOrNull(args.subscription.charge_at) ?? existingState.chargeAt,
        startAt: toDateOrNull(args.subscription.start_at) ?? existingState.startAt,
        endAt: toDateOrNull(args.subscription.end_at) ?? existingState.endAt,
        endedAt: toDateOrNull(args.subscription.ended_at) ?? existingState.endedAt,
        expireBy: toDateOrNull(args.subscription.expire_by) ?? existingState.expireBy,
        paidCount: args.subscription.paid_count ?? existingState.paidCount,
        remainingCount: args.subscription.remaining_count ?? existingState.remainingCount,
        totalCount: args.subscription.total_count ?? existingState.totalCount,
        customerNotify: args.subscription.customer_notify ?? existingState.customerNotify,
        notes,
        lastWebhookEvent: args.lastWebhookEvent ?? existingState.lastWebhookEvent,
        lastWebhookEventId: args.lastWebhookEventId ?? existingState.lastWebhookEventId,
        lastWebhookReceivedAt:
            args.lastWebhookReceivedAt ?? existingState.lastWebhookReceivedAt,
        lastSignatureVerifiedAt:
            args.lastSignatureVerifiedAt ?? existingState.lastSignatureVerifiedAt,
        cancelAtCycleEnd: args.cancelAtCycleEnd ?? existingState.cancelAtCycleEnd,
        introTrialUsed,
        introTrialActive:
            introTrialUsed &&
            Boolean(introTrialEndsAt) &&
            new Date(introTrialEndsAt as Date).getTime() > Date.now(),
        introTrialStartedAt: introTrialUsed
            ? introTrialStartedAt
            : existingState.introTrialStartedAt,
        introTrialEndsAt: introTrialUsed
            ? introTrialEndsAt
            : existingState.introTrialEndsAt,
        introTrialAmountInPaise,
        recurringAmountInPaise,
        updatedAt: new Date()
    });
};

export const buildPublicSubscriptionConfig = () => ({
    keyId: config.razorpay.keyId,
    testMode: config.razorpay.testMode,
    brandName: config.razorpay.brandName,
    themeColor: config.razorpay.themeColor
});

export const getRazorpayServiceErrorMessage = (error: unknown) => {
    if (error instanceof RazorpayApiError || error instanceof RazorpayConfigError) {
        return error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "Unable to complete Razorpay request.";
};

export const getSubscriptionLastTransactionAt = (
    payment?: RazorpayPaymentEntity | null
) => toDateOrNull(payment?.created_at) ?? new Date();

export const createEmptySubscriptionState = () => createDefaultUserSubscription();

// ── One-time Order helpers (used for paid guidance bookings) ──────────────────

interface RazorpayOrderEntity {
    id: string;
    amount: number;
    currency: string;
    status: string;
    receipt?: string;
}

export const createRazorpayOrder = async (args: {
    amountInPaise: number;
    receipt: string;
    notes?: Record<string, string>;
}): Promise<RazorpayOrderEntity> => {
    ensureRazorpayConfig();
    const body = {
        amount: args.amountInPaise,
        currency: "INR",
        receipt: args.receipt,
        notes: args.notes ?? {},
    };
    const response = await fetch(`${RAZORPAY_API_BASE_URL}/orders`, {
        method: "POST",
        headers: {
            Authorization: buildAuthHeader(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new RazorpayApiError(`Razorpay order creation failed: ${text}`, response.status);
    }
    return response.json() as Promise<RazorpayOrderEntity>;
};

export const verifyRazorpayOrderSignature = (args: {
    orderId: string;
    paymentId: string;
    signature: string;
}): boolean => {
    ensureRazorpayConfig();
    const expected = createHmac("sha256", config.razorpay.keySecret)
        .update(`${args.orderId}|${args.paymentId}`)
        .digest("hex");
    return expected === args.signature;
};
