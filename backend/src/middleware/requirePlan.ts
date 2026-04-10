import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.js";
import { supabase } from "../lib/supabase.js";
import { PLAN_LIMITS, type PlanFeature, type PlanName } from "../lib/plans.js";

const FEATURE_LABELS: Record<PlanFeature, string> = {
  ai_identify: "AI card identification",
  pricing_suggestions: "pricing suggestions",
};

/**
 * Middleware factory that gates a route behind a plan feature.
 * Must be used after `requireAuth`.
 */
export function requirePlan(feature: PlanFeature) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const authReq = req as AuthenticatedRequest;

    const { data: user } = await supabase
      .from("users")
      .select("plan")
      .eq("id", authReq.userId)
      .single();

    const plan = (user?.plan ?? "free") as PlanName;
    const limits = PLAN_LIMITS[plan];

    if (!limits[feature]) {
      const label = FEATURE_LABELS[feature];
      res.status(403).json({
        error: `Upgrade to Pro to use ${label}`,
        code: "PLAN_REQUIRED",
      });
      return;
    }

    next();
  };
}
