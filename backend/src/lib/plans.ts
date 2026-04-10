// ── Plan configuration ────────────────────────────────
// Single source of truth for feature gating and limits.

export interface PlanConfig {
  monthly_listings: number;
  ai_identify: boolean;
  pricing_suggestions: boolean;
}

export type PlanName = "free" | "pro" | "enterprise";

export const PLAN_LIMITS: Record<PlanName, PlanConfig> = {
  free: {
    monthly_listings: 10,
    ai_identify: false,
    pricing_suggestions: false,
  },
  pro: {
    monthly_listings: Infinity,
    ai_identify: true,
    pricing_suggestions: true,
  },
  enterprise: {
    monthly_listings: Infinity,
    ai_identify: true,
    pricing_suggestions: true,
  },
};

export type PlanFeature = keyof Pick<PlanConfig, "ai_identify" | "pricing_suggestions">;
