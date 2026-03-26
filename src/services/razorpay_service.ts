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
        fallbackDescription: "Flexible monthly billing with Razorpay Checkout.",
        badge: "Most Popular",
        accentColor: "#FF6A3D",
        surfaceColor: "#FFF1EA",
        popular: true,
        period: "monthly",
        interval: 1,
        defaultAmountInPaise: 3000,
        benefits: [
            "Secure recurring billing via Razorpay",
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
const DEFAULT_MONTHLY_PLAN_AMOUNT_IN_PAISE = 3000;
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

const maxTotalCountFor = (period: RazorpayPlanPeriod, interval: number) => {
    switch (period) {
        case "daily":
            return Math.max(1, Math.floor(36500 / interval));
        case "weekly":
            return Math.max(1, Math.floor(5200 / interval));
        case "monthly":
            return Math.max(1, Math.floor(1200 / interval));
        case "yearly":
            return Math.max(1, Math.floor(100 / interval));
        default:
            return 120;
    }
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

const mapPlanEntityToAppPlan = (
    template: AppSubscriptionPlanTemplate,
    entity: RazorpayPlanEntity
): AppSubscriptionPlan => ({
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
    currency: entity.item.currency || "INR",
    period: entity.period,
    interval: entity.interval,
    benefits: template.benefits
});

const mapConfiguredAmountToAppPlan = (
    template: AppSubscriptionPlanTemplate,
    amountInPaise: number
): AppSubscriptionPlan => ({
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
    currency: "INR",
    period: template.period,
    interval: template.interval,
    benefits: template.benefits
});

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
}) => {
    const localConfiguredPlan = parseLocalConfiguredPlanId(args.plan.planId);
    const resolvedPlanId = localConfiguredPlan
        ? (await ensureGeneratedPlanForTemplate(
            planTemplates.find((template) => template.code === localConfiguredPlan.code) ||
                planTemplates[0],
            localConfiguredPlan.amountInPaise
        )).planId
        : args.plan.planId;

    return razorpayRequest<RazorpaySubscriptionEntity>("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
            plan_id: resolvedPlanId,
            total_count: maxTotalCountFor(args.plan.period, args.plan.interval),
            quantity: 1,
            customer_notify: true,
            expire_by: Math.floor(Date.now() / 1000) + 20 * 60,
            notes: {
                app_name: config.razorpay.brandName,
                app_plan_code: args.plan.code,
                user_name: args.userName,
                user_phone: args.userPhone
            }
        })
    });
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
        updatedAt: new Date()
    });
};

export const buildPublicSubscriptionConfig = () => ({
    keyId: config.razorpay.keyId,
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
