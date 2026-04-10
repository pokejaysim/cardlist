import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";
import { PLAN_LIMITS, type PlanName } from "../lib/plans.js";

const router = Router();

// ── Get user profile ───────────────────────────────────

router.get("/account", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", authReq.userId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(data);
});

// ── Update user profile ────────────────────────────────

router.put("/account", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { name } = req.body as { name?: string };

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", authReq.userId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to update profile", code: "DB_ERROR" });
    return;
  }

  res.json(data);
});

// ── Get usage stats ────────────────────────────────────

router.get("/account/usage", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  // Count listings created this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: monthlyListings } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", authReq.userId)
    .gte("created_at", startOfMonth.toISOString());

  const { count: totalListings } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", authReq.userId);

  const { count: publishedListings } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", authReq.userId)
    .eq("status", "published");

  // Fetch user plan
  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("id", authReq.userId)
    .single();

  const plan = (user?.plan ?? "free") as PlanName;
  const planLimits = PLAN_LIMITS[plan];

  res.json({
    plan,
    listings_this_month: monthlyListings ?? 0,
    listings_limit: planLimits.monthly_listings === Infinity ? null : planLimits.monthly_listings,
    total_listings: totalListings ?? 0,
    published_listings: publishedListings ?? 0,
    ai_identify: planLimits.ai_identify,
    pricing_suggestions: planLimits.pricing_suggestions,
  });
});

// ── Complete onboarding ───────────────────────────────

router.patch("/account/onboarding", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { onboarding_complete } = req.body as { onboarding_complete?: boolean };

  if (typeof onboarding_complete !== "boolean") {
    res.status(400).json({ error: "onboarding_complete must be a boolean" });
    return;
  }

  const { data, error } = await supabase
    .from("users")
    .update({ onboarding_complete })
    .eq("id", authReq.userId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to update onboarding status", code: "DB_ERROR" });
    return;
  }

  res.json(data);
});

// ── Check eBay account link status ─────────────────────

router.get("/account/ebay-status", requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  const { data } = await supabase
    .from("ebay_accounts")
    .select("ebay_user_id, site_id, created_at, refreshed_at")
    .eq("user_id", authReq.userId)
    .single();

  if (!data) {
    res.json({ linked: false });
    return;
  }

  res.json({
    linked: true,
    ebay_user_id: data.ebay_user_id,
    site_id: data.site_id,
    linked_at: data.created_at,
    refreshed_at: data.refreshed_at,
  });
});

export default router;
